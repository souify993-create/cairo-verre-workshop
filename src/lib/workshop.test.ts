import test from "node:test";
import assert from "node:assert/strict";
import { addPayment, addRefund, cancelOrder, confirmPayment, confirmRefund, markOrderDelivered, orderFromDraft, reviseOrder, reviseDeliveredOrder, settleCustomerAvoir } from "./workshop";
import { deriveLedger } from "./ledger";
import type { Draft } from "./storage";

const draft: Draft = {
  id: "d1", number: "CV-100", customer: "",
  createdAt: "2026-11-25T09:00:00.000Z",
  glass: [{ label: "Clair 6", widthMm: 1000, heightMm: 1000, quantity: 1, pricePerM2: 200 }],
  services: [], accessories: [{ label: "Poignée", quantity: 2, unitPrice: 25 }],
  total: 250,
};

test("draft conversion is inert until explicit delivery", () => {
  const order = orderFromDraft(draft);
  assert.equal(order.status, "draft");
  assert.deepEqual(deriveLedger([order], []).cashMovements, []);
  assert.equal(deriveLedger([order], [{ accessoryId: "poignee", label: "Poignée", quantity: 5 }]).stock[0].consumed, 0);
});

test("delivery requires a customer and creates no imaginary payment", () => {
  const order = orderFromDraft(draft);
  assert.throws(() => markOrderDelivered(order, " "));
  const delivered = markOrderDelivered(order, "Client B");
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.payments.length, 0);
  assert.equal(deriveLedger([delivered], [{ accessoryId: "poignee", label: "Poignée", quantity: 5 }]).stock[0].available, 3);
});

test("editing a delivered order preserves the exact payment history", () => {
  let order = markOrderDelivered(orderFromDraft(draft), "Client B");
  order = addPayment(order, { id: "cash1", method: "Espèces", amount: 200, status: "confirmed" });
  const revised = reviseOrder(order, { totalTTC: 150 });
  assert.deepEqual(revised.payments, order.payments);
  const balance = deriveLedger([revised], []).customers[0];
  assert.equal(balance.credit, 50);
  assert.equal(balance.paid, 200);
});

test("canceling a delivered order restores derived stock but keeps collected cash", () => {
  let order = markOrderDelivered(orderFromDraft(draft), "Client B");
  order = addPayment(order, { id: "cash1", method: "Espèces", amount: 100, status: "confirmed" });
  const cancelled = cancelOrder(order);
  const ledger = deriveLedger([cancelled], [{ accessoryId: "poignee", label: "Poignée", quantity: 5 }]);
  assert.equal(ledger.stock[0].consumed, 0);
  assert.equal(ledger.cashMovements.length, 1);
  assert.equal(ledger.cashMovements[0].direction, "Entrée");
});

test("a cheque enters the cash ledger only after explicit confirmation", () => {
  let order = markOrderDelivered(orderFromDraft(draft), "Client B");
  order = addPayment(order, { id: "ch1", method: "Chèque", amount: 250, status: "pending" });
  assert.equal(deriveLedger([order], []).cashMovements.length, 0);
  order = confirmPayment(order, "ch1");
  assert.equal(deriveLedger([order], []).cashMovements.length, 1);
});

test("changing order lines requires a matching total and updates accessory consumption", () => {
  const delivered = markOrderDelivered(orderFromDraft(draft), "Client B");
  assert.throws(() => reviseOrder(delivered, {
    lines: { ...delivered.lines, accessories: [{ label: "Charnière", quantity: 3, unitPrice: 10 }] },
  }));
  const revised = reviseOrder(delivered, {
    totalTTC: 230,
    lines: { ...delivered.lines, accessories: [{ label: "Charnière", quantity: 3, unitPrice: 10 }] },
  });
  assert.equal(revised.accessories[0].accessoryId, "charniere");
  assert.equal(revised.accessories[0].quantity, 3);
});

test("actual refunds cannot exceed money collected for that order", () => {
  let order = markOrderDelivered(orderFromDraft(draft), "Client B");
  order = addPayment(order, { id: "cash1", method: "Espèces", amount: 100, status: "confirmed" });
  order = addRefund(order, { id: "refund1", method: "Espèces", amount: 60, status: "confirmed" });
  assert.throws(() => addRefund(order, { id: "refund2", method: "Espèces", amount: 50, status: "confirmed" }));
  const snapshot = deriveLedger([order], []);
  assert.equal(snapshot.cashMovements.filter(m => m.direction === "Sortie")[0].amount, 60);
  assert.equal(snapshot.customers[0].paid, 40);
});

test("a cheque refund stays pending until encashment and respects confirmed receipts", () => {
  let order = markOrderDelivered(orderFromDraft(draft), "Client B");
  order = addPayment(order, { id: "cash-refund", method: "Espèces", amount: 100, status: "confirmed" });
  order = addRefund(order, { id: "cheque-refund", method: "Chèque", amount: 80, status: "confirmed" });
  assert.equal(order.refunds.find(r => r.id === "cheque-refund")?.status, "pending");
  assert.equal(deriveLedger([order], []).cashMovements.filter(m => m.direction === "Sortie").length, 0);
  order = addRefund(order, { id: "cash-refund-2", method: "Espèces", amount: 30, status: "confirmed" });
  assert.throws(() => confirmRefund(order, "cheque-refund", "2026-11-25T12:00:00.000Z"));
  order = addPayment(order, { id: "transfer-refund", method: "Virement", amount: 20, status: "confirmed" });
  order = confirmRefund(order, "cheque-refund", "2026-11-26T12:00:00.000Z");
  const outflows = deriveLedger([order], []).cashMovements.filter(m => m.direction === "Sortie");
  assert.equal(outflows.length, 2);
  assert.equal(outflows.find(m => m.kind === "Remboursement" && m.method === "Chèque")?.date, "2026-11-26");
});

test("only pending cheques can be confirmed as collected", () => {
  let order = markOrderDelivered(orderFromDraft(draft), "Client B");
  order = addPayment(order, { id: "cash-only", method: "Espèces", amount: 50, status: "pending" });
  assert.throws(() => confirmPayment(order, "cash-only"));
  order = addPayment(order, { id: "cheque-only", method: "Chèque", amount: 50, status: "confirmed" });
  assert.equal(order.payments.find(p => p.id === "cheque-only")?.status, "pending");
  order = confirmPayment(order, "cheque-only");
  assert.throws(() => confirmPayment(order, "cheque-only"));
});

test("only pending cheque refunds can be confirmed", () => {
  let order = markOrderDelivered(orderFromDraft(draft), "Client B");
  order = addPayment(order, { id: "cash-for-refund", method: "Espèces", amount: 100, status: "confirmed" });
  order = addRefund(order, { id: "cash-refund-only", method: "Espèces", amount: 20, status: "pending" });
  assert.throws(() => confirmRefund(order, "cash-refund-only"));
});


test("delivered cash order decrease edits original Entrée and creates Avoir without Sortie", () => {
  let order = markOrderDelivered(orderFromDraft(draft), "Client B");
  order = addPayment(order, { id: "cash-full", method: "Espèces", amount: 250, status: "confirmed", date: "2026-11-20" });
  const revised = reviseDeliveredOrder(order, { totalTTC: 200, lines: order.lines }, "Espèces");
  assert.equal(revised.payments.find(p => p.id === "cash-full")?.amount, 200);
  assert.equal(revised.avoirs?.[0]?.amount, 50);
  const ledger = deriveLedger([revised], []);
  assert.equal(ledger.customers[0].paid, 200);
  assert.equal(ledger.customers[0].credit, 50);
  assert.equal(ledger.cashMovements.length, 1);
  assert.equal(ledger.cashMovements[0].direction, "Entrée");
  assert.equal(ledger.cashMovements[0].amount, 200);
  const settled = settleCustomerAvoir(revised, revised.avoirs[0].id);
  const afterSettlement = deriveLedger([settled], []);
  assert.equal(afterSettlement.customers[0].credit, 0);
  assert.equal(afterSettlement.cashMovements.length, 1);
  assert.equal(afterSettlement.cashMovements[0].direction, "Entrée");
});

test("delivered cheque and effect orders cannot be edited", () => {
  let cheque = markOrderDelivered(orderFromDraft(draft), "Client B");
  cheque = addPayment(cheque, { id: "cheque-full", method: "Chèque", amount: 250, status: "pending" });
  assert.throws(() => reviseDeliveredOrder(cheque, { totalTTC: 200, lines: cheque.lines }, "Chèque"));
  let effect = markOrderDelivered(orderFromDraft(draft), "Client B");
  effect = addPayment(effect, { id: "effect-full", method: "Effet", amount: 250, status: "pending" });
  assert.throws(() => reviseDeliveredOrder(effect, { totalTTC: 200, lines: effect.lines }, "Effet"));
});

test("changing payment method cancels the original payment and records the replacement method", () => {
  let order = markOrderDelivered(orderFromDraft(draft), "Client B");
  order = addPayment(order, { id: "old-cash", method: "Espèces", amount: 250, status: "confirmed" });
  const revised = reviseDeliveredOrder(order, { totalTTC: 250, lines: order.lines }, "Virement");
  assert.equal(revised.payments.find(payment => payment.id === "old-cash")?.status, "cancelled");
  assert.equal(revised.payments.filter(payment => payment.status === "confirmed").length, 1);
  assert.equal(revised.payments.find(payment => payment.status === "confirmed")?.method, "Virement");
  assert.equal(deriveLedger([revised], []).cashMovements[0].method, "Virement");
});

test("editing delivered accessory quantities automatically changes consumed stock", () => {
  const order = markOrderDelivered(orderFromDraft(draft), "Client B");
  const revised = reviseDeliveredOrder(order, {
    totalTTC: 225,
    lines: { ...order.lines, accessories: [{ label: "Poignée", quantity: 1, unitPrice: 25 }] },
  });
  const ledger = deriveLedger([revised], [{ accessoryId: "poignee", label: "Poignée", quantity: 5 }]);
  assert.equal(ledger.stock[0].consumed, 1);
  assert.equal(ledger.stock[0].available, 4);
});
