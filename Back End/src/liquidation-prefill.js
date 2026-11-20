// Copy source context only. Actual expenses, invoice details and evidence stay independent.
export function liquidationPrefill(source, fields) {
  if (!source) return null;
  const amount = Number(source.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !source.currency_code) return null;
  return {
    fields: { ...fields, cash_advance_reference: source.request_number,
      purpose: source.purpose || "", department_cost_center_id: source.department_cost_center_id || "",
      liquidation_due_date: source.liquidation_due_date || "" },
    amount, currency: source.currency_code, budgeted: source.budgeted !== false,
  };
}
