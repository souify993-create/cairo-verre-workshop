"use client";
import { useMemo, useState } from "react";
import type { CustomerBalance } from "@/lib/ledger";
import type { StoredOrder } from "@/lib/workshop";
const money=(n:number)=>new Intl.NumberFormat("fr-MA",{style:"currency",currency:"MAD",maximumFractionDigits:2}).format(n);
const netPaid=(order:StoredOrder)=>order.payments.filter(p=>p.status==="confirmed").reduce((s,p)=>s+p.amount,0)-order.refunds.filter(r=>r.status==="confirmed").reduce((s,r)=>s+r.amount,0);
export function CustomersPanel({customers,orders,onSettleAvoir}:{customers:CustomerBalance[];orders:StoredOrder[];onSettleAvoir:(orderId:string,avoirId:string)=>void}){
 const [search,setSearch]=useState(""),[page,setPage]=useState(0),[selected,setSelected]=useState<string|null>(null);
 const filtered=useMemo(()=>customers.filter(c=>c.customer.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr"))),[customers,search]);
 const pageSize=10,pageCount=Math.max(1,Math.ceil(filtered.length/pageSize)),visible=filtered.slice(page*pageSize,(page+1)*pageSize);
 const statement=selected?orders.filter(o=>o.customer===selected).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)):[];
 const avoirs=orders.flatMap(order=>(order.avoirs||[]).filter(avoir=>avoir.status==="pending").map(avoir=>({order,avoir})));
 return <div className="content">
  <div className="intro"><div><h2>Comptes clients</h2><p>Soldes calculés depuis les commandes livrées, paiements encaissés et remboursements réels.</p></div><span className="draft-count">{customers.length} client(s)</span></div>
  <section className="panel"><div className="panel-heading"><div><h3 style={{color:"#c6534b"}}>Client Avoir</h3><p>Les avoirs issus des modifications de commandes. Leur règlement ne crée aucune Sortie dans la caisse.</p></div><span className="draft-count">{avoirs.length} avoir(s)</span></div>
   {avoirs.length?avoirs.map(({order,avoir})=><div className="saved-draft" key={avoir.id}><div><strong>{order.customer} · {order.number}</strong><span>{avoir.date} · Avoir client en attente</span></div><strong>{money(avoir.amount)}</strong><button className="add-btn" onClick={()=>onSettleAvoir(order.id,avoir.id)}>Rembourser</button></div>):<div className="empty-inline">Aucun avoir client en attente.</div>}
  </section>
  <section className="panel"><div className="panel-heading"><div><h3>Situation des comptes</h3><p>Les brouillons et les chèques non encaissés sont exclus des montants payés.</p></div></div>
   <input className="text-input" style={{width:"100%",maxWidth:420,marginBottom:14}} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Rechercher un client..."/>
   {visible.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{["Client","Total TTC","Payé","Reste","Avoir",""].map(x=><th key={x} style={{textAlign:x==="Client"?"left":"right",padding:10}}>{x}</th>)}</tr></thead><tbody>{visible.map(c=><tr key={c.customer} style={{borderTop:"1px solid #e7ecee"}}><td style={{padding:10,fontWeight:650}}>{c.customer}</td><td style={{padding:10,textAlign:"right"}}>{money(c.total)}</td><td style={{padding:10,textAlign:"right"}}>{money(c.paid)}</td><td style={{padding:10,textAlign:"right"}}>{money(c.remaining)}</td><td style={{padding:10,textAlign:"right",color:c.credit>0?"#167b78":"inherit"}}>{money(c.credit)}</td><td style={{padding:10}}><button className="add-btn" onClick={()=>setSelected(selected===c.customer?null:c.customer)}>{selected===c.customer?"Fermer":"Compte"}</button></td></tr>)}</tbody></table></div>:<div className="empty-inline">{search?"Aucun client ne correspond à la recherche.":"Aucun compte client : ils apparaissent après la livraison d'une commande."}</div>}
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14}}><span className="local-note">Page {page+1} / {pageCount}</span><div style={{display:"flex",gap:8}}><button className="add-btn" disabled={page===0} onClick={()=>setPage(v=>Math.max(0,v-1))}>Précédent</button><button className="add-btn" disabled={page+1>=pageCount} onClick={()=>setPage(v=>Math.min(pageCount-1,v+1))}>Suivant</button></div></div>
   {selected&&<div className="customer-statement" style={{marginTop:18,paddingTop:16,borderTop:"1px solid #e7ecee"}}><div className="panel-heading"><div><h3>Compte client · {selected}</h3><p>Liste des commandes de ce client.</p></div><button className="add-btn print-hide" onClick={()=>window.print()}>Imprimer les commandes</button></div>
    {statement.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{["Date","N° CMD","État","Total TTC","Payé net","Reste"].map(x=><th key={x} style={{textAlign:["Date","N° CMD","État"].includes(x)?"left":"right",padding:9}}>{x}</th>)}</tr></thead><tbody>{statement.map(o=>{const paid=netPaid(o);return <tr key={o.id} style={{borderTop:"1px solid #e7ecee"}}><td style={{padding:9}}>{o.createdAt.slice(0,10)}</td><td style={{padding:9}}>{o.number}</td><td style={{padding:9}}>{o.status==="delivered"?"Livrée":"Annulée"}</td><td style={{padding:9,textAlign:"right"}}>{money(o.status==="delivered"?o.totalTTC:0)}</td><td style={{padding:9,textAlign:"right"}}>{money(paid)}</td><td style={{padding:9,textAlign:"right"}}>{money(Math.max(0,(o.status==="delivered"?o.totalTTC:0)-paid))}</td></tr>;})}</tbody></table>

    </div>:<div className="empty-inline">Aucune commande enregistrée pour ce client.</div>}
   </div>}
  </section>
 </div>;
}
