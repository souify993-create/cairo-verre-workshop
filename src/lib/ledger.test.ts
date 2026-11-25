import test from "node:test";
import assert from "node:assert/strict";
import { deriveLedger, type WorkshopOrder } from "./ledger";

const order = (overrides: Partial<WorkshopOrder> = {}): WorkshopOrder => ({
  id: "o1", number: "CV-001", customer: "Client A", status: "delivered", totalTTC: 500,
  accessories: [{ accessoryId: "acc1", label: "Poignée", quantity: 2 }],
  payments: [{ id: "p1", method: "Espèces", amount: 500, status: "confirmed" }],
  refunds: [], ...overrides,
});

test("draft orders have no stock, customer or cash effects", () => {
  const result = deriveLedger([order({ status: "draft" })], [{ accessoryId: "acc1", label: "Poignée", quantity: 10 }]);
  assert.equal(result.cashMovements.length, 0);
  assert.equal(result.customers.length, 0);
  assert.equal(result.stock[0].consumed, 0);
});

test("delivered order consumes accessories and records only confirmed payments", () => {
  const result = deriveLedger([order({ payments: [
    { id: "p1", method: "Espèces", amount: 300, status: "confirmed" },
    { id: "p2", method: "Chèque", amount: 200, status: "pending" },
  ] })], [{ accessoryId: "acc1", label: "Poignée", quantity: 10 }]);
  assert.equal(result.stock[0].available, 8);
  assert.equal(result.cashMovements.length, 1);
  assert.equal(result.customers[0].paid, 300);
  assert.equal(result.customers[0].remaining, 200);
});

test("rebuilding after a price edit does not duplicate payments and calculates customer credit", () => {
  const edited = order({ totalTTC: 200 });
  const result = deriveLedger([edited], [{ accessoryId: "acc1", label: "Poignée", quantity: 10 }]);
  assert.equal(result.cashMovements.length, 1);
  assert.equal(result.customers[0].paid, 500);
  assert.equal(result.customers[0].credit, 300);
  assert.equal(result.customers[0].remaining, 0);
});

test("only an actual confirmed refund creates a cash outflow and reduces credit", () => {
  const result = deriveLedger([order({ totalTTC: 200, refunds: [
    { id: "r1", method: "Espèces", amount: 100, status: "pending" },
    { id: "r2", method: "Espèces", amount: 100, status: "confirmed" },
  ] })], [{ accessoryId: "acc1", label: "Poignée", quantity: 10 }]);
  assert.equal(result.cashMovements.filter(x => x.direction === "Sortie").length, 1);
  assert.equal(result.customers[0].credit, 200);
});

test("cancellation does not erase collected money, but does not consume stock or count sales", () => {
  const result = deriveLedger([order({ status: "cancelled" })], [{ accessoryId: "acc1", label: "Poignée", quantity: 10 }]);
  assert.equal(result.cashMovements.length, 1);
  assert.equal(result.stock[0].consumed, 0);
  assert.equal(result.customers[0].total, 0);
  assert.equal(result.customers[0].credit, 500);
});
