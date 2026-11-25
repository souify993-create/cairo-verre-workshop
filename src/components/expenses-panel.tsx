"use client";
import { useState } from "react";
import type { ExpenseCategory, ExpenseFrequency, ExpenseRecord } from "@/lib/operations";
import type { PaymentMethod } from "@/lib/ledger";
const categories:ExpenseCategory[]=["Loyer","Eau","Électricité","Maintenance","Carburant","Avance","Salaire","Autres"];
const frequencies:ExpenseFrequency[]=["Jour","Semaine","Mois","Année"];
const methods:PaymentMethod[]=["Espèces","Virement","Chèque"];
const divisor:Record<ExpenseFrequency,number>={Jour:1,Semaine:6,Mois:30,Année:365};
const money=(n:number)=>new Intl.NumberFormat("fr-MA",{style:"currency",currency:"MAD",maximumFractionDigits:2}).format(n);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
export function ExpensesPanel({expenses,onAdd}:{expenses:ExpenseRecord[];onAdd:(x:ExpenseRecord)=>void}){
 const [name,setName]=useState(""),[category,setCategory]=useState<ExpenseCategory>("Loyer"),[amount,setAmount]=useState(0),[frequency,setFrequency]=useState<ExpenseFrequency>("Mois"),[method,setMethod]=useState<PaymentMethod>("Espèces"),[startDate,setStartDate]=useState(today()),[endDate,setEndDate]=useState("");
 const submit=()=>{if(!name.trim()||amount<=0||!startDate)return;onAdd({id:crypto.randomUUID(),name:name.trim(),category,amount,frequency,paymentMethod:method,startDate,...(endDate?{endDate}:{})});setName("");setAmount(0);setEndDate("");};
 return <div className="content"><div className="intro"><div><h2>Dépenses et charges</h2><p>Répartition journalière : Jour ÷1, Semaine ÷6, Mois ÷30, Année ÷365.</p></div><span className="draft-count">{expenses.length} charge(s)</span></div>
 <section className="panel"><div className="panel-heading"><div><h3>Ajouter une dépense récurrente</h3><p>Elle apparaît en Sortie chaque jour de sa période d’activité.</p></div></div>
 <div className="form-grid" style={{gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>
 <label className="field"><span>Nom</span><input className="text-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex. Loyer atelier"/></label>
 <label className="field"><span>Catégorie</span><select className="text-input" value={category} onChange={e=>setCategory(e.target.value as ExpenseCategory)}>{categories.map(x=><option key={x}>{x}</option>)}</select></label>
 <label className="field"><span>Montant (DH)</span><input className="text-input" type="number" min="0" value={amount||""} onChange={e=>setAmount(Number(e.target.value))}/></label>
 <label className="field"><span>Périodicité</span><select className="text-input" value={frequency} onChange={e=>setFrequency(e.target.value as ExpenseFrequency)}>{frequencies.map(x=><option key={x}>{x}</option>)}</select></label>
 <label className="field"><span>Méthode</span><select className="text-input" value={method} onChange={e=>setMethod(e.target.value as PaymentMethod)}>{methods.map(x=><option key={x}>{x}</option>)}</select></label>
 <label className="field"><span>Date de début</span><input className="text-input" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
 <label className="field"><span>Date de fin (facultative)</span><input className="text-input" type="date" min={startDate} value={endDate} onChange={e=>setEndDate(e.target.value)}/></label></div>
 <div className="total-box"><span>Charge journalière</span><strong>{money(amount/divisor[frequency])}</strong></div><button className="save-btn" onClick={submit} disabled={!name.trim()||amount<=0||!startDate}>Enregistrer la dépense</button></section>
 <section className="panel"><div className="panel-heading"><div><h3>Charges enregistrées</h3><p>Les charges terminées restent dans l’historique.</p></div></div>{expenses.length?expenses.map(x=><div className="saved-draft" key={x.id}><div><strong>{x.name} · {x.category}</strong><span>{money(x.amount)} / {x.frequency.toLowerCase()} · {x.paymentMethod} · {x.startDate}{x.endDate?" → "+x.endDate:" → En cours"}</span></div><strong>{money(x.amount/divisor[x.frequency])}/jour</strong></div>):<div className="empty-inline">Aucune dépense enregistrée.</div>}</section></div>;
}