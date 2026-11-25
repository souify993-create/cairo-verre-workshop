"use client";
import { useMemo, useState } from "react";
import type { StoredOrder } from "@/lib/workshop";

type Method = "Espèces" | "Virement" | "Chèque" | "Effet";
const money = (n: number) => new Intl.NumberFormat("fr-MA", { style: "currency", currency: "MAD", maximumFractionDigits: 2 }).format(n);
const remainingFor = (order: StoredOrder) => {
  const paid = order.payments.filter(p => p.status === "confirmed").reduce((s, p) => s + p.amount, 0);
  const refunded = order.refunds.filter(r => r.status === "confirmed").reduce((s, r) => s + r.amount, 0);
  return Math.max(0, order.totalTTC - paid + refunded);
};

export function CaissePaymentPanel({ orders, onRecordPayment }: {
  orders: StoredOrder[];
  onRecordPayment: (order: StoredOrder, amount: number, method: Method, details?: { reference: string; dueDate: string }) => Promise<boolean>;
}) {
  const eligible = useMemo(() => orders.filter(o => o.status === "delivered" && o.customer.trim() && remainingFor(o) > 0.009), [orders]);
  const customers = useMemo(() => [...new Set(eligible.map(o => o.customer.trim()))].sort((a, b) => a.localeCompare(b, "fr")), [eligible]);
  const [customer, setCustomer] = useState("");
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("Espèces");
  const [reference, setReference] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const customerOrders = eligible.filter(o => o.customer.trim() === customer);
  const selectedOrder = customerOrders.find(o => o.id === orderId) || customerOrders[0];
  const remaining = selectedOrder ? remainingFor(selectedOrder) : 0;
  const parsed = Number(amount);
  const validAmount = amount.trim() !== "" && Number.isFinite(parsed) && parsed > 0 && parsed <= remaining + 0.009;

  return <section className="panel">
    <div className="panel-heading"><div><h3>Encaisser un reste client</h3><p>Choisissez le client et sa commande, puis enregistrez le montant reçu.</p></div></div>
    {eligible.length === 0 ? <div className="empty-inline">Aucun reste à encaisser pour le moment.</div> : <>
      <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
        <label className="field"><span>Client</span><select className="text-input" value={customer} onChange={e => { setCustomer(e.target.value); setOrderId(""); setAmount(""); setReference(""); setDueDate(""); }}>
          <option value="">Choisir un client</option>{customers.map(name => <option key={name} value={name}>{name}</option>)}
        </select></label>
        <label className="field"><span>Commande</span><select className="text-input" value={selectedOrder?.id || ""} onChange={e => { setOrderId(e.target.value); setAmount(""); }} disabled={!customerOrders.length}>
          {customerOrders.map(o => <option key={o.id} value={o.id}>{o.number} · Reste {money(remainingFor(o))}</option>)}
        </select></label>
        <label className="field"><span>Montant reçu (DH)</span><input className="text-input" type="number" min="0.01" max={remaining} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ex. 500"/></label>
        <label className="field"><span>Mode de paiement</span><select className="text-input" value={method} onChange={e => setMethod(e.target.value as Method)}>
          <option>Espèces</option><option>Virement</option><option>Chèque</option><option>Effet</option>
        </select></label>
        {(method === "Chèque" || method === "Effet") && <><label className="field"><span>Numéro du chèque / effet</span><input className="text-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Référence obligatoire"/></label><label className="field"><span>Date d’échéance</span><input className="text-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label></>}
      </div>
      {selectedOrder && <div className="summary-line" style={{ marginTop: 14 }}><span>Reste à payer · {selectedOrder.number}</span><strong>{money(remaining)}</strong></div>}
      <div className="draft-actions" style={{ marginTop: 14 }}><button className="add-btn" disabled={!selectedOrder || !validAmount || saving || ((method === "Chèque" || method === "Effet") && (!reference.trim() || !dueDate))} onClick={async () => {
        if (!selectedOrder || !validAmount) return;
        setSaving(true);
        try { if (await onRecordPayment(selectedOrder, parsed, method, (method === "Chèque" || method === "Effet") ? { reference: reference.trim(), dueDate } : undefined)) setAmount(""); }
        finally { setSaving(false); }
      }}>{saving ? "Enregistrement…" : "Enregistrer l'encaissement"}</button></div>
      {(method === "Chèque" || method === "Effet") && <p className="local-note">Le chèque ou l’effet sera enregistré dans le suivi, planifié au Journalier à sa date d’échéance et restera en attente jusqu’à sa régularisation.</p>}
    </>}
  </section>;
}
