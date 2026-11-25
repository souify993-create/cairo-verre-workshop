"use client";
import { useMemo, useState } from "react";
import type { StoredOrder } from "@/lib/workshop";
import type { SupplierInvoice } from "@/lib/workshop-storage";

type Kind = "Chèque" | "Effet";
type Filter = "Tous" | "Clients" | "Fournisseurs" | "Archive";
const money=(n:number)=>new Intl.NumberFormat("fr-MA",{style:"currency",currency:"MAD",maximumFractionDigits:2}).format(n);
const dateLabel=(d?:string)=>d?new Date(d+"T12:00:00").toLocaleDateString("fr-FR"):"—";

export function ChequesEffetsPanel({orders,invoices,onUpdateOrder,onUpdateInvoice}:{orders:StoredOrder[];invoices:SupplierInvoice[];onUpdateOrder:(order:StoredOrder)=>Promise<boolean>;onUpdateInvoice:(invoice:SupplierInvoice)=>Promise<boolean>}){
 const [filter,setFilter]=useState<Filter>("Tous");
 const [kind,setKind]=useState<"Tous"|Kind>("Tous");
 const [status,setStatus]=useState<"Tous"|"En attente"|"Réglé"|"Supprimé">("Tous");
 const rows=useMemo(()=>{
  const customerRows=orders.flatMap(order=>order.payments.filter(p=>p.method==="Chèque"||p.method==="Effet").map(p=>({id:p.id,ownerId:order.id,owner:order.customer,document:order.number,kind:p.method as Kind,reference:p.reference||"—",amount:p.amount,registered:p.date,due:p.dueDate||p.date,state:p.status==="confirmed"?"Réglé":p.status==="cancelled"?"Supprimé":"En attente",side:"Clients" as const})));
  const supplierRows=invoices.flatMap(invoice=>(invoice.payments||[]).filter(p=>p.method==="Chèque"||p.method==="Effet").map(p=>({id:p.id,ownerId:invoice.id,owner:invoice.supplier,document:invoice.invoiceNumber,kind:p.method as Kind,reference:p.reference||invoice.chequeNumber||"—",amount:p.amount,registered:p.date,due:p.dueDate||invoice.chequeDate||p.date,state:p.status==="confirmed"?"Réglé":p.status==="cancelled"?"Supprimé":"En attente",side:"Fournisseurs" as const})));
  return [...customerRows,...supplierRows];
 },[orders,invoices]);
 const visible=rows.filter(r=>(filter==="Archive"?r.state!=="En attente":filter==="Tous"?true:r.side===filter&&r.state==="En attente")&&(kind==="Tous"||r.kind===kind)&&(status==="Tous"||r.state===status));
 const settle=async(row:typeof rows[number])=>{
  if(row.side==="Clients"){const order=orders.find(o=>o.id===row.ownerId);if(!order)return;const updated={...order,payments:order.payments.map(p=>p.id===row.id?{...p,status:"confirmed" as const}:p),updatedAt:new Date().toISOString()};await onUpdateOrder(updated);}
  else {const invoice=invoices.find(x=>x.id===row.ownerId);if(!invoice)return;await onUpdateInvoice({...invoice,payments:(invoice.payments||[]).map(p=>p.id===row.id?{...p,status:"confirmed" as const}:p)});}
 };
 const remove=async(row:typeof rows[number])=>{
  if(!window.confirm("Supprimer ce "+row.kind+" ? Le montant reviendra automatiquement au reste dû et l’opération restera dans l’archive."))return;
  if(row.side==="Clients"){const order=orders.find(o=>o.id===row.ownerId);if(!order)return;await onUpdateOrder({...order,payments:order.payments.map(p=>p.id===row.id?{...p,status:"cancelled" as const}:p),updatedAt:new Date().toISOString()});}
  else {const invoice=invoices.find(x=>x.id===row.ownerId);if(!invoice)return;await onUpdateInvoice({...invoice,payments:(invoice.payments||[]).map(p=>p.id===row.id?{...p,status:"cancelled" as const}:p)});}
 };
 const total=visible.reduce((s,r)=>s+r.amount,0);
 return <div className="content">
  <div className="intro"><div><h2>Chèques & effets</h2><p>Suivi des règlements clients et fournisseurs, échéances et archive.</p></div><span className="draft-count">{rows.length} opération(s)</span></div>
  <section className="panel print-hide"><div className="panel-heading"><div><h3>Préparer la liste à imprimer</h3><p>Filtrez les opérations puis imprimez la liste affichée.</p></div></div>
   <div className="form-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
    <label className="field"><span>Partie</span><select className="text-input" value={filter} onChange={e=>setFilter(e.target.value as Filter)}><option>Tous</option><option>Clients</option><option>Fournisseurs</option><option>Archive</option></select></label>
    <label className="field"><span>Type</span><select className="text-input" value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option>Tous</option><option>Chèque</option><option>Effet</option></select></label>
    <label className="field"><span>Statut</span><select className="text-input" value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option>Tous</option><option>En attente</option><option>Réglé</option><option>Supprimé</option></select></label>
   </div>
   <div className="draft-actions" style={{justifyContent:"space-between",marginTop:12}}><strong>{visible.length} ligne(s) · {money(total)}</strong><button className="add-btn" onClick={()=>window.print()}>Imprimer la liste</button></div>
  </section>
  <section className="panel">
   <div className="panel-heading"><div><h3>{filter==="Archive"?"Archive chèques & effets":filter==="Tous"?"Clients & fournisseurs":filter+" — à régulariser"}</h3><p>Les lignes réglées ou supprimées restent conservées dans l’archive.</p></div></div>
   {visible.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:760}}><thead><tr>{["Nom","Type","Référence","Montant","Document lié","Date enregistrée","Échéance","Statut",""].map(h=><th key={h} style={{textAlign:"left",padding:9,borderBottom:"1px solid #dce4e8"}}>{h}</th>)}</tr></thead><tbody>{visible.map(row=><tr key={row.side+row.ownerId+row.id} style={{background:row.state==="Réglé"?"#e8f6ec":row.state==="Supprimé"?"#f1f3f5":undefined}}><td style={{padding:9,borderBottom:"1px solid #e8edef"}}>{row.owner}<small style={{display:"block",color:"#687985"}}>{row.side}</small></td><td>{row.kind}</td><td><strong>{row.reference}</strong></td><td>{money(row.amount)}</td><td>{row.document}</td><td>{dateLabel(row.registered)}</td><td>{dateLabel(row.due)}</td><td><strong>{row.state}</strong></td><td className="print-hide" style={{whiteSpace:"nowrap"}}>{row.state==="En attente"&&<><button className="icon-btn" title="Régler" onClick={()=>settle(row)}>✓</button><button className="icon-btn danger" title="Supprimer" onClick={()=>remove(row)}>×</button></>}</td></tr>)}</tbody></table></div>:<div className="empty-inline">Aucune opération ne correspond aux filtres.</div>}
   <div className="summary-line" style={{marginTop:16}}><span>{visible.length} opération(s)</span><strong>{money(total)}</strong></div>
  </section>
 </div>;
}
