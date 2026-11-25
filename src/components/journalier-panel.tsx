"use client";
import { useMemo, useState } from "react";
import type { CashMovement, PaymentMethod } from "@/lib/ledger";

const money=(n:number)=>new Intl.NumberFormat("fr-MA",{style:"currency",currency:"MAD",maximumFractionDigits:2}).format(n);
const methods:PaymentMethod[]=["Espèces","Virement","Chèque"];
const today=()=>{const now=new Date();return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");};

export function JournalierPanel({movements}:{movements:CashMovement[]}){
 const [date,setDate]=useState(today);
 const dated=useMemo(()=>movements.filter(m=>m.date===date),[movements,date]);
 const undated=useMemo(()=>movements.filter(m=>!m.date),[movements]);
 const incoming=dated.filter(m=>m.direction==="Entrée").reduce((s,m)=>s+m.amount,0);
 const outgoing=dated.filter(m=>m.direction==="Sortie").reduce((s,m)=>s+m.amount,0);
 return <div className="content">
  <div className="intro"><div><h2>Journalier · Entrée / Sortie</h2><p>Chaque mouvement réel dans sa méthode de paiement, sans doublons ni opérations en attente.</p></div><label className="field"><span>Date du journal</span><input className="text-input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
  <section className="panel">
   <div className="summary-line"><span>Total Entrée</span><strong>{money(incoming)}</strong></div>
   <div className="summary-line"><span>Total Sortie</span><strong>{money(outgoing)}</strong></div>
   <div className="summary-divider"/>
   <div className="total-box"><span>Solde net du jour</span><strong>{money(incoming-outgoing)}</strong></div>
  </section>
  {methods.map(method=>{
   const rows=dated.filter(m=>m.method===method);
   const ins=rows.filter(m=>m.direction==="Entrée");
   const outs=rows.filter(m=>m.direction==="Sortie");
   const sum=(items:CashMovement[])=>items.reduce((s,m)=>s+m.amount,0);
   return <section className="panel" key={method}>
    <div className="panel-heading"><div><h3>{method}</h3><p>Entrée {money(sum(ins))} · Sortie {money(sum(outs))}</p></div></div>
    <div className="form-grid" style={{gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:16}}>
     <div><h4>Entrée</h4>{ins.length?ins.map((m,i)=><div className="saved-draft" key={m.orderId+"-in-"+i}><div><strong>{m.reference} · {m.kind}</strong><span>{m.counterparty||"Client"} · {m.date}</span></div><strong>{money(m.amount)}</strong></div>):<div className="empty-inline">Aucune entrée.</div>}</div>
     <div><h4>Sortie</h4>{outs.length?outs.map((m,i)=><div className="saved-draft" key={m.orderId+"-out-"+i}><div><strong>{m.reference} · {m.kind}</strong><span>{m.counterparty||"—"} · {m.date}</span></div><strong>{money(m.amount)}</strong></div>):<div className="empty-inline">Aucune sortie.</div>}</div>
    </div>
   </section>;
  })}
  {undated.length>0&&<section className="panel"><div className="panel-heading"><div><h3>Date non renseignée</h3><p>حركات قديمة لا تحتوي على تاريخ التحصيل أو الأداء؛ لم نُسند إليها تاريخاً من عندنا.</p></div><strong>{money(undated.reduce((s,m)=>s+(m.direction==="Entrée"?m.amount:-m.amount),0))}</strong></div>{undated.map((m,i)=><div className="saved-draft" key={m.orderId+"-undated-"+i}><div><strong>{m.reference} · {m.kind}</strong><span>{m.counterparty||"—"} · {m.method} · {m.direction}</span></div><strong>{money(m.amount)}</strong></div>)}</section>}
  {!dated.length&&!undated.length&&<section className="panel"><div className="empty-inline">لا توجد حركات مسجلة.</div></section>}
 </div>;
}
