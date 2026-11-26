import test from "node:test";
import assert from "node:assert/strict";
import { serializeWorkshopBackup } from "./backup";

test("backup export contains the full workshop snapshot and metadata", () => {
  const workshop = {
    version: 1 as const,
    orders: [{ id: "order-1" }] as never[],
    accessoryPurchases: [{ accessoryId: "handle", label: "Poignée", quantity: 4 }],
    supplierInvoices: [],
    expenses: [],
    employees: [],
    payrollWeeks: [],
    customers: [{ id: "customer-1", name: "Client test", phone: "0600000000" }],
  };
  const drafts = [{ id: "draft-1", number: "#C2" }] as never[];
  const parsed = JSON.parse(serializeWorkshopBackup(workshop, drafts, 7, "2026-11-26T20:00:00.000Z"));
  assert.equal(parsed.format, "cairo-verre-workshop-backup");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.exportedAt, "2026-11-26T20:00:00.000Z");
  assert.equal(parsed.cloudRevision, 7);
  assert.equal(parsed.data.orders[0].id, "order-1");
  assert.equal(parsed.data.accessoryPurchases[0].quantity, 4);
  assert.equal(parsed.data.customers[0].name, "Client test");
  assert.equal(parsed.data.drafts[0].id, "draft-1");
});
