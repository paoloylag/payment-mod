import hashlib
import tempfile
from pathlib import Path
from urllib.parse import quote
from uuid import UUID, uuid4

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..audit import audit
from ..config import get_settings
from ..database import get_db
from ..models import Document, DocumentVersion, PaymentRequest, PaymentRequestLine, User
from ..routers.requests import get_visible, permissions, visible_query
from ..security import current_user
from ..storage import get_storage

router = APIRouter(prefix="/api/v1", tags=["documents"])
settings = get_settings()
ALLOWED = {
    ".pdf": {"application/pdf"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    ".xls": {"application/vnd.ms-excel"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    ".doc": {"application/msword"},
}
SIGNATURES = {
    ".pdf": (b"%PDF-",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".xlsx": (b"PK\x03\x04",),
    ".docx": (b"PK\x03\x04",),
    ".xls": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
    ".doc": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
}


def _current_version(db: Session, document: Document) -> DocumentVersion:
    item = db.scalar(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document.id, DocumentVersion.version == document.current_version
        )
    )
    if not item:
        raise HTTPException(409, "Document version metadata is incomplete")
    return item


def _serialize(db: Session, request: Request, actor: User, document: Document) -> dict:
    current = _current_version(db, document)
    duplicates = list(
        db.execute(
            select(Document.request_id, DocumentVersion.document_id)
            .join(Document, Document.id == DocumentVersion.document_id)
            .where(
                DocumentVersion.sha256 == current.sha256,
                DocumentVersion.is_current.is_(True),
                DocumentVersion.document_id != document.id,
                Document.request_id.in_(visible_query(request, actor).with_only_columns(PaymentRequest.id)),
            )
        )
    )
    request_numbers = {
        item.id: item.request_number
        for item in db.scalars(
            visible_query(request, actor).where(PaymentRequest.id.in_([row[0] for row in duplicates]))
        )
    }
    versions = list(
        db.scalars(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == document.id)
            .order_by(DocumentVersion.version.desc())
        )
    )
    return {
        "id": str(document.id),
        "request_id": str(document.request_id),
        "line_id": str(document.line_id) if document.line_id else None,
        "current_version": document.current_version,
        "filename": current.original_filename,
        "media_type": current.media_type,
        "byte_size": current.byte_size,
        "sha256": current.sha256,
        "state": current.state,
        "previewable": current.media_type == "application/pdf" or current.media_type.startswith("image/"),
        "duplicate_warning": bool(duplicates),
        "duplicate_uses": [
            {"request_id": str(request_id), "request_number": request_numbers.get(request_id)}
            for request_id, _ in duplicates
        ],
        "versions": [
            {
                "version": item.version,
                "filename": item.original_filename,
                "media_type": item.media_type,
                "byte_size": item.byte_size,
                "sha256": item.sha256,
                "state": item.state,
                "created_at": item.created_at.isoformat(),
            }
            for item in versions
        ],
    }


def _ensure_mutable(item, actor: User) -> None:
    if item.requestor_id != actor.id or item.status not in {"draft", "returned"}:
        raise HTTPException(409, "Documents can be changed only by the requestor while draft or returned")


def _require(request: Request, code: str) -> None:
    if code not in permissions(request):
        raise HTTPException(403, f"Permission required: {code}")


def _validate_context(db: Session, request_item, line_id: UUID | None) -> None:
    if line_id and not db.scalar(
        select(PaymentRequestLine.id).where(
            PaymentRequestLine.id == line_id, PaymentRequestLine.request_id == request_item.id
        )
    ):
        raise HTTPException(422, "The selected request line does not belong to this request")


def _prepare(file: UploadFile):
    submitted_name = file.filename or ""
    filename = Path(submitted_name).name
    suffix = Path(filename).suffix.lower()
    media_type = (file.content_type or "").lower()
    if (
        not filename
        or filename != submitted_name
        or "/" in submitted_name
        or "\\" in submitted_name
        or suffix not in ALLOWED
        or media_type not in ALLOWED[suffix]
    ):
        raise HTTPException(422, "Unsupported file extension or media type")
    limit = settings.document_max_file_mb * 1024 * 1024
    total = 0
    digest = hashlib.sha256()
    signature = b""
    spool = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024)
    while chunk := file.file.read(1024 * 1024):
        total += len(chunk)
        if total > limit:
            spool.close()
            raise HTTPException(413, f"File exceeds the {settings.document_max_file_mb} MB limit")
        digest.update(chunk)
        if len(signature) < 16:
            signature += chunk[: 16 - len(signature)]
        spool.write(chunk)
    if total == 0:
        spool.close()
        raise HTTPException(422, "Empty files are not allowed")
    if not any(signature.startswith(prefix) for prefix in SIGNATURES[suffix]):
        spool.close()
        raise HTTPException(422, "File content does not match its declared format")
    spool.seek(0)
    return filename, media_type, total, digest.hexdigest(), spool


def _aggregate_size(db: Session, request_id: UUID) -> int:
    return int(
        db.scalar(
            select(func.coalesce(func.sum(DocumentVersion.byte_size), 0))
            .join(Document, Document.id == DocumentVersion.document_id)
            .where(Document.request_id == request_id, DocumentVersion.is_current.is_(True))
        )
        or 0
    )


def _store_version(db, request, actor, document, version, file, replaced_size=0):
    filename, media_type, byte_size, checksum, spool = _prepare(file)
    if (
        _aggregate_size(db, document.request_id) - replaced_size + byte_size
        > settings.document_max_request_mb * 1024 * 1024
    ):
        spool.close()
        raise HTTPException(413, f"Request documents exceed the {settings.document_max_request_mb} MB limit")
    version_id = uuid4()
    key = f"available/{document.request_id}/{document.id}/{version_id}"
    storage = get_storage()
    try:
        storage_version_id = storage.put(key, spool, media_type, checksum)
    except (BotoCoreError, ClientError, OSError):
        raise HTTPException(503, "Document storage is temporarily unavailable") from None
    finally:
        spool.close()
    item = DocumentVersion(
        id=version_id,
        document_id=document.id,
        version=version,
        original_filename=filename,
        media_type=media_type,
        byte_size=byte_size,
        sha256=checksum,
        bucket=storage.bucket,
        object_key=key,
        storage_version_id=storage_version_id,
        uploaded_by_user_id=actor.id,
    )
    db.add(item)
    try:
        audit(
            db,
            actor_id=actor.id,
            action="document.uploaded" if version == 1 else "document.replaced",
            entity_type="document",
            entity_id=document.id,
            request_id=getattr(request.state, "request_id", None),
            after={"version": version, "sha256": checksum, "byte_size": byte_size},
        )
        db.commit()
    except Exception:
        db.rollback()
        try:
            storage.delete(key, storage_version_id)
        except Exception:
            pass
        raise
    return item


@router.post("/requests/{request_id}/documents", status_code=201)
def upload_document(
    request_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    line_id: UUID | None = Form(None),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    _require(request, "documents.manage_own")
    request_item = get_visible(db, request, actor, request_id, lock_for_update=True)
    _ensure_mutable(request_item, actor)
    _validate_context(db, request_item, line_id)
    document = Document(request_id=request_id, line_id=line_id, owner_user_id=actor.id)
    db.add(document)
    db.flush()
    _store_version(db, request, actor, document, 1, file)
    db.refresh(document)
    return _serialize(db, request, actor, document)


@router.get("/requests/{request_id}/documents")
def list_documents(
    request_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    _require(request, "documents.read")
    get_visible(db, request, actor, request_id)
    return [
        _serialize(db, request, actor, item)
        for item in db.scalars(select(Document).where(Document.request_id == request_id).order_by(Document.created_at))
    ]


@router.get("/documents/{document_id}/content")
def document_content(
    document_id: UUID,
    request: Request,
    download: bool = False,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    _require(request, "documents.read")
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(404, "Document not found")
    get_visible(db, request, actor, document.request_id)
    version = _current_version(db, document)
    try:
        body = get_storage().open(version.object_key, version.storage_version_id)
    except (BotoCoreError, ClientError, OSError):
        raise HTTPException(503, "Document storage is temporarily unavailable") from None
    disposition = (
        "attachment"
        if download or not (version.media_type == "application/pdf" or version.media_type.startswith("image/"))
        else "inline"
    )
    headers = {
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(version.original_filename)}",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
    }

    def chunks():
        try:
            yield from body.iter_chunks(chunk_size=1024 * 1024)
        finally:
            body.close()

    return StreamingResponse(chunks(), media_type=version.media_type, headers=headers)


@router.post("/documents/{document_id}/versions", status_code=201)
def replace_document(
    document_id: UUID,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    _require(request, "documents.manage_own")
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(404, "Document not found")
    request_item = get_visible(db, request, actor, document.request_id, lock_for_update=True)
    document = db.scalar(select(Document).where(Document.id == document_id).with_for_update())
    _ensure_mutable(request_item, actor)
    previous = _current_version(db, document)
    previous.is_current = False
    document.current_version += 1
    _store_version(db, request, actor, document, document.current_version, file, previous.byte_size)
    db.refresh(document)
    return _serialize(db, request, actor, document)
