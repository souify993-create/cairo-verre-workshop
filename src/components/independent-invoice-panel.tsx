"use client";
import { useState } from "react";
import { independentInvoiceNumber } from "@/lib/independent-invoice";
import type { IndependentInvoiceRecord } from "@/lib/workshop-storage";

const money = (n: number) => new Intl.NumberFormat("fr-MA", { style: "currency", currency: "MAD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const esc = (value: string) => value.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] || ch));
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; };
const validDate = (value: string) => { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!match) return false; const d = new Date(Number(match[1]),Number(match[2])-1,Number(match[3])); return d.getFullYear()===Number(match[1])&&d.getMonth()===Number(match[2])-1&&d.getDate()===Number(match[3]); };
type Props = { invoices: IndependentInvoiceRecord[]; onSave: (invoice: IndependentInvoiceRecord) => Promise<boolean> };
export function IndependentInvoicePanel({ invoices, onSave }: Props) {
  const [customer,setCustomer]=useState({name:"",phone:"",address:"",ice:"",taxId:""});
  const [total,setTotal]=useState(""); const [invoiceNumber,setInvoiceNumber]=useState(independentInvoiceNumber);
  const [editingId,setEditingId]=useState<string|null>(null); const [search,setSearch]=useState("");
  const [saving,setSaving]=useState(false); const [notice,setNotice]=useState(""); const [error,setError]=useState("");
  const [invoiceDate,setInvoiceDate]=useState(today);
  const [lines,setLines]=useState<Array<{id:string;label:string}>>([{id:"line-1",label:""}]);
  const totalTTC=Number(total); const totalHT=Math.round((totalTTC/1.2)*100)/100; const tva=Math.round((totalTTC-totalHT)*100)/100;
  const updateLine=(id:string,label:string)=>setLines(current=>current.map(line=>line.id===id?{...line,label}:line));
  const validate=()=>{if(!customer.name.trim())return "Le nom du client est obligatoire.";if(!lines.length||lines.some(line=>!line.label.trim()))return "Complétez la désignation de chaque ligne.";if(!total.trim()||!Number.isFinite(totalTTC)||totalTTC<=0)return "Saisissez un montant TTC valide.";if(!validDate(invoiceDate))return "Choisissez une date de facture valide.";return "";};
  const print=()=>{const issue=validate();if(issue){setError(issue);return;}setError("");
    const win=window.open("","_blank","width=900,height=700");if(!win){setError("Autorisez les fenêtres contextuelles pour imprimer la facture.");return;}
    const date=new Date(invoiceDate+"T00:00:00").toLocaleDateString("fr-FR");
    const lineHtml=lines.map(line=>`<tr><td>${esc(line.label)}</td></tr>`).join("");
    const logo=window.location.origin+"/cairo-verre-logo.svg";
    win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture indépendante ${esc(invoiceNumber)}</title><style>
      *{box-sizing:border-box}@page{size:A4 portrait;margin:0}body{margin:0;font:10pt Arial,sans-serif;color:#17324f}.page{width:210mm;min-height:297mm;padding:14mm 15mm;margin:auto}
      header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #2563a6;padding-bottom:7mm}.brand{display:flex;align-items:center;gap:4mm}.brand img{width:22mm;height:22mm;object-fit:contain}
      .company strong{display:block;font-size:19pt;color:#174b80;letter-spacing:1px}.company span{font-size:8pt;color:#367bb7;font-weight:bold}.company small{display:block;margin-top:2mm;font-size:8pt;line-height:1.5;color:#536b82}
      .title{text-align:right}.title h1{margin:0;color:#174b80;font-size:21pt}.title strong{display:block;margin-top:3mm;font-size:11pt}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin:8mm 0;padding:5mm;background:#eef5fc;border:1px solid #d6e6f6}.meta label{display:block;color:#71839a;font-size:8pt;margin-bottom:2mm}.meta strong{font-size:10pt}
      h2{font-size:10pt;color:#174b80;border-bottom:1px solid #b9d2ed;padding-bottom:2mm;margin:9mm 0 3mm}table{width:100%;border-collapse:collapse;font-size:9pt}th{background:#eaf3fc;color:#174b80}th,td{border:1px solid #cbd9e7;padding:3mm;text-align:left}
      .totals{margin:10mm 0 0 auto;width:75mm;border:1px solid #d7e4f1;padding:3mm}.totals div{display:flex;justify-content:space-between;padding:2mm}.grand{border-top:2px solid #2563a6;color:#174b80;font-weight:bold;font-size:12pt}
      @media print{.page{margin:0;page-break-after:always}.page:last-child{page-break-after:auto}}
    </style></head><body><main class="page"><header><div class="brand"><img src="${logo}" alt="Cairo Verre"><div class="company"><strong>CAIRO VERRE</strong><span>VITRERIE · MIROITERIE</span><small>72, Lotissement Al Wiam, Rdc - Mediouna<br>ICE : 002843449000049 · RC : 507771</small></div></div><div class="title"><h1>FACTURE</h1><strong>${esc(invoiceNumber)}</strong><div>${date}</div></div></header>
      <section class="meta"><div><label>CLIENT</label><strong>${esc(customer.name)}</strong></div><div><label>TÉLÉPHONE</label><strong>${esc(customer.phone||"—")}</strong></div><div><label>ADRESSE</label><strong>${esc(customer.address||"—")}</strong></div><div><label>ICE / IF</label><strong>${esc([customer.ice&&"ICE : "+customer.ice,customer.taxId&&"IF : "+customer.taxId].filter(Boolean).join(" · ")||"—")}</strong></div></section>
      <h2>DÉSIGNATION</h2><table><thead><tr><th>Désignation / Détails / Quantité / Surface / PU / Montant</th></tr></thead><tbody>${lineHtml}</tbody></table>
      <section class="totals"><div><span>Total HT</span><strong>${money(totalHT)}</strong></div><div><span>TVA 20%</span><strong>${money(tva)}</strong></div><div class="grand"><span>Total TTC</span><strong>${money(totalTTC)}</strong></div></section></main></body></html>`);
    win.document.close();win.focus();window.setTimeout(()=>{if(!win.closed)win.print();},250);
  };
  const reset=()=>{setCustomer({name:"",phone:"",address:"",ice:"",taxId:""});setTotal("");setInvoiceNumber(independentInvoiceNumber());setEditingId(null);setInvoiceDate(today());setLines([{id:crypto.randomUUID(),label:""}]);setError("");setNotice("");};
  const load=(invoice:IndependentInvoiceRecord)=>{setCustomer({...invoice.customer});setTotal(String(invoice.totalTTC));setInvoiceNumber(invoice.invoiceNumber);setInvoiceDate(invoice.invoiceDate);setLines(invoice.lines.map(line=>({id:line.id,label:line.widthMm>1||line.heightMm>1?`${line.label} · ${line.widthMm/1000} × ${line.heightMm/1000} m · Qté ${line.quantity} · Surface ${line.weight.toLocaleString("fr-FR",{maximumFractionDigits:3})} m² · Montant ${money(line.amount)}`:line.label})));setEditingId(invoice.id);setError("");setNotice("Facture chargée. Vous pouvez la modifier puis l’enregistrer ou l’imprimer.");window.scrollTo({top:0,behavior:"smooth"});};
  const save=async()=>{const issue=validate();setError(issue);setNotice("");if(issue)return;
    const previous=invoices.find(item=>item.id===editingId);let number=previous?.invoiceNumber||invoiceNumber;
    if(!previous&&invoices.some(item=>item.invoiceNumber===number)){do{number=independentInvoiceNumber();}while(invoices.some(item=>item.invoiceNumber===number));setInvoiceNumber(number);}
    const now=new Date().toISOString();
    // Keep the existing persisted line shape for backward compatibility; independent invoice lines are now free-form descriptions.
    const record:IndependentInvoiceRecord={id:previous?.id||crypto.randomUUID(),invoiceNumber:number,invoiceDate,customer:{name:customer.name.trim(),phone:customer.phone.trim(),address:customer.address.trim(),ice:customer.ice.trim(),taxId:customer.taxId.trim()},lines:lines.map(line=>({id:line.id,label:line.label.trim(),widthMm:1,heightMm:1,quantity:1,weight:1,amount:0})),totalTTC:Math.round(totalTTC*100)/100,createdAt:previous?.createdAt||now,updatedAt:now};
    setSaving(true);try{const ok=await onSave(record);if(ok){setEditingId(record.id);setInvoiceNumber(record.invoiceNumber);setNotice(`Facture ${record.invoiceNumber} enregistrée avec succès.`);}else setError("La facture n’a pas pu être enregistrée. Vérifiez la connexion puis réessayez.");}catch{setError("Erreur lors de l’enregistrement de la facture.");}finally{setSaving(false);}
  };
  const filtered=[...invoices].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).filter(item=>(item.invoiceNumber+" "+item.customer.name).toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")));
  return <div className="content">
    <div className="intro"><div><h2>Facture indépendante</h2><p>Saisie manuelle des désignations et du montant TTC. Le calcul HT et TVA est automatique.</p></div></div>
    <section className="panel"><div className="panel-heading"><div><h3>Informations du client</h3><p>Ces informations apparaîtront uniquement sur le document imprimé.</p></div></div><div className="independent-invoice-grid">
      <label className="field"><span>Nom du client *</span><input value={customer.name} onChange={e=>setCustomer(v=>({...v,name:e.target.value}))}/></label>
      <label className="field"><span>Téléphone</span><input value={customer.phone} onChange={e=>setCustomer(v=>({...v,phone:e.target.value}))}/></label>
      <label className="field"><span>Adresse</span><input value={customer.address} onChange={e=>setCustomer(v=>({...v,address:e.target.value}))}/></label>
      <label className="field"><span>ICE</span><input value={customer.ice} onChange={e=>setCustomer(v=>({...v,ice:e.target.value}))}/></label>
      <label className="field"><span>IF</span><input value={customer.taxId} onChange={e=>setCustomer(v=>({...v,taxId:e.target.value}))}/></label>
    </div></section>
    <section className="panel"><div className="panel-heading"><div><h3>Référence et date de facture</h3><p>Le numéro est conservé lors des modifications.</p></div></div><div className="independent-invoice-grid">
      <label className="field"><span>Numéro de facture</span><input value={invoiceNumber} readOnly/></label><label className="field"><span>Date de facture *</span><input type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></label>
    </div></section>
    <section className="panel"><div className="panel-heading"><div><h3>Désignations</h3><p>Saisissez librement chaque ligne, par exemple : Clair 6 · 1,2 × 2,3 m · Qté 10 · 17 m² · PU 95 DH · Montant 16 000 DH.</p></div><button className="add-btn" onClick={()=>setLines(current=>[...current,{id:crypto.randomUUID(),label:""}])}>+ Ajouter une ligne</button></div>
      {lines.map((line,index)=><div className="independent-invoice-line" key={line.id}><label className="field item-name"><span>Désignation et détails – ligne {index+1}</span><textarea rows={2} value={line.label} onChange={e=>updateLine(line.id,e.target.value)} placeholder="Saisir manuellement la désignation, dimensions, quantité, surface, PU et montant"/></label>{lines.length>1&&<button className="icon-btn danger" aria-label={"Supprimer la ligne "+(index+1)} onClick={()=>setLines(current=>current.filter(item=>item.id!==line.id))}>×</button>}</div>)}
    </section>
    <section className="panel"><div className="panel-heading"><div><h3>Récapitulatif de la facture</h3><p>Entrez uniquement le montant total TTC. Aucun calcul ou partage des montants entre les lignes.</p></div></div>
      <label className="field" style={{maxWidth:320}}><span>Total TTC (DH) *</span><input type="number" min="0.01" step="0.01" value={total} onChange={e=>setTotal(e.target.value)}/></label>
      {total.trim()&&Number.isFinite(totalTTC)&&totalTTC>0&&<div className="summary-divider"/>}
      {total.trim()&&Number.isFinite(totalTTC)&&totalTTC>0&&<><div className="summary-line"><span>Total HT</span><strong>{money(totalHT)}</strong></div><div className="summary-line"><span>TVA (20%)</span><strong>{money(tva)}</strong></div><div className="summary-line"><strong>Total TTC</strong><strong>{money(totalTTC)}</strong></div></>}
      {error&&<p role="alert" style={{color:"#b84d45",fontSize:12}}>{error}</p>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="save-btn" style={{flex:1}} onClick={save} disabled={saving}>{saving?"Enregistrement…":editingId?"Enregistrer les modifications":"Enregistrer la facture"}</button><button className="add-btn" type="button" onClick={print}>Imprimer la facture</button>{editingId&&<button className="add-btn" type="button" onClick={reset}>Nouvelle facture</button>}</div>
      {notice&&<p className="saved-note" role="status">{notice}</p>}<p className="local-note">Les factures sont sauvegardées dans l’espace partagé. Elles ne créent ni commande, ni paiement, ni mouvement de caisse, ni entrée de stock, et ne modifient pas les données clients.</p>
    </section>
    <section className="panel" style={{marginTop:18}}><div className="panel-heading"><div><h3>Liste des factures indépendantes</h3><p>{invoices.length} facture(s) enregistrée(s) · les plus récentes en premier</p></div></div>
      <label className="field" style={{maxWidth:420,marginBottom:14}}><span>Rechercher par numéro ou client</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ex. FA1234 ou nom du client"/></label>
      {filtered.length===0?<div className="empty-inline">{search?"Aucune facture ne correspond à cette recherche.":"Aucune facture indépendante enregistrée pour le moment."}</div>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:620}}><thead><tr>{["N° facture","Date","Client","Total TTC","Actions"].map(x=><th key={x} style={{textAlign:"left",padding:10,borderBottom:"1px solid #dce8f5"}}>{x}</th>)}</tr></thead><tbody>{filtered.map(invoice=><tr key={invoice.id} style={{borderBottom:"1px solid #edf2f7"}}><td style={{padding:10,fontWeight:700}}>{invoice.invoiceNumber}</td><td style={{padding:10}}>{new Date(invoice.invoiceDate+"T00:00:00").toLocaleDateString("fr-FR")}</td><td style={{padding:10}}>{invoice.customer.name}</td><td style={{padding:10,fontWeight:700}}>{money(invoice.totalTTC)}</td><td style={{padding:10}}><button className="add-btn" onClick={()=>load(invoice)}>Ouvrir</button></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
