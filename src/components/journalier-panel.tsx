"use client";
import { useMemo, useState } from "react";
import type { CashMovement, PaymentMethod } from "@/lib/ledger";
import { deriveExpenseMovements, type ExpenseRecord } from "@/lib/operations";
import { derivePayrollMovements, type Employee, type PayrollWeek } from "@/lib/payroll";

const money=(n:number)=>new Intl.NumberFormat("fr-MA",{style:"currency",currency:"MAD",maximumFractionDigits:2}).format(n);
const methods:PaymentMethod[]=["Espèces","Virement","Chèque","Effet"];
const today=()=>{const now=new Date();return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");};

export function JournalierPanel({movements,scheduledMovements=[],expenses,employees,payrollWeeks}:{movements:CashMovement[];scheduledMovements?:CashMovement[];expenses:ExpenseRecord[];employees:Employee[];payrollWeeks:PayrollWeek[]}){
 const [date,setDate]=useState(today);
 const dailyExpenses=useMemo(()=>deriveExpenseMovements(expenses,date),[expenses,date]);
 const payrollMovements=useMemo(()=>derivePayrollMovements(payrollWeeks,employees),[payrollWeeks,employees]);
 const allMovements=useMemo(()=>[...movements,...scheduledMovements,...dailyExpenses,...payrollMovements],[movements,scheduledMovements,dailyExpenses,payrollMovements]);
 const dated=useMemo(()=>allMovements.filter(m=>m.date===date),[allMovements,date]);
 const undated=useMemo(()=>allMovements.filter(m=>!m.date),[allMovements]);
 const incoming=dated.filter(m=>m.direction==="Entrée").reduce((s,m)=>s+m.amount,0);
 const outgoing=dated.filter(m=>m.direction==="Sortie").reduce((s,m)=>s+m.amount,0);
 return <div className="content journalier-content">
  <div className="journalier-print-date">{new Date(date+"T00:00:00").toLocaleDateString("fr-FR")}</div>
  <div className="intro print-hide"><div><h2>Journalier · Entrée / Sortie</h2><p>Les charges et salaires sont répartis par jour ; les avances sont déduites du salaire pour éviter tout double comptage.</p></div><div className="intro-actions print-hide"><label className="field"><span>Date du journal</span><input className="text-input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button className="add-btn" onClick={()=>window.print()}>Imprimer le journal</button></div></div>
  <section className="panel journalier-totals print-hide">
   <div className="summary-line"><span>Total Entrée</span><strong className="amount-in">{money(incoming)}</strong></div>
   <div className="summary-line"><span>Total Sortie</span><strong className="amount-out">{money(outgoing)}</strong></div>
   <div className="summary-divider"/>
   <div className="total-box"><span>Solde net du jour</span><strong className={incoming-outgoing<0?"amount-out":"amount-in"}>{money(incoming-outgoing)}</strong></div>
  </section>
  {methods.map(method=>{
   const rows=dated.filter(m=>m.method===method);
   const ins=rows.filter(m=>m.direction==="Entrée");
   const outs=rows.filter(m=>m.direction==="Sortie");
   const sum=(items:CashMovement[])=>items.reduce((s,m)=>s+m.amount,0);
   return <section className="panel" key={method}>
    <div className="panel-heading"><div><h3>{method}</h3><p>Entrée {money(sum(ins))} · Sortie {money(sum(outs))}</p></div></div>
    <div className="form-grid" style={{gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:16}}>
     <div><h4>Entrée</h4>{ins.length?ins.map((m,i)=><div className="saved-draft" key={m.orderId+"-in-"+i}><div><strong>{m.reference} {m.counterparty||"Client"}</strong><span>{m.kind} · {m.date}</span></div><strong className="amount-in">{money(m.amount)}</strong></div>):<div className="empty-inline">Aucune entrée.</div>}</div>
     <div><h4>Sortie</h4>{outs.length?outs.map((m,i)=><div className="saved-draft" key={m.orderId+"-out-"+i}><div><strong>{m.reference} {m.counterparty||m.kind}</strong><span>{m.kind} · {m.date}</span></div><strong className="amount-out">{money(m.amount)}</strong></div>):<div className="empty-inline">Aucune sortie.</div>}</div>
    </div>
   </section>;
  })}
  {undated.length>0&&<section className="panel"><div className="panel-heading"><div><h3>Date non renseignée</h3><p>حركات قديمة لا تحتوي على تاريخ التحصيل أو الأداء؛ لم نُسند إليها تاريخاً من عندنا.</p></div><strong>{money(undated.reduce((s,m)=>s+(m.direction==="Entrée"?m.amount:-m.amount),0))}</strong></div>{undated.map((m,i)=><div className="saved-draft" key={m.orderId+"-undated-"+i}><div><strong>{m.reference} · {m.kind}</strong><span>{m.counterparty||"—"} · {m.method} · {m.direction}</span></div><strong className={m.direction==="Entrée"?"amount-in":"amount-out"}>{money(m.amount)}</strong></div>)}</section>}
  {!dated.length&&!undated.length&&<section className="panel"><div className="empty-inline">لا توجد حركات مسجلة.</div></section>}
 </div>;
}
