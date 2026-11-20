"""Add local-only Finance examples using normal workflow/accounting API commands.
Never edits existing requests or Finance configuration. Re-running skips samples.
"""

import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, uuid4, uuid5

from sqlalchemy import select

from . import seed_department_head_requests as fixtures
from .config import get_settings
from .database import SessionLocal
from .finance_configuration import active_configuration, apply_submission, request_coding, save_coding
from .models import AuthSession, CostCenter, PaymentRequest, User
from .security import create_session

SAMPLES = [
    ("930001", "EWT and accounting draft", "2240.00", True),
    ("930002", "Posted accounting ready for voucher", "11200.00", True),
    ("930003", "Issued voucher ready for payment", "56000.00", True),
]


def run():
    settings = get_settings()
    if settings.app_env != "local":
        raise RuntimeError("Finance examples are restricted to local development")
    with SessionLocal() as db:
        if active_configuration(db) is None:
            raise RuntimeError("Finance must activate its configuration first; this helper will not change setup")
        existing = {
            str(row.id)
            for row in db.scalars(select(PaymentRequest))
            if (row.type_data or {}).get("finance_example_complete")
        }
        center = db.scalar(select(CostCenter).where(CostCenter.code == "MKTG"))
        head_id = center.approver_user_id
    original = fixtures.SAMPLES
    try:
        fixtures.SAMPLES = SAMPLES
        fixtures.seed_department_head_requests()
    finally:
        fixtures.SAMPLES = original
    sessions = []

    def client(user_id=None, email=None):
        with SessionLocal.begin() as db:
            user = db.get(User, user_id) if user_id else db.scalar(select(User).where(User.email == email))
            if not user or not user.is_active or user.is_suspended:
                raise RuntimeError("Active distinct demo Finance users are required")
            session, token, csrf = create_session(db, user)
            sessions.append(session.id)

        def call(path, body=None):
            headers = {
                "Cookie": f"{settings.session_cookie_name}={token}; aps_csrf={csrf}",
                "X-CSRF-Token": csrf,
                "Content-Type": "application/json",
                "Idempotency-Key": str(uuid4()),
            }
            req = Request(
                "http://127.0.0.1:8002/api/v1" + path,
                data=json.dumps(body).encode() if body is not None else None,
                headers=headers,
            )
            try:
                with urlopen(req, timeout=30) as response:
                    return json.load(response)
            except HTTPError as error:
                raise RuntimeError(f"{path}: {error.code} {error.read().decode()}") from error

        return call

    result = []
    try:
        head = client(user_id=head_id)
        fa = client(email="finance.associate@payment.local")
        fm = client(email="finance.manager@payment.local")
        for index, (number, label, _amount, _budgeted) in enumerate(SAMPLES):
            rid = uuid5(NAMESPACE_URL, f"department-head-review/MKTG/{number}")
            if str(rid) in existing:
                result.append({"request": f"GEN-2026-{number}", "result": "existing unchanged"})
                continue
            with SessionLocal.begin() as db:
                item = db.get(PaymentRequest, rid)
                item.purpose = f"DEMO - Finance: {label}"
                if not request_coding(db, item):
                    config = apply_submission(db, item)
                    save_coding(db, item, config)
            route = head(f"/workflow/{rid}")
            if route["current_stage"] == 0:
                head(
                    f"/workflow/{rid}/approve",
                    {"version": route["version"], "note": "DEMO - Department approval for Finance sample"},
                )
            tax = fa(f"/finance-tax/{rid}")
            if tax.get("blocker"):
                raise RuntimeError(tax["blocker"])
            if not tax.get("saved"):
                tax = fa(
                    f"/finance-tax/{rid}",
                    {
                        "request_version": tax["request_version"],
                        "version": tax["version"],
                        "reason": "DEMO - Apply configured tax defaults",
                    },
                )
            validation = fa(f"/finance-validation/{rid}")
            for doc in validation["documents"]:
                if doc.get("decision") != "accepted":
                    fa(
                        f"/documents/{doc['document_id']}/reviews",
                        {"decision": "accepted", "comment": "DEMO - Sample supporting document accepted"},
                    )
            for line in validation["lines"]:
                if line["decision"] != "accepted":
                    fa(
                        f"/finance-validation/{rid}/lines/{line['line_id']}/reviews",
                        {
                            "request_version": tax["request_version"],
                            "decision": "accepted",
                            "reason": "DEMO - Line and attached documents accepted",
                        },
                    )
            acct = fa(f"/finance-accounting/{rid}")
            body = {
                "request_version": acct["request_version"],
                "version": acct["version"],
                "tax_version": acct["tax_version"],
                "reason": "DEMO - Prepare accounting from configured accounts",
            }
            draft = acct.get("saved") or fa(f"/finance-accounting/{rid}/draft", body)
            if index:
                route = fa(f"/workflow/{rid}")
                fa(
                    f"/workflow/{rid}/approve",
                    {"version": route["version"], "note": "DEMO - Finance validation complete"},
                )
                route = fm(f"/workflow/{rid}")
                fm(f"/workflow/{rid}/approve", {"version": route["version"], "note": "DEMO - Final Finance approval"})
                posted = fm(
                    f"/finance-accounting/{rid}/post",
                    {**body, "version": draft["version"], "reason": "DEMO - Post balanced sample accounting"},
                )
                if index == 2:
                    fa(
                        f"/finance-accounting/{rid}/voucher",
                        {**body, "version": posted["version"], "reason": "DEMO - Prepare sample voucher"},
                    )
                    voucher = fm(f"/finance-vouchers/{rid}")
                    fm(
                        f"/finance-vouchers/{rid}/issue",
                        {
                            "request_version": voucher["request_version"],
                            "version": voucher["version"],
                            "setup_version": voucher["setup_version"],
                            "reason": "DEMO - Certify sample voucher",
                        },
                    )
            with SessionLocal.begin() as db:
                item = db.get(PaymentRequest, rid)
                item.type_data = {**item.type_data, "finance_example_complete": True}
            result.append({"request": f"GEN-2026-{number}", "result": label})
    finally:
        with SessionLocal.begin() as db:
            for sid in sessions:
                session = db.get(AuthSession, sid)
                if session:
                    db.delete(session)
    return result


if __name__ == "__main__":
    print(json.dumps(run()))
