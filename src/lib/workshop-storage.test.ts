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
  assert.deepEqual(decodeWorkshopStore("{"), { version: 1, orders: [], accessoryPurchases: [], supplierInvoices: [], expenses: [], employees: [], payrollWeeks: [] });
  assert.deepEqual(decodeWorkshopStore(JSON.stringify({ version: 2, orders: [delivered], accessoryPurchases: [] })),
    { version: 1, orders: [], accessoryPurchases: [], supplierInvoices: [], expenses: [], employees: [], payrollWeeks: [] });
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
  assert.deepEqual(decoded.supplierInvoices, []);
  assert.deepEqual(decoded.expenses, []);
  assert.deepEqual(decoded.employees, []);
  assert.deepEqual(decoded.payrollWeeks, []);
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


test("employee and payroll week records are retained", () => {
  const employee = { id: "emp-1", name: "Ali", weeklySalary: 1200, active: true };
  const week = {
    id: "week-1", employeeId: "emp-1", weekStart: "2026-11-23",
    attendance: [{ date: "2026-11-23", hours: 9 }],
    advances: [{ id: "adv-1", date: "2026-11-24", amount: 200, method: "Espèces" }],
    salaryPayments: [],
  };
  const decoded = decodeWorkshopStore(JSON.stringify({ version: 1, orders: [], accessoryPurchases: [], employees: [employee], payrollWeeks: [week] }));
  assert.equal(decoded.employees.length, 1);
  assert.equal(decoded.payrollWeeks.length, 1);
  assert.equal(decoded.payrollWeeks[0].advances[0].amount, 200);
});


test("supplier invoice storage preserves multiple lines and rejects impossible payment totals",()=>{
 const invoice={id:"inv-multi",supplier:"Fournisseur B",invoiceNumber:"FB-2",date:"2026-11-25",category:"accessory",lines:[{label:"Poignée",quantity:4,unitPrice:12},{label:"Charnière",quantity:8,unitPrice:3}],totalHT:72,totalTVA:14.4,totalTTC:86.4,paidAmount:20,paymentMethod:"Espèces",paidDate:"2026-11-25"};
 const decoded=decodeWorkshopStore(JSON.stringify({version:1,orders:[],accessoryPurchases:[],supplierInvoices:[invoice]}));
 assert.equal(decoded.supplierInvoices.length,1);assert.equal(decoded.supplierInvoices[0].lines.length,2);
 const invalid=decodeWorkshopStore(JSON.stringify({version:1,orders:[],accessoryPurchases:[],supplierInvoices:[{...invoice,paidAmount:100}]}));
 assert.equal(invalid.supplierInvoices.length,0);
 const unpaid=decodeWorkshopStore(JSON.stringify({version:1,orders:[],accessoryPurchases:[],supplierInvoices:[{...invoice,paidAmount:10,paymentMethod:"Non réglé"}]}));
 assert.equal(unpaid.supplierInvoices.length,0);
});


test("supplier invoice later payments persist and cannot exceed invoice total",()=>{
 const invoice={id:"inv-pay",supplier:"Fournisseur C",invoiceNumber:"FC-1",date:"2026-11-25",category:"accessory",lines:[{label:"Poignée",quantity:2,unitPrice:10}],totalHT:20,totalTVA:4,totalTTC:24,paidAmount:10,paymentMethod:"Espèces",paidDate:"2026-11-25",payments:[{id:"p1",date:"2026-11-26",amount:14,method:"Virement",status:"confirmed"}]};
 const valid=decodeWorkshopStore(JSON.stringify({version:1,orders:[],accessoryPurchases:[],supplierInvoices:[invoice]}));assert.equal(valid.supplierInvoices.length,1);assert.equal(valid.supplierInvoices[0].payments?.[0].amount,14);
 const over=decodeWorkshopStore(JSON.stringify({version:1,orders:[],accessoryPurchases:[],supplierInvoices:[{...invoice,payments:[{...invoice.payments[0],amount:15}]}]}));assert.equal(over.supplierInvoices.length,0);
});


test("legacy supplier payments without status remain readable; legacy cheques stay pending",()=>{
 const invoice={id:"legacy-pay",supplier:"Fournisseur D",invoiceNumber:"FD-1",date:"2026-11-25",category:"accessory",lines:[{label:"Vis",quantity:1,unitPrice:1}],totalHT:1,totalTVA:0,totalTTC:1,paidAmount:0,paymentMethod:"Non réglé",payments:[{id:"old-transfer",date:"2026-11-25",amount:0.5,method:"Virement"},{id:"old-cheque",date:"2026-11-25",amount:0.5,method:"Chèque"}]};
 const decoded=decodeWorkshopStore(JSON.stringify({version:1,orders:[],accessoryPurchases:[],supplierInvoices:[invoice]}));assert.equal(decoded.supplierInvoices.length,1);
});
