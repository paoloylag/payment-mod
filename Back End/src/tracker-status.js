import { statusLabel } from "./status-label.js";

export function trackerRequestStatus(request) {
  const lifecycle = request.backendStatus;
  if (["returned", "declined", "cancelled", "archived", "draft"].includes(lifecycle)) return statusLabel(lifecycle);
  if (request.approvalState === "approved") return "Approved";
  if (request.approvalState === "information_requested") return "Information Requested";
  if (request.approvalState === "active") return statusLabel(request.status || "Pending Approval");
  if (request.backendId) return "Submitted";
  if (/returned|declined|cancelled|archived/i.test(request.status || "")) return statusLabel(request.status);
  return request.currentStep >= 9 ? "Approved" : statusLabel(request.status || "Pending Approval");
}

export function trackerPaymentStatus(request) {
  if (request.type === "pettyCash") return "Not Applicable";
  const state = request.paymentSummary?.state;
  if (state === "voided") return "Voided";
  if (state === "recovery_pending") return "Recovery Pending";
  if (state === "reversed") return "Reversed";
  if (state === "partially_released") return "Partially Released";
  if (["settled_no_payment", "cash_return_pending", "fund_return_pending", "funds_returned"].includes(state)) {
    return request.type === "cashAdvance" ? "Released" : "No Payment Required";
  }
  if (["released", "cleared"].includes(state)) return "Released";
  if (["prepared", "payment_prepared", "authorized", "ready_for_pickup"].includes(state)) return "Pending Release";
  if (["declined", "cancelled", "archived"].includes(request.backendStatus) && !state) return "Not Applicable";
  if (!request.backendId) return request.currentStep > 13 ? "Released" : request.pickupAvailableAt || request.currentStep >= 12 ? "Pending Release" : "Unapproved";
  // Request approval and voucher issuance do not authorize a payment.
  return "Unapproved";
}
