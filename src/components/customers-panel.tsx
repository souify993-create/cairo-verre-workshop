"use client";
import { useMemo, useState } from "react";
import type { CustomerBalance } from "@/lib/ledger";
const money=(n:number)=>new Intl.NumberFormat("fr-MA",{style:"currency",currency:"MAD",maximumFractionDigits:2}).format(n);
export function CustomersPanel({customers}:{customers:CustomerBalance[]}){
 const [search,setSearch]=useState("");
 const filtered=useMemo(()=>customers.filter(c=>c.customer.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr"))),[customers,search]);
 return <div className="content">
  <div className="intro"><div><h2>Comptes clients</h2><p>Soldes calculés automatiquement depuis les commandes livrées et les paiements confirmés.</p></div><span className="draft-count">{customers.length} client(s)</span></div>
  <section className="panel"><div className="panel-heading"><div><h3>Situation des comptes</h3><p>Les brouillons et les chèques non encaissés sont exclus des montants payés.</p></div></div>
   <input className="text-input" style={{width:"100%",maxWidth:420,marginBottom:14}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un client..."/>
   {filtered.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{["Client","Total TTC","Payé","Reste","Avoir"].map(x=><th key={x} style={{textAlign:x==="Client"?"left":"right",padding:10}}>{x}</th>)}</tr></thead><tbody>{filtered.map(c=><tr key={c.customer} style={{borderTop:"1px solid #e7ecee"}}><td style={{padding:10,fontWeight:650}}>{c.customer}</td><td style={{padding:10,textAlign:"right"}}>{money(c.total)}</td><td style={{padding:10,textAlign:"right"}}>{money(c.paid)}</td><td style={{padding:10,textAlign:"right"}}>{money(c.remaining)}</td><td style={{padding:10,textAlign:"right",color:c.credit>0?"#167b78":"inherit"}}>{money(c.credit)}</td></tr>)}</tbody></table></div>:<div className="empty-inline">{search?"Aucun client ne correspond à la recherche.":"Aucun compte client : ils apparaissent après la livraison d'une commande."}</div>}
  </section>
 </div>;
}
