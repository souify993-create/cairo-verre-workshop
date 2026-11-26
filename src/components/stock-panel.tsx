"use client";
import { useState } from "react";
import type { AccessoryPurchase } from "@/lib/ledger";

const money=(n:number)=>new Intl.NumberFormat("fr-MA",{style:"currency",currency:"MAD",maximumFractionDigits:2}).format(n);
const makeId=(name:string)=>name.trim().toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

export function StockPanel({purchases,stock,onAdd,accessoryCatalog}:{purchases:AccessoryPurchase[];stock:{accessoryId:string;label:string;purchased:number;consumed:number;available:number}[];onAdd:(purchase:AccessoryPurchase)=>void;accessoryCatalog:readonly string[]}){
 const [label,setLabel]=useState("");const [quantity,setQuantity]=useState(1);
 const submit=()=>{const name=label.trim();if(!name||!Number.isFinite(quantity)||quantity<=0)return;onAdd({accessoryId:makeId(name),label:name,quantity});setLabel("");setQuantity(1);};
 return <div className="content">
  <datalist id="stock-accessory-catalog">{accessoryCatalog.map(name=><option key={name} value={name}/>)}</datalist>
  <div className="intro"><div><h2>Stock des accessoires</h2><p>Seuls les accessoires achetés et consommés sont suivis. Le vitrage n'est pas stocké.</p></div></div>
  <section className="panel"><div className="panel-heading"><div><h3>Enregistrer un achat d'accessoires</h3><p>La quantité achetée augmente immédiatement le stock disponible.</p></div></div>
   <div className="line-row"><input className="text-input item-name" list="stock-accessory-catalog" value={label} onChange={e=>setLabel(e.target.value)} placeholder="Rechercher un accessoire"/><label className="field"><span>Quantité achetée</span><input type="number" min="0.01" step="any" value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label><button className="add-btn" disabled={!label.trim()||quantity<=0} onClick={submit}>+ Enregistrer l'achat</button></div>
  </section>
  <section className="panel"><div className="panel-heading"><div><h3>État du stock</h3><p>Disponible = quantité achetée − quantité consommée par les commandes livrées.</p></div><span className="draft-count">{stock.length} référence(s)</span></div>
    {stock.some(row=>row.available<=50)&&<div role="alert" style={{padding:12,marginBottom:12,borderRadius:8,background:"#fff7e6",border:"1px solid #f1d18a",color:"#805b13",fontSize:13}}>
      <strong>Alertes de stock (seuil : 50)</strong>
      {stock.filter(row=>row.available<=50).map(row=><div key={row.accessoryId}>{row.label} : {row.available} disponible(s)</div>)}
    </div>}
   {stock.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr><th style={{textAlign:"left",padding:10}}>Accessoire</th><th style={{textAlign:"right",padding:10}}>Acheté</th><th style={{textAlign:"right",padding:10}}>Consommé</th><th style={{textAlign:"right",padding:10}}>Disponible</th></tr></thead><tbody>{stock.map(row=><tr key={row.accessoryId} style={{borderTop:"1px solid #e7ecee"}}><td style={{padding:10}}>{row.label}</td><td style={{padding:10,textAlign:"right"}}>{row.purchased}</td><td style={{padding:10,textAlign:"right"}}>{row.consumed}</td><td style={{padding:10,textAlign:"right",fontWeight:700,color:row.available<=50?"#b7791f":"#167b78"}}>{row.available}</td></tr>)}</tbody></table></div>:<div className="empty-inline">Aucun achat d'accessoire enregistré.</div>}
  </section>
 </div>;
}
