"use client";
import { useMemo, useState } from "react";
import { GLASS_CATALOG } from "@/lib/catalog";
import { areaM2 } from "@/lib/calculations";
import { allocateIndependentInvoiceTotal, independentInvoiceNumber } from "@/lib/independent-invoice";
import type { IndependentInvoiceRecord } from "@/lib/workshop-storage";

type Line = { id: string; label: string; widthMm: number; heightMm: number; quantity: number };
const money = (n: number) => new Intl.NumberFormat("fr-MA", { style: "currency", currency: "MAD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const esc = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch));
const fmt = (n: number) => (n / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isValidInvoiceDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

type Props = { invoices: IndependentInvoiceRecord[]; onSave: (invoice: IndependentInvoiceRecord) => Promise<boolean> };
export function IndependentInvoicePanel({ invoices, onSave }: Props) {
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", ice: "", taxId: "" });
  const [total, setTotal] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(() => independentInvoiceNumber());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  });
  const [lines, setLines] = useState<Line[]>([{ id: "line-1", label: "", widthMm: 0, heightMm: 0, quantity: 1 }]);
  const [error, setError] = useState("");
  const rows = useMemo(() => {
    if (!total.trim() || !lines.length) return [];
    try { return allocateIndependentInvoiceTotal(lines, Number(total)); } catch { return []; }
  }, [lines, total]);
  const allocated = rows.reduce((sum, row) => sum + row.amount, 0);
  const update = (id: string, patch: Partial<Line>) => setLines(current => current.map(line => line.id === id ? { ...line, ...patch } : line));
  const addLine = () => setLines(current => [...current, { id: crypto.randomUUID(), label: "", widthMm: 0, heightMm: 0, quantity: 1 }]);
  const print = () => {
    setError("");
    if (!customer.name.trim()) { setError("Le nom du client est obligatoire."); return; }
    if (!total.trim() || !Number.isFinite(Number(total)) || Number(total) <= 0) { setError("Saisissez un montant TTC valide."); return; }
    let allocatedRows;
    try { allocatedRows = allocateIndependentInvoiceTotal(lines, Number(total)); }
    catch (e) { setError(e instanceof Error ? e.message : "Vérifiez les lignes de vitrage."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || Number.isNaN(new Date(`${invoiceDate}T00:00:00`).getTime())) { setError("Choisissez une date de facture valide."); return; }
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { setError("Autorisez les fenêtres contextuelles pour imprimer la facture."); return; }
    const number = invoiceNumber;
    const date = new Date(`${invoiceDate}T00:00:00`).toLocaleDateString("fr-FR");
    const totalTTC = Math.round(Number(total) * 100) / 100;
    const totalHT = totalTTC / 1.2;
    const lineHtml = allocatedRows.map(row => {
      const area = areaM2(row.widthMm, row.heightMm, row.quantity);
      return `<tr><td>${esc(row.label)}</td><td>${fmt(row.widthMm)} × ${fmt(row.heightMm)} m</td><td class="num">${row.quantity}</td><td class="num">${area.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m²</td><td class="num">${money(row.amount)}</td></tr>`;
    }).join("");
    const logo = window.location.origin + "/cairo-verre-logo.svg";
    win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture indépendante ${number}</title><style>
      *{box-sizing:border-box} @page{size:A4 portrait;margin:0} body{margin:0;font:10pt Arial,sans-serif;color:#17324f}
      .page{width:210mm;min-height:297mm;padding:14mm 15mm;margin:auto}
      header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #2563a6;padding-bottom:7mm}
      .brand{display:flex;align-items:center;gap:4mm}.brand img{width:22mm;height:22mm;object-fit:contain}
      .company strong{display:block;font-size:19pt;color:#174b80;letter-spacing:1px}.company span{font-size:8pt;color:#367bb7;font-weight:bold}
      .company small{display:block;margin-top:2mm;font-size:8pt;line-height:1.5;color:#536b82}
      .title{text-align:right}.title h1{margin:0;color:#174b80;font-size:21pt}.title strong{display:block;margin-top:3mm;font-size:11pt}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin:8mm 0;padding:5mm;background:#eef5fc;border:1px solid #d6e6f6}
      .meta label{display:block;color:#71839a;font-size:8pt;margin-bottom:2mm}.meta strong{font-size:10pt}
      h2{font-size:10pt;color:#174b80;border-bottom:1px solid #b9d2ed;padding-bottom:2mm;margin:9mm 0 3mm}
      table{width:100%;border-collapse:collapse;font-size:9pt}th{background:#eaf3fc;color:#174b80}th,td{border:1px solid #cbd9e7;padding:3mm;text-align:left}.num{text-align:right;white-space:nowrap}
      .totals{margin:10mm 0 0 auto;width:75mm;border:1px solid #d7e4f1;padding:3mm}.totals div{display:flex;justify-content:space-between;padding:2mm}.grand{border-top:2px solid #2563a6;color:#174b80;font-weight:bold;font-size:12pt}
      .foot{margin-top:20mm;padding-top:4mm;border-top:1px solid #d7e4f1;text-align:center;color:#71839a;font-size:8pt}
      @media print{.page{margin:0;page-break-after:always}.page:last-child{page-break-after:auto}}
    </style></head><body><main class="page"><header><div class="brand"><img src="${logo}" alt="Cairo Verre"><div class="company"><strong>CAIRO VERRE</strong><span>VITRERIE · MIROITERIE</span><small>72, Lotissement Al Wiam, Rdc - Mediouna<br>ICE : 002843449000049 · RC : 507771</small></div></div><div class="title"><h1>FACTURE</h1><strong>${number}</strong><div>${date}</div></div></header>
      <section class="meta"><div><label>CLIENT</label><strong>${esc(customer.name)}</strong></div><div><label>TÉLÉPHONE</label><strong>${esc(customer.phone || "—")}</strong></div><div><label>ADRESSE</label><strong>${esc(customer.address || "—")}</strong></div><div><label>ICE / IF</label><strong>${esc([customer.ice && "ICE : " + customer.ice, customer.taxId && "IF : " + customer.taxId].filter(Boolean).join(" · ") || "—")}</strong></div></section>
      <h2>DÉTAIL DES VITRAGES</h2><table><thead><tr><th>Désignation</th><th>Dimensions (m)</th><th class="num">Qté</th><th class="num">Surface</th><th class="num">Montant TTC</th></tr></thead><tbody>${lineHtml}</tbody></table>
      <section class="totals"><div><span>Total HT</span><strong>${money(totalHT)}</strong></div><div><span>TVA 20%</span><strong>${money(totalTTC-totalHT)}</strong></div><div class="grand"><span>Total TTC</span><strong>${money(totalTTC)}</strong></div></section>
</main></body></html>`);
    win.document.close();
    // Wait for the logo and document fonts before opening the print dialog.
    window.setTimeout(() => {
      void (async () => {
        const images = Array.from(win.document.images);
        await Promise.all(images.map(image => image.decode().catch(() => undefined)));
        try { await win.document.fonts.ready; } catch { /* use the browser's fallback fonts */ }
        if (!win.closed) { win.focus(); win.print(); }
      })();
    }, 0);
  };
  const resetForm = () => {
    setCustomer({ name: "", phone: "", address: "", ice: "", taxId: "" });
    setTotal(""); setInvoiceNumber(independentInvoiceNumber()); setEditingId(null);
    const now = new Date(); setInvoiceDate(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`);
    setLines([{ id: crypto.randomUUID(), label: "", widthMm: 0, heightMm: 0, quantity: 1 }]);
    setError(""); setNotice("");
  };
  const loadInvoice = (invoice: IndependentInvoiceRecord) => {
    setCustomer({ ...invoice.customer }); setTotal(String(invoice.totalTTC));
    setInvoiceNumber(invoice.invoiceNumber); setInvoiceDate(invoice.invoiceDate);
    setLines(invoice.lines.map(line => ({ id: line.id, label: line.label, widthMm: line.widthMm, heightMm: line.heightMm, quantity: line.quantity })));
    setEditingId(invoice.id); setError(""); setNotice("Facture chargée. Vous pouvez la modifier puis l’enregistrer, ou l’imprimer.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const save = async () => {
    setError(""); setNotice("");
    if (!customer.name.trim()) { setError("Le nom du client est obligatoire."); return; }
    if (!total.trim() || !Number.isFinite(Number(total)) || Number(total) <= 0) { setError("Saisissez un montant TTC valide."); return; }
    let allocatedRows;
    try { allocatedRows = allocateIndependentInvoiceTotal(lines, Number(total)); }
    catch (e) { setError(e instanceof Error ? e.message : "Vérifiez les lignes de vitrage."); return; }
    if (!isValidInvoiceDate(invoiceDate)) { setError("Choisissez une date de facture valide."); return; }
    const now = new Date().toISOString();
    const previous = invoices.find(item => item.id === editingId);
    let nextNumber = previous?.invoiceNumber || invoiceNumber;
    if (!previous && invoices.some(item => item.invoiceNumber === nextNumber)) {
      do { nextNumber = independentInvoiceNumber(); } while (invoices.some(item => item.invoiceNumber === nextNumber));
      setInvoiceNumber(nextNumber);
    }
    const record: IndependentInvoiceRecord = {
      id: previous?.id || crypto.randomUUID(), invoiceNumber: nextNumber,
      invoiceDate, customer: { name: customer.name.trim(), phone: customer.phone.trim(), address: customer.address.trim(), ice: customer.ice.trim(), taxId: customer.taxId.trim() },
      lines: allocatedRows.map((row,index) => ({ id: lines[index].id, ...row })),
      totalTTC: Math.round(Number(total)*100)/100, createdAt: previous?.createdAt || now, updatedAt: now,
    };
    setSaving(true);
    try {
      const ok = await onSave(record);
      if (ok) { setEditingId(record.id); setInvoiceNumber(record.invoiceNumber); setNotice(`Facture ${record.invoiceNumber} enregistrée avec succès.`); }
      else setError("La facture n’a pas pu être enregistrée. Vérifiez la connexion puis réessayez.");
    } catch { setError("Erreur lors de l’enregistrement de la facture."); }
    finally { setSaving(false); }
  };
  const filteredInvoices = [...invoices].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).filter(item=>(item.invoiceNumber+" "+item.customer.name).toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")));
  return <div className="content">
    <div className="intro"><div><h2>Facture indépendante</h2><p>Création, sauvegarde et réimpression des factures sans créer d’opération dans l’atelier.</p></div></div>
    <section className="panel"><div className="panel-heading"><div><h3>Informations du client</h3><p>Ces informations apparaîtront uniquement sur le document imprimé.</p></div></div>
      <div className="independent-invoice-grid">
        <label className="field"><span>Nom du client *</span><input value={customer.name} onChange={e=>setCustomer(v=>({...v,name:e.target.value}))}/></label>
        <label className="field"><span>Téléphone</span><input value={customer.phone} onChange={e=>setCustomer(v=>({...v,phone:e.target.value}))}/></label>
        <label className="field"><span>Adresse</span><input value={customer.address} onChange={e=>setCustomer(v=>({...v,address:e.target.value}))}/></label>
        <label className="field"><span>ICE</span><input value={customer.ice} onChange={e=>setCustomer(v=>({...v,ice:e.target.value}))}/></label>
        <label className="field"><span>IF</span><input value={customer.taxId} onChange={e=>setCustomer(v=>({...v,taxId:e.target.value}))}/></label>
      </div>
    </section>
    <section className="panel"><div className="panel-heading"><div><h3>Référence et date de facture</h3><p>Le numéro de facture est conservé lors des modifications ; la date peut être ajustée.</p></div></div>
      <div className="independent-invoice-grid">
        <label className="field"><span>Numéro de facture</span><input value={invoiceNumber} readOnly/></label>
        <label className="field"><span>Date de facture *</span><input type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></label>
      </div>
    </section>
    <section className="panel"><div className="panel-heading"><div><h3>Vitrages et dimensions</h3><p>Les dimensions sont saisies en millimètres.</p></div><button className="add-btn" onClick={addLine}>+ Ajouter une ligne</button></div>
      <datalist id="independent-glass-catalog">{GLASS_CATALOG.map(name=><option key={name} value={name}/>)}</datalist>
      {lines.map((line,index)=><div className="independent-invoice-line" key={line.id}>
        <label className="field item-name"><span>Désignation</span><input list="independent-glass-catalog" value={line.label} onChange={e=>update(line.id,{label:e.target.value})}/></label>
        <label className="field"><span>Largeur (mm)</span><input type="number" min="1" value={line.widthMm||""} onChange={e=>update(line.id,{widthMm:Number(e.target.value)||0})}/></label>
        <label className="field"><span>Hauteur (mm)</span><input type="number" min="1" value={line.heightMm||""} onChange={e=>update(line.id,{heightMm:Number(e.target.value)||0})}/></label>
        <label className="field"><span>Quantité</span><input type="number" min="1" step="1" value={line.quantity} onChange={e=>update(line.id,{quantity:Math.max(1,Number(e.target.value)||1)})}/></label>
        <strong className="line-total">{(line.widthMm>0&&line.heightMm>0?areaM2(line.widthMm,line.heightMm,line.quantity):0).toLocaleString("fr-FR",{maximumFractionDigits:3})} m²</strong>
        {lines.length>1&&<button className="icon-btn danger" aria-label={"Supprimer la ligne "+(index+1)} onClick={()=>setLines(current=>current.filter(x=>x.id!==line.id))}>×</button>}
      </div>)}
    </section>
    <section className="panel"><div className="panel-heading"><div><h3>Montant de la facture</h3><p>Le total saisi est réparti automatiquement au prorata des surfaces.</p></div></div>
      <label className="field" style={{maxWidth:300}}><span>Total TTC (DH) *</span><input type="number" min="0.01" step="0.01" value={total} onChange={e=>setTotal(e.target.value)}/></label>
      {rows.length>0&&<><div className="summary-divider"/>{rows.map((row,index)=><div className="summary-line" key={lines[index].id}><span>{row.label} · {row.widthMm}×{row.heightMm} mm · Qté {row.quantity}</span><strong>{money(row.amount)}</strong></div>)}<div className="summary-line"><strong>Total réparti</strong><strong>{money(allocated)}</strong></div></>}
      {error&&<p role="alert" style={{color:"#b84d45",fontSize:12}}>{error}</p>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className="save-btn" style={{flex:1}} onClick={save} disabled={saving}>{saving?"Enregistrement…":editingId?"Enregistrer les modifications":"Enregistrer la facture"}</button>
        <button className="add-btn" type="button" onClick={print}>Imprimer la facture</button>
        {editingId&&<button className="add-btn" type="button" onClick={resetForm}>Nouvelle facture</button>}
      </div>
      {notice&&<p className="saved-note" role="status">{notice}</p>}
      <p className="local-note">Les factures sont sauvegardées dans l’espace partagé. Elles ne créent ni commande, ni paiement, ni mouvement de caisse, ni entrée de stock, et ne modifient pas les données clients.</p>
    </section>
    <section className="panel" style={{marginTop:18}}>
      <div className="panel-heading"><div><h3>Liste des factures indépendantes</h3><p>{invoices.length} facture(s) enregistrée(s) · les plus récentes en premier</p></div></div>
      <label className="field" style={{maxWidth:420,marginBottom:14}}><span>Rechercher par numéro ou client</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ex. FA1234 ou nom du client"/></label>
      {filteredInvoices.length===0?<div className="empty-inline">{search?"Aucune facture ne correspond à cette recherche.":"Aucune facture indépendante enregistrée pour le moment."}</div>:
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:620}}><thead><tr>{["N° facture","Date","Client","Total TTC","Actions"].map(x=><th key={x} style={{textAlign:"left",padding:10,borderBottom:"1px solid #dce8f5"}}>{x}</th>)}</tr></thead><tbody>
      {filteredInvoices.map(invoice=><tr key={invoice.id} style={{borderBottom:"1px solid #edf2f7"}}><td style={{padding:10,fontWeight:700}}>{invoice.invoiceNumber}</td><td style={{padding:10}}>{new Date(invoice.invoiceDate+"T00:00:00").toLocaleDateString("fr-FR")}</td><td style={{padding:10}}>{invoice.customer.name}</td><td style={{padding:10,fontWeight:700}}>{money(invoice.totalTTC)}</td><td style={{padding:10}}><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button className="add-btn" onClick={()=>loadInvoice(invoice)}>Ouvrir / modifier</button><button className="add-btn" onClick={()=>loadInvoice(invoice)}>Ouvrir pour réimprimer</button></div></td></tr>)}
      </tbody></table></div>}
    </section>
  </div>;
}
