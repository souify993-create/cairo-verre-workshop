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

test("confirmed supplier payments are cash outflows; unpaid cheques are excluded", () => {
  const result = deriveLedger([], [], [
    { id: "sup-1", supplier: "Fournisseur Verre", invoiceNumber: "FV-1", paidAmount: 250, paymentMethod: "Virement" },
    { id: "sup-2", supplier: "Fournisseur Accessoires", invoiceNumber: "FA-2", paidAmount: 0, paymentMethod: "Chèque" },
  ]);
  assert.equal(result.cashMovements.length, 1);
  assert.equal(result.cashMovements[0].direction, "Sortie");
  assert.equal(result.cashMovements[0].amount, 250);
  assert.equal(result.cashMovements[0].counterparty, "Fournisseur Verre");
});


test("cash movements preserve actual dates and keep legacy records explicitly undated", () => {
  const result = deriveLedger([order({ payments: [
    { id: "p-date", method: "Espèces", amount: 120, status: "confirmed", date: "2026-11-25" },
    { id: "p-old", method: "Virement", amount: 80, status: "confirmed" },
  ], refunds: [
    { id: "r-date", method: "Espèces", amount: 20, status: "confirmed", date: "2026-11-25" },
  ] })], [], [
    { id: "sup-date", supplier: "Fournisseur", invoiceNumber: "F-1", paidAmount: 30, paymentMethod: "Virement", paidDate: "2026-11-24" },
  ]);
  assert.equal(result.cashMovements.find(x => x.kind === "Paiement" && x.method === "Espèces")?.date, "2026-11-25");
  assert.equal(result.cashMovements.find(x => x.kind === "Paiement" && x.method === "Virement")?.date, undefined);
  assert.equal(result.cashMovements.find(x => x.kind === "Remboursement")?.direction, "Sortie");
  assert.equal(result.cashMovements.find(x => x.kind === "Achat fournisseur")?.date, "2026-11-24");
});


test("later supplier settlements are separate dated cash outflows",()=>{
 const result=deriveLedger([],[],[{id:"inv",supplier:"Fournisseur",invoiceNumber:"FV-8",paidAmount:100,paymentMethod:"Espèces",paidDate:"2026-11-20",payments:[{id:"sp-1",date:"2026-11-24",amount:150,method:"Virement"}]}]);
 assert.equal(result.cashMovements.length,2);assert.equal(result.cashMovements.reduce((s,m)=>s+m.amount,0),250);assert.equal(result.cashMovements.find(m=>m.orderId==="sp-1")?.date,"2026-11-24");
});


test("supplier cheques remain outside cash until confirmed",()=>{
 const result=deriveLedger([],[],[{id:"inv-cheque",supplier:"Fournisseur",invoiceNumber:"F-CH",paidAmount:0,paymentMethod:"Non réglé",payments:[{id:"sp-pending",date:"2026-11-25",amount:300,method:"Chèque",status:"pending"},{id:"sp-confirmed",date:"2026-11-26",amount:100,method:"Chèque",status:"confirmed"}]}]);
 assert.equal(result.cashMovements.length,1);assert.equal(result.cashMovements[0].amount,100);assert.equal(result.cashMovements[0].date,"2026-11-26");
});
