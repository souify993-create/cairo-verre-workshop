import test from "node:test";
import assert from "node:assert/strict";
import { areaM2, quoteTotals, serviceUnit, LINEAR_SERVICES, isValidQuote } from "./calculations";

test("converts millimetre dimensions to square metres and applies quantity", () => {
  assert.equal(areaM2(1000, 2000, 2), 4);
});

test("only the six agreed services use linear metres", () => {
  assert.equal(LINEAR_SERVICES.length, 6);
  for (const name of LINEAR_SERVICES) assert.equal(serviceUnit(name), "ml");
  assert.equal(serviceUnit("Polissage"), "m²");
});

test("calculates TTC totals and derives HT and TVA at 20 percent", () => {
  const totals = quoteTotals(
    [{ label: "Verre", widthMm: 1000, heightMm: 2000, quantity: 1, pricePerM2: 100 }],
    [{ name: "VID 6", unit: "ml", quantity: 3, unitPrice: 20 }],
    [{ label: "Poignée", quantity: 2, unitPrice: 15 }],
  );
  assert.equal(totals.glassTotal, 200);
  assert.equal(totals.serviceTotal, 60);
  assert.equal(totals.accessoryTotal, 30);
  assert.equal(totals.ttc, 290);
  assert.equal(totals.ht, 290 / 1.2);
  assert.equal(totals.tva, 290 - 290 / 1.2);
});


test("accepts accessory-only quotes and rejects incomplete quote lines",()=>{
  assert.equal(isValidQuote([],[],[{label:"Poignée",quantity:2,unitPrice:15}]),true);
  assert.equal(isValidQuote([],[],[]),false);
  assert.equal(isValidQuote([{label:"Verre",widthMm:0,heightMm:1000,quantity:1,pricePerM2:100}],[],[]),false);
  assert.equal(isValidQuote([],[{name:"VID 6",unit:"ml",quantity:1,unitPrice:20}],[]),true);
  assert.equal(isValidQuote([],[{name:"",unit:"m²",quantity:1,unitPrice:20}],[]),false);
});
