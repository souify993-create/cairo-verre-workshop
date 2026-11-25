export type PaymentMethod = "Espèces" | "Virement" | "Chèque";
export type OrderStatus = "draft" | "delivered" | "cancelled";
export type AccessoryUse = { accessoryId: string; label: string; quantity: number };
export type Payment = { id: string; method: PaymentMethod; amount: number; status: "pending" | "confirmed" | "cancelled"; date?: string };
export type Refund = { id: string; method: PaymentMethod; amount: number; status: "pending" | "confirmed"; date?: string };
export type WorkshopOrder = {
  id: string;
  number: string;
  customer: string;
  status: OrderStatus;
  totalTTC: number;
  accessories: AccessoryUse[];
  payments: Payment[];
  refunds: Refund[];
};
export type AccessoryPurchase = { accessoryId: string; label: string; quantity: number };
export type CashMovement = { orderId: string; reference: string; method: PaymentMethod; direction: "Entrée" | "Sortie"; amount: number; kind: "Paiement" | "Remboursement" | "Achat fournisseur"; counterparty?: string; date?: string };
export type CustomerBalance = { customer: string; total: number; paid: number; remaining: number; credit: number };
export type LedgerSnapshot = {
  cashMovements: CashMovement[];
  customers: CustomerBalance[];
  stock: { accessoryId: string; label: string; purchased: number; consumed: number; available: number }[];
  warnings: string[];
};
const positive = (n: number) => Number.isFinite(n) ? Math.max(0, n) : 0;

/**
 * Rebuilds derived business effects from source records.
 * Drafts never affect stock, customer balances or the cash journal.
 * Re-running after an edit does not append duplicate movements.
 */
export function deriveLedger(orders: WorkshopOrder[], purchases: AccessoryPurchase[], supplierInvoices: { id: string; supplier: string; invoiceNumber: string; paidAmount: number; paymentMethod: PaymentMethod | "Non réglé"; paidDate?: string }[] = []): LedgerSnapshot {
  const cashMovements: CashMovement[] = [];
  const customerMap = new Map<string, { total: number; paid: number }>();
  const stockMap = new Map<string, { label: string; purchased: number; consumed: number }>();
  const warnings: string[] = [];

  for (const purchase of purchases) {
    const row = stockMap.get(purchase.accessoryId) ?? { label: purchase.label, purchased: 0, consumed: 0 };
    row.purchased += positive(purchase.quantity);
    row.label = purchase.label || row.label;
    stockMap.set(purchase.accessoryId, row);
  }

  for (const order of orders) {
    if (order.status === "draft") continue;
    const customer = order.customer.trim();
    if (customer) {
      const row = customerMap.get(customer) ?? { total: 0, paid: 0 };
      if (order.status === "delivered") row.total += positive(order.totalTTC);
      customerMap.set(customer, row);
    }
    if (order.status === "delivered") for (const use of order.accessories) {
      const row = stockMap.get(use.accessoryId) ?? { label: use.label, purchased: 0, consumed: 0 };
      row.label = use.label || row.label;
      row.consumed += positive(use.quantity);
      stockMap.set(use.accessoryId, row);
    }
    for (const payment of order.payments) {
      if (payment.status !== "confirmed") continue;
      const amount = positive(payment.amount);
      if (!amount) continue;
      if (customer) customerMap.get(customer)!.paid += amount;
      cashMovements.push({ orderId: order.id, reference: order.number, method: payment.method, direction: "Entrée", amount, kind: "Paiement", ...(payment.date ? { date: payment.date } : {}) });
    }
    for (const refund of order.refunds) {
      if (refund.status !== "confirmed") continue;
      const amount = positive(refund.amount);
      if (!amount) continue;
      if (customer) customerMap.get(customer)!.paid -= amount;
      cashMovements.push({ orderId: order.id, reference: order.number, method: refund.method, direction: "Sortie", amount, kind: "Remboursement", ...(refund.date ? { date: refund.date } : {}) });
    }
  }

  for (const invoice of supplierInvoices) {
    const amount = positive(invoice.paidAmount);
    if (amount > 0 && invoice.paymentMethod !== "Non réglé") {
      cashMovements.push({ orderId: invoice.id, reference: invoice.invoiceNumber, method: invoice.paymentMethod, direction: "Sortie", amount, kind: "Achat fournisseur", counterparty: invoice.supplier, ...(invoice.paidDate ? { date: invoice.paidDate } : {}) });
    }
  }

  const customers = [...customerMap.entries()].map(([customer, values]) => ({
    customer,
    total: values.total,
    paid: values.paid,
    remaining: Math.max(0, values.total - values.paid),
    credit: Math.max(0, values.paid - values.total),
  })).sort((a, b) => a.customer.localeCompare(b.customer, "fr"));

  const stock = [...stockMap.entries()].map(([accessoryId, values]) => {
    const available = values.purchased - values.consumed;
    if (available < 0) warnings.push(`Stock insuffisant : ${values.label} (${Math.abs(available)} en manque).`);
    return { accessoryId, label: values.label, purchased: values.purchased, consumed: values.consumed, available };
  }).sort((a, b) => a.label.localeCompare(b.label, "fr"));

  return { cashMovements, customers, stock, warnings };
}
