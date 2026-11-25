import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeDraftStore, encodeDraftStore } from "./storage";
import type { Draft } from "./storage";

const sample: Draft = {
  id: "draft-1", number: "CV-100001", customer: "Client test",
  createdAt: "2026-11-25T10:00:00.000Z",
  glass: [{ label: "Clair 6 mm", widthMm: 1000, heightMm: 1200, quantity: 2, pricePerM2: 180 }],
  services: [{ name: "VID 6", unit: "ml", quantity: 2, unitPrice: 15 }],
  accessories: [{ label: "Poignée", quantity: 1, unitPrice: 35 }],
  total: 503,
};

describe("versioned draft storage", () => {
  it("round-trips the versioned envelope", () => {
    assert.deepEqual(decodeDraftStore(encodeDraftStore([sample])), [sample]);
  });

  it("reads the previous raw-array format without losing valid drafts", () => {
    assert.deepEqual(decodeDraftStore(JSON.stringify([sample])), [sample]);
  });

  it("ignores malformed or unsupported stored data safely", () => {
    assert.deepEqual(decodeDraftStore("{broken"), []);
    assert.deepEqual(decodeDraftStore(JSON.stringify({ version: 99, drafts: [sample] })), []);
  });

  it("filters records with invalid numeric values", () => {
    const invalid = { ...sample, total: Number.NaN };
    assert.deepEqual(decodeDraftStore(JSON.stringify({ version: 1, drafts: [sample, invalid] })), [sample]);
  });
});
