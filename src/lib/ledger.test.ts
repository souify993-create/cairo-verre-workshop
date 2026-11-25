import test from "node:test";
import assert from "node:assert/strict";
import { deriveLedger, type WorkshopOrder } from "./ledger";
import { addPayment, addRefund, confirmPayment, markOrderDelivered, orderFromDraft } from "./workshop";

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


test("integrated order, cheque, refund, stock and supplier settlement flow stays consistent on rebuild",()=>{
 const draft={id:"flow-1",number:"CV-FLOW-1",customer:"",createdAt:"2026-11-25T09:00:00.000Z",glass:[],services:[],accessories:[{label:"Poignée",quantity:2,unitPrice:100}],total:200};
 let order=markOrderDelivered(orderFromDraft(draft),"Client Flow");
 order=addPayment(order,{id:"cash-flow",method:"Espèces",amount:100,status:"confirmed",date:"2026-11-25"});
 order=addPayment(order,{id:"cheque-flow",method:"Chèque",amount:100,status:"pending",date:"2026-11-25"});
 order=confirmPayment(order,"cheque-flow","2026-11-26T10:00:00.000Z");
 order=addRefund(order,{id:"refund-flow",method:"Espèces",amount:25,status:"confirmed",date:"2026-11-26"});
 const supplier=[{id:"supplier-flow",supplier:"Fournisseur Flow",invoiceNumber:"SF-1",paidAmount:30,paymentMethod:"Espèces" as const,paidDate:"2026-11-25",payments:[{id:"supplier-transfer",date:"2026-11-26",amount:20,method:"Virement" as const,status:"confirmed" as const},{id:"supplier-cheque",date:"2026-11-26",amount:10,method:"Chèque" as const,status:"pending" as const}]}];
 const args=[[order],[{accessoryId:"poignee",label:"Poignée",quantity:5}],supplier] as const;
 const first=deriveLedger(...args),second=deriveLedger(...args);
 assert.equal(first.stock[0].available,3);
 assert.equal(first.customers[0].paid,175);
 assert.equal(first.customers[0].remaining,25);
 assert.equal(first.cashMovements.length,5);
 assert.equal(first.cashMovements.reduce((sum,m)=>sum+(m.direction==="Entrée"?m.amount:-m.amount),0),125);
 assert.deepEqual(second,first);
});

test("an initial supplier cheque is not a cash outflow until its payment record is confirmed",()=>{
 const pending=deriveLedger([],[],[{id:"initial-cheque",supplier:"Fournisseur",invoiceNumber:"F-INIT",paidAmount:0,paymentMethod:"Chèque",payments:[{id:"initial-cheque-payment",date:"2026-11-25",amount:450,method:"Chèque",status:"pending"}]}]);
 assert.equal(pending.cashMovements.length,0);
 const collected=deriveLedger([],[],[{id:"initial-cheque",supplier:"Fournisseur",invoiceNumber:"F-INIT",paidAmount:0,paymentMethod:"Chèque",payments:[{id:"initial-cheque-payment",date:"2026-11-27",amount:450,method:"Chèque",status:"confirmed"}]}]);
 assert.equal(collected.cashMovements.length,1);
 assert.equal(collected.cashMovements[0].amount,450);
 assert.equal(collected.cashMovements[0].date,"2026-11-27");
});
