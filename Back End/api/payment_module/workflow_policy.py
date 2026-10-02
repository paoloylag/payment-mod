"""Provisional Phase 05 approval route copied from the frontend prototype.

This module computes a preview only. It must not be used to advance a request
until assignments, decisions, and policy snapshots are persisted atomically.
"""

from dataclasses import dataclass
from decimal import Decimal

POLICY_VERSION = "prototype-2026-09-29-r3"
SUPPORTED_REQUEST_TYPES = {"reimbursement", "cashAdvance", "liquidation", "poPayment", "general"}


@dataclass(frozen=True)
class ApprovalStage:
    code: str
    role: str
    purpose: str


@dataclass(frozen=True)
class ApprovalRoute:
    policy_version: str
    request_type: str
    budgeted: bool
    amount: Decimal
    currency_code: str
    stages: tuple[ApprovalStage, ...]


class PolicyCannotRoute(ValueError):
    """The provisional prototype policy has no safe route for these inputs."""


def route_for(*, request_type: str, budgeted: bool, amount: Decimal, currency_code: str) -> ApprovalRoute:
    if request_type not in SUPPORTED_REQUEST_TYPES:
        raise PolicyCannotRoute("Unsupported request type")
    if currency_code != "PHP":
        raise PolicyCannotRoute("Approval thresholds for non-PHP requests need an approved currency rule")
    if amount <= 0:
        raise PolicyCannotRoute("Approval amount must be greater than zero")
    if request_type == "cashAdvance" and amount > Decimal("40000"):
        raise PolicyCannotRoute("Cash Advance exceeds the PHP 40,000 submission limit")
    stages = [
        ApprovalStage("department_approval", "department_head", "Department approval"),
        ApprovalStage("document_validation", "finance_associate", "Finance document validation"),
        ApprovalStage("budget_review", "finance_manager", "Budget and approval-route review"),
    ]
    if request_type == "cashAdvance" or (budgeted and amount <= Decimal("100000")):
        stages[-1] = ApprovalStage("finance_manager_approval", "finance_manager", "Final payment approval")
    elif not budgeted and amount > Decimal("1000000"):
        stages.extend(
            (
                ApprovalStage("coo_approval", "coo", "Executive approval"),
                ApprovalStage("president_approval", "president", "Executive approval"),
                ApprovalStage("board_approval", "board_member", "Board review"),
            )
        )
    elif not budgeted or amount <= Decimal("300000"):
        stages.append(ApprovalStage("coo_approval", "coo", "Final payment approval"))
    else:
        stages.append(ApprovalStage("president_approval", "president", "Final payment approval"))

    return ApprovalRoute(POLICY_VERSION, request_type, budgeted, amount, currency_code, tuple(stages))
