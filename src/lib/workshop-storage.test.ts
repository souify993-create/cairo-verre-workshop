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
  assert.deepEqual(decodeWorkshopStore("{"), { version: 1, orders: [], accessoryPurchases: [] });
  assert.deepEqual(decodeWorkshopStore(JSON.stringify({ version: 2, orders: [delivered], accessoryPurchases: [] })),
    { version: 1, orders: [], accessoryPurchases: [] });
});

test("workshop store filters malformed order records", () => {
  const malformed = { ...delivered, totalTTC: -1 };
  const decoded = decodeWorkshopStore(JSON.stringify({ version: 1, orders: [delivered, malformed], accessoryPurchases: [] }));
  assert.equal(decoded.orders.length, 1);
});
