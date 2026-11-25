import type { Draft } from "./storage";
import type { AccessoryUse, Payment, Refund, WorkshopOrder } from "./ledger";

export type OrderDocumentLines = Pick<Draft, "glass" | "services" | "accessories">;
export type StoredOrder = WorkshopOrder & {
  createdAt: string;
  updatedAt: string;
  lines: OrderDocumentLines;
};

const accessoryKey = (label: string) =>
  label.trim().toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "accessoire-sans-nom";

export function orderFromDraft(draft: Draft, now = new Date().toISOString()): StoredOrder {
  const accessories: AccessoryUse[] = draft.accessories.map((line) => ({
    accessoryId: accessoryKey(line.label),
    label: line.label.trim() || "Accessoire",
    quantity: line.quantity,
  }));
  return {
    id: draft.id,
    number: draft.number,
    customer: draft.customer,
    status: "draft",
    totalTTC: draft.total,
    accessories,
    payments: [],
    refunds: [],
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
  const lines = changes.lines ?? order.lines;
  const accessories = changes.accessories ?? order.accessories;
  return { ...order, customer, totalTTC, lines, accessories, updatedAt: now };
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
  // A cheque is a receivable, never a cash entry at the moment it is handed over.
  // Cash and bank transfers represent money already received when registered here.
  const recorded: Payment = {
    ...payment,
    status: payment.method === "Chèque" ? "pending" : "confirmed",
  };
  return { ...order, payments: [...order.payments, recorded], updatedAt: now };
}

export function confirmPayment(order: StoredOrder, paymentId: string, now = new Date().toISOString()): StoredOrder {
  let found = false;
  const payments = order.payments.map((payment) => {
    if (payment.id !== paymentId) return payment;
    found = true;
    if (payment.status === "cancelled") throw new Error("Un paiement annulé ne peut pas être encaissé.");
    return { ...payment, status: "confirmed" as const };
  });
  if (!found) throw new Error("Paiement introuvable.");
  return { ...order, payments, updatedAt: now };
}

export function addRefund(order: StoredOrder, refund: Refund, now = new Date().toISOString()): StoredOrder {
  if (!Number.isFinite(refund.amount) || refund.amount <= 0) throw new Error("Le montant du remboursement doit être supérieur à zéro.");
  if (order.refunds.some((item) => item.id === refund.id)) throw new Error("Identifiant de remboursement déjà utilisé.");
  return { ...order, refunds: [...order.refunds, { ...refund }], updatedAt: now };
}
