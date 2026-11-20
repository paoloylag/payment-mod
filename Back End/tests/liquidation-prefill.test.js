import test from "node:test";
import assert from "node:assert/strict";
import { liquidationPrefill } from "../src/liquidation-prefill.js";
test("liquidation copies source context without inventing actual expense facts", () => {
  const fields = { actual_liquidation_date: "2026-11-20", purpose: "Old purpose", other: "Keep" };
  const result = liquidationPrefill({ request_number: "CA-1", amount: "15000.00", currency_code: "PHP", purpose: "Training", department_cost_center_id: "center-1", liquidation_due_date: "2026-12-05", budgeted: false }, fields);
  assert.equal(result.amount, 15000);
  assert.equal(result.currency, "PHP");
  assert.equal(result.budgeted, false);
  assert.deepEqual(result.fields, { ...fields, cash_advance_reference: "CA-1", purpose: "Training", department_cost_center_id: "center-1", liquidation_due_date: "2026-12-05" });
  assert.equal(fields.purpose, "Old purpose");
  const switched = liquidationPrefill({ request_number: "CA-2", amount: "100", currency_code: "USD" }, result.fields);
  assert.equal(switched.fields.purpose, "");
  assert.equal(switched.fields.liquidation_due_date, "");
  assert.equal(switched.fields.actual_liquidation_date, "2026-11-20");
  assert.equal(switched.currency, "USD");
});
test("missing or invalid cash advances cannot populate an amount", () => {
  for (const source of [null, {}, { amount: "bad", currency_code: "PHP" }, { amount: "0", currency_code: "PHP" }, { amount: "-1", currency_code: "PHP" }]) assert.equal(liquidationPrefill(source, {}), null);
});
