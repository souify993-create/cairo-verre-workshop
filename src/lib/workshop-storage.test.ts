import test from "node:test";
import assert from "node:assert/strict";
import { decodeWorkshopStore } from "./workshop-storage";
import { markOrderDelivered, orderFromDraft } from "./workshop";
import type { Draft } from "./storage";

const draft: Draft = {
  id: "d2", number: "CV-101", customer: "Client C",
  createdAt: "2026-11-25T09:00:00.000Z", glass: [], services: [],
  accessories: [{ label: "Poignée", quantity: 1, unitPrice: 20 }], total: 20,
};
const delivered = markOrderDelivered(orderFromDraft(draft), "Client C");

test("workshop store reads valid orders and accessory purchases", () => {
  const decoded = decodeWorkshopStore(JSON.stringify({
    version: 1, orders: [delivered],
    accessoryPurchases: [{ accessoryId: "poignee", label: "Poignée", quantity: 8 }],
  }));
  assert.equal(decoded.orders.length, 1);
  assert.equal(decoded.accessoryPurchases[0].quantity, 8);
});

test("workshop store rejects unsupported versions and malformed JSON", () => {
  assert.deepEqual(decodeWorkshopStore("{"), { version: 1, orders: [], accessoryPurchases: [], supplierInvoices: [], expenses: [] });
  assert.deepEqual(decodeWorkshopStore(JSON.stringify({ version: 2, orders: [delivered], accessoryPurchases: [] })),
    { version: 1, orders: [], accessoryPurchases: [], supplierInvoices: [], expenses: [] });
});

test("workshop store filters malformed order records", () => {
  const malformed = { ...delivered, totalTTC: -1 };
  const decoded = decodeWorkshopStore(JSON.stringify({ version: 1, orders: [delivered, malformed], accessoryPurchases: [] }));
  assert.equal(decoded.orders.length, 1);
});

test("supplier invoices are retained and glass invoices do not imply accessory stock", () => {
  const invoice = {
    id: "inv-1", supplier: "Fournisseur A", invoiceNumber: "FA-77", date: "2026-11-25",
    category: "glass", lines: [{ label: "Verre clair", quantity: 4, unitPrice: 120, widthMm: 2000, heightMm: 1000 }],
    totalHT: 400, totalTVA: 80, totalTTC: 480, paidAmount: 100, paymentMethod: "Virement",
  };
  const decoded = decodeWorkshopStore(JSON.stringify({
    version: 1, orders: [], accessoryPurchases: [], supplierInvoices: [invoice],
  }));
  assert.equal(decoded.supplierInvoices.length, 1);
  assert.equal(decoded.supplierInvoices[0].totalTTC, 480);
  assert.equal(decoded.accessoryPurchases.length, 0);
});

test("older local stores remain readable without supplier invoice data", () => {
  const decoded = decodeWorkshopStore(JSON.stringify({ version: 1, orders: [], accessoryPurchases: [] }));
  assert.deepEqual(decoded.supplierInvoices, []);\n  assert.deepEqual(decoded.expenses, []);
});


test("older payment records without cash dates remain valid and are not assigned invented dates", () => {
  const oldOrder = { ...delivered, payments: [{ id: "old-p", method: "Espèces", amount: 20, status: "confirmed" }] };
  const decoded = decodeWorkshopStore(JSON.stringify({ version: 1, orders: [oldOrder], accessoryPurchases: [] }));
  assert.equal(decoded.orders.length, 1);
  assert.equal(decoded.orders[0].payments[0].date, undefined);
});


test("expense records persist and old stores default to an empty expense list", () => {
  const expense = { id: "e1", name: "Loyer", category: "Loyer", amount: 3000, frequency: "Mois", paymentMethod: "Espèces", startDate: "2026-11-01" };
  const decoded = decodeWorkshopStore(JSON.stringify({ version: 1, orders: [], accessoryPurchases: [], expenses: [expense] }));
  assert.equal(decoded.expenses.length, 1);
  assert.equal(decoded.expenses[0].amount, 3000);
  const old = decodeWorkshopStore(JSON.stringify({ version: 1, orders: [], accessoryPurchases: [] }));
  assert.deepEqual(old.expenses, []);
});
