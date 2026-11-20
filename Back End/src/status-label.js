// Display formatting only: stored state codes and form values remain unchanged.
const acronyms = new Set(["API", "COO", "ERP", "EWT", "OCR", "PHP", "PO", "QA", "SLA", "SSO", "VAT"]);
export function statusLabel(value) {
  const original = String(value ?? "");
  const aliases = { "approved — finance processing": "Finance Processing", "returned for information": "Returned" };
  const label = aliases[original.trim().toLowerCase()] || original;
  return label.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")
    .replace(/\b[A-Za-z]+\b/g, word => acronyms.has(word.toUpperCase()) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1).toLowerCase());
}
export function reportStatusValue(key, value) {
  return ["state", "status", "payment_state", "return_state"].includes(key) ? statusLabel(value) : value;
}
