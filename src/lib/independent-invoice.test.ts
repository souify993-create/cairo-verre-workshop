import test from "node:test";
import assert from "node:assert/strict";
import { allocateIndependentInvoiceTotal, independentInvoiceNumber } from "./independent-invoice";

test("allocates the exact invoice total to glass rows using area weights", () => {
  const rows = allocateIndependentInvoiceTotal([
    { label: "CLAIR 6", widthMm: 1000, heightMm: 1000, quantity: 1 },
    { label: "MIROIR 4", widthMm: 2000, heightMm: 1000, quantity: 1 },
  ], 1000);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 1000);
  assert.ok(rows[1].amount > rows[0].amount);
});

test("rejects invalid independent invoice input", () => {
  assert.throws(() => allocateIndependentInvoiceTotal([], 100));
  assert.throws(() => allocateIndependentInvoiceTotal([{ label: "", widthMm: 0, heightMm: 1, quantity: 1 }], 100));
});

test("independent invoice number has a separate FI prefix", () => {
  assert.match(independentInvoiceNumber(new Date(2026, 10, 26, 12, 5, 9)), /^FI-20261126-120509$/);
});
