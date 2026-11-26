import type { Draft } from "./storage";
import type { AccessoryUse, CustomerAvoir, Payment, Refund, WorkshopOrder } from "./ledger";

export type OrderDocumentLines = Pick<Draft, "glass" | "services" | "accessories">;
export type StoredOrder = WorkshopOrder & {
  createdAt: string;
  updatedAt: string;
  lines: OrderDocumentLines;
  avoirs?: CustomerAvoir[];
};

const accessoryKey = (label: string) =>
  label.trim().toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "accessoire-sans-nom";

const accessoryUsesFromLines = (lines: Draft["accessories"]): AccessoryUse[] =>
  lines.map((line) => ({
    accessoryId: accessoryKey(line.label),
    label: line.label.trim() || "Accessoire",
    quantity: line.quantity,
  }));

export function orderFromDraft(draft: Draft, now = new Date().toISOString()): StoredOrder {
  const accessories = accessoryUsesFromLines(draft.accessories);
  return {
    id: draft.id,
    number: draft.number,
    customer: draft.customer,
    status: "draft",
    totalTTC: draft.total,
    accessories,
    payments: [],
    refunds: [],
    avoirs: [],
    createdAt: draft.createdAt,
    updatedAt: now,
    lines: {
      glass: draft.glass.map((line) => ({ ...line })),
      services: draft.services.map((line) => ({ ...line })),
      accessories: draft.accessories.map((line) => ({ ...line })),
    },
  };
}

/** Delivery is an explicit state transition; it never invents a payment. */
export function markOrderDelivered(order: StoredOrder, customer: string, now = new Date().toISOString()): StoredOrder {
  if (order.status !== "draft") throw new Error("Seul un brouillon peut être livré.");
  if (!customer.trim()) throw new Error("Le nom du client est obligatoire à la livraison.");
  return { ...order, customer: customer.trim(), status: "delivered", updatedAt: now };
}

/** Editing a delivered order preserves every payment/refund record unchanged. */
export function reviseOrder(
  order: StoredOrder,
  changes: { customer?: string; totalTTC?: number; lines?: OrderDocumentLines; accessories?: AccessoryUse[] },
  now = new Date().toISOString(),
): StoredOrder {
  if (order.status === "cancelled") throw new Error("Une commande annulée ne peut pas être modifiée.");
  const customer = changes.customer === undefined ? order.customer : changes.customer.trim();
  const totalTTC = changes.totalTTC === undefined ? order.totalTTC : changes.totalTTC;
  if (!Number.isFinite(totalTTC) || totalTTC < 0) throw new Error("Le total doit être positif ou nul.");
  if (order.status === "delivered" && !customer) throw new Error("Le nom du client est obligatoire.");
  if (changes.lines && changes.totalTTC === undefined) {
    throw new Error("Le total TTC doit être recalculé lors de la modification des lignes.");
  }
  const lines = changes.lines ?? order.lines;
  const accessories = changes.accessories ?? (changes.lines
    ? accessoryUsesFromLines(changes.lines.accessories)
    : order.accessories);
  return { ...order, customer, totalTTC, lines, accessories, updatedAt: now };
}

/** Revises a delivered order and reconciles its payment method without rewriting its history. */
/** Delivered orders paid by cheque/effect are intentionally immutable. Cash/bank adjustments
 * rewrite the original receipt amount and create a separate customer Avoir without a cash outflow. */
export function reviseDeliveredOrder(
  order: StoredOrder,
  changes: { customer?: string; totalTTC: number; lines: OrderDocumentLines },
  paymentMethod?: Payment["method"],
  now = new Date().toISOString(),
): StoredOrder {
  if (order.status !== "delivered") throw new Error("Seule une commande livrée peut être modifiée ici.");
  const activePayments = order.payments.filter(payment => payment.status !== "cancelled");
  if (activePayments.some(payment => payment.method === "Chèque" || payment.method === "Effet")) {
    throw new Error("Cette commande contient un Chèque ou un Effet : elle ne peut pas être modifiée. Conservez-la ou supprimez-la entièrement.");
  }
  const revised = reviseOrder(order, changes, now);
  const methods = [...new Set(activePayments.map(payment => payment.method))];
  let payments = [...order.payments];
  let avoirs = [...(order.avoirs || [])];

  if (paymentMethod && methods.length > 0 && (methods.length !== 1 || methods[0] !== paymentMethod)) {
    const paid = activePayments.filter(payment => payment.status === "confirmed")
      .reduce((sum, payment) => sum + payment.amount, 0);
    payments = payments.map(payment => activePayments.some(active => active.id === payment.id)
      ? { ...payment, status: "cancelled" as const } : payment);
    const applied = Math.min(paid, revised.totalTTC);
    if (applied > 0.009) payments.push({
      id: crypto.randomUUID(), method: paymentMethod, amount: applied,
      status: paymentMethod === "Chèque" || paymentMethod === "Effet" ? "pending" : "confirmed",
      date: now.slice(0, 10),
    });
    const excess = Math.max(0, paid - revised.totalTTC);
    if (excess > 0.009) avoirs.push({ id: crypto.randomUUID(), amount: excess, date: now.slice(0, 10), status: "pending" });
    return { ...revised, payments, avoirs, updatedAt: now };
  }

  if (methods.length === 1 && (methods[0] === "Espèces" || methods[0] === "Virement")) {
    const received = activePayments.filter(payment => payment.status === "confirmed")
      .reduce((sum, payment) => sum + payment.amount, 0);
    if (received > revised.totalTTC + 0.009) {
      let remaining = revised.totalTTC;
      payments = payments.map(payment => {
        if (!activePayments.some(active => active.id === payment.id) || payment.status !== "confirmed") return payment;
        const kept = Math.min(payment.amount, remaining);
        remaining = Math.max(0, remaining - kept);
        return { ...payment, amount: kept };
      });
      avoirs.push({
        id: crypto.randomUUID(),
        amount: received - revised.totalTTC,
        date: now.slice(0, 10),
        status: "pending",
      });
    }
  }
  return { ...revised, payments, avoirs, updatedAt: now };
}

/** Settling an Avoir only clears the customer credit list; it never creates a cash movement. */
export function settleCustomerAvoir(order: StoredOrder, avoirId: string, now = new Date().toISOString()): StoredOrder {
  const avoir = (order.avoirs || []).find(item => item.id === avoirId);
  if (!avoir || avoir.status !== "pending") throw new Error("Avoir client introuvable ou déjà réglé.");
  return {
    ...order,
    avoirs: (order.avoirs || []).map(item => item.id === avoirId ? { ...item, status: "settled" as const } : item),
    updatedAt: now,
  };
}

export function cancelOrder(order: StoredOrder, now = new Date().toISOString()): StoredOrder {
  if (order.status === "cancelled") return order;
  return { ...order, status: "cancelled", updatedAt: now };
}

export function addPayment(
  order: StoredOrder,
  payment: Payment,
  now = new Date().toISOString(),
): StoredOrder {
  if (order.status !== "delivered") throw new Error("Le paiement ne peut être ajouté qu'à une commande livrée.");
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) throw new Error("Le montant du paiement doit être supérieur à zéro.");
  if (order.payments.some((item) => item.id === payment.id)) throw new Error("Identifiant de paiement déjà utilisé.");
  // Cheques and bills remain pending; cash, transfers and approved remissions are confirmed immediately.
  const recorded: Payment = {
    ...payment,
    date: payment.date ?? now.slice(0, 10),
    status: payment.method === "Chèque" || payment.method === "Effet" ? "pending" : "confirmed",
  };
  return { ...order, payments: [...order.payments, recorded], updatedAt: now };
}

export function confirmPayment(order: StoredOrder, paymentId: string, now = new Date().toISOString()): StoredOrder {
  let found = false;
  const payments = order.payments.map((payment) => {
    if (payment.id !== paymentId) return payment;
    found = true;
    if ((payment.method !== "Chèque" && payment.method !== "Effet") || payment.status !== "pending") {
      throw new Error("Seul un chèque ou effet en attente peut être confirmé.");
    }
    return { ...payment, status: "confirmed" as const };
  });
  if (!found) throw new Error("Paiement introuvable.");
  return { ...order, payments, updatedAt: now };
}

export function addRefund(order: StoredOrder, refund: Refund, now = new Date().toISOString()): StoredOrder {
  if (!Number.isFinite(refund.amount) || refund.amount <= 0) throw new Error("Le montant du remboursement doit être supérieur à zéro.");
  if (order.refunds.some((item) => item.id === refund.id)) throw new Error("Identifiant de remboursement déjà utilisé.");
  const status = refund.method === "Chèque" || refund.method === "Effet" ? "pending" : refund.status;
  if (status === "confirmed") {
    const collected = order.payments.filter(p => p.status === "confirmed").reduce((sum, p) => sum + p.amount, 0);
    const alreadyRefunded = order.refunds.filter(r => r.status === "confirmed").reduce((sum, r) => sum + r.amount, 0);
    if (alreadyRefunded + refund.amount > collected) {
      throw new Error("Le remboursement dépasse le montant réellement encaissé pour cette commande.");
    }
  }
  return { ...order, refunds: [...order.refunds, { ...refund, status, date: refund.date ?? now.slice(0, 10) }], updatedAt: now };
}

export function confirmRefund(order: StoredOrder, refundId: string, now = new Date().toISOString()): StoredOrder {
  const refund = order.refunds.find(item => item.id === refundId);
  if (!refund) throw new Error("Remboursement introuvable.");
  if ((refund.method !== "Chèque" && refund.method !== "Effet") || refund.status !== "pending") {
    throw new Error("Seul un remboursement par chèque ou effet en attente peut être confirmé.");
  }
  const collected = order.payments.filter(payment => payment.status === "confirmed")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const alreadyRefunded = order.refunds.filter(item => item.status === "confirmed")
    .reduce((sum, item) => sum + item.amount, 0);
  if (alreadyRefunded + refund.amount > collected) {
    throw new Error("Le remboursement dépasse le montant réellement encaissé pour cette commande.");
  }
  return {
    ...order,
    refunds: order.refunds.map(item => item.id === refundId
      ? { ...item, status: "confirmed" as const, date: now.slice(0, 10) }
      : item),
    updatedAt: now,
  };
}
