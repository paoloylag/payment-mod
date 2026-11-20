"""Opt-in, read-only Procurement vendor service client. No database synchronization."""

import json
import os
from urllib.error import HTTPError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from fastapi import HTTPException


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def configuration():
    url = os.environ.get("PROCUREMENT_VENDOR_API_URL", "").rstrip("/")
    token = os.environ.get("PROCUREMENT_VENDOR_READ_TOKEN", "")
    if not url and not token:
        return None
    target = urlsplit(url)
    if (
        len(token) < 32
        or not target.hostname
        or target.username
        or target.password
        or target.query
        or target.fragment
        or target.scheme != "https"
        and not (target.scheme == "http" and target.hostname in {"127.0.0.1", "localhost", "::1"})
    ):
        raise HTTPException(503, "Procurement vendor connection is not configured correctly")
    return url, token


def fetch(url, token, missing_ok=False):
    try:
        request = Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
        with build_opener(NoRedirect()).open(request, timeout=5) as response:
            if response.status != 200:
                raise ValueError("Unexpected provider status")
            body = response.read(1048577)
            if len(body) > 1048576:
                raise ValueError("Provider response too large")
            return json.loads(body)
    except HTTPError as exc:
        if missing_ok and exc.code == 404:
            return None
        raise HTTPException(503, "Procurement vendor information is temporarily unavailable") from exc
    except Exception as exc:
        raise HTTPException(503, "Procurement vendor information is temporarily unavailable") from exc


def project(item):
    if not isinstance(item, dict) or not all(isinstance(item.get(k), str) and item[k] for k in ("id", "name", "email")):
        raise HTTPException(503, "Procurement returned invalid vendor information")
    # Explicit allowlist: do not trust arbitrary provider profile fields.
    return {
        "id": "procurement:" + item["id"],
        "provider_id": item["id"],
        "source": "procurement",
        **{
            key: item.get(key, "")
            for key in ("name", "email", "contactPerson", "phone", "address", "taxId", "qualificationStatus")
        },
        "is_active": item.get("is_active") is True,
        "version": item.get("version", 1),
        "street": item.get("address", ""),
        "informationStatus": "Information complete",
        "businessDocuments": [],
    }


def vendors(search="", active_only=True):
    config = configuration()
    if config is None:
        return []
    base, token = config
    result, cursor, seen = [], "", set()
    for _ in range(100):
        page = fetch(
            base
            + "?"
            + urlencode({"q": search, "activeOnly": str(active_only).lower(), "limit": 100, "cursor": cursor}),
            token,
        )
        if not isinstance(page, dict) or not isinstance(page.get("items"), list) or len(page["items"]) > 100:
            raise HTTPException(503, "Procurement returned an invalid vendor list")
        result.extend(project(item) for item in page["items"])
        cursor = page.get("nextCursor")
        if cursor is None:
            return result
        if not isinstance(cursor, str) or not cursor or cursor in seen:
            break
        seen.add(cursor)
    raise HTTPException(503, "Procurement vendor list could not be completed")


def vendor(vendor_id):
    config = configuration()
    if not config or not vendor_id.startswith("procurement:"):
        return None
    base, token = config
    item = fetch(base + "/" + quote(vendor_id.removeprefix("procurement:"), safe=""), token, missing_ok=True)
    return project(item) if item is not None else None
