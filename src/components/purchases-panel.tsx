"use client";
import { useMemo, useState } from "react";
import { supplierInvoicePaid, type PurchaseLine, type SupplierInvoice, type SupplierPayment } from "@/lib/workshop-storage";

const money=(n:number)=>new Intl.NumberFormat("fr-MA",{style:"currency",currency:"MAD",maximumFractionDigits:2}).format(n);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const blankLine=():PurchaseLine=>({kind:"glass",label:"",quantity:1,unitPrice:0,widthMm:0,heightMm:0,unit:"m²"});
const lineArea=(l:PurchaseLine)=>(l.kind==="glass"&&Number(l.widthMm)>0&&Number(l.heightMm)>0?Number(l.widthMm)*Number(l.heightMm)/1000000*l.quantity:0);
const lineTotal=(l:PurchaseLine)=>(l.kind==="glass"?lineArea(l):l.quantity)*l.unitPrice;
const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;

export function PurchasesPanel({invoices,onAdd,onUpdate,glassCatalog,accessoryCatalog}:{invoices:SupplierInvoice[];onAdd:(invoice:SupplierInvoice)=>void;onUpdate:(invoice:SupplierInvoice)=>Promise<boolean>;glassCatalog:readonly string[];accessoryCatalog:readonly string[]}){
 const [supplier,setSupplier]=useState(""); const [invoiceNumber,setInvoiceNumber]=useState(""); const [date,setDate]=useState(today());
 const [lines,setLines]=useState<PurchaseLine[]>([blankLine()]);
 const [discountPercent,setDiscountPercent]=useState(0);
 const [paidAmount,setPaidAmount]=useState(0);
 const [method,setMethod]=useState<"Espèces"|"Virement"|"Chèque"|"Effet"|"Non réglé">("Non réglé");
 const [chequeNumber,setChequeNumber]=useState(""),[chequeDate,setChequeDate]=useState(""),[paidDate,setPaidDate]=useState(today());
 const [paymentInvoice,setPaymentInvoice]=useState<SupplierInvoice|null>(null),[paymentAmount,setPaymentAmount]=useState(""),[paymentMethod,setPaymentMethod]=useState<"Espèces"|"Virement"|"Chèque"|"Effet">("Espèces"),[paymentDate,setPaymentDate]=useState(today()),[paymentReference,setPaymentReference]=useState(""),[paymentDueDate,setPaymentDueDate]=useState(""),[paymentSaving,setPaymentSaving]=useState(false);
 const updateLine=(index:number,patch:Partial<PurchaseLine>)=>setLines(current=>current.map((line,i)=>i===index?{...line,...patch}:line));
 const totals=useMemo(()=>{
   const linesTTC=round2(lines.reduce((sum,line)=>sum+lineTotal(line),0));
   const grossHT=linesTTC/1.2;
   const discountHT=round2(grossHT*Math.min(100,Math.max(0,discountPercent))/100);
   const totalHT=round2(grossHT-discountHT);
   const totalTVA=round2(totalHT*.2);
   return {linesTTC,grossHT,discountHT,totalHT,totalTVA,totalTTC:round2(totalHT+totalTVA)};
 },[lines,discountPercent]);
 const addPayment=(invoice:SupplierInvoice)=>{
   const remaining=invoice.totalTTC-supplierInvoicePaid(invoice);if(remaining<=0)return;
   setPaymentInvoice(invoice);setPaymentAmount(String(round2(remaining)));setPaymentMethod("Espèces");setPaymentDate(today());setPaymentReference("");setPaymentDueDate("");
 };
 const submitPayment=async()=>{
   if(!paymentInvoice||paymentSaving)return;
   const remaining=paymentInvoice.totalTTC-supplierInvoicePaid(paymentInvoice),amount=Number(paymentAmount);
   if(!Number.isFinite(amount)||amount<=0||amount>remaining+0.009){alert("Montant invalide ou supérieur au reste dû.");return;}
   if(!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)||Number.isNaN(new Date(paymentDate+"T00:00:00").getTime())){alert("Date de paiement invalide.");return;}
   if((paymentMethod==="Chèque"||paymentMethod==="Effet")&&(!paymentReference.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(paymentDueDate))){alert("La référence et la date d’échéance sont obligatoires.");return;}
   const payment:SupplierPayment={id:crypto.randomUUID(),date:paymentDate,amount,method:paymentMethod,status:paymentMethod==="Chèque"||paymentMethod==="Effet"?"pending":"confirmed",...((paymentMethod==="Chèque"||paymentMethod==="Effet")?{reference:paymentReference.trim(),dueDate:paymentDueDate}:{})};
   setPaymentSaving(true);try{if(await onUpdate({...paymentInvoice,payments:[...(paymentInvoice.payments||[]),payment]}))setPaymentInvoice(null);}finally{setPaymentSaving(false);}
 };
 const validLines=lines.length>0&&lines.every(l=>l.label.trim()&&Number.isFinite(l.quantity)&&l.quantity>0&&Number.isFinite(l.unitPrice)&&l.unitPrice>=0&&(l.kind!=="glass"||(Number(l.widthMm)>0&&Number(l.heightMm)>0)));
 const submit=()=>{
   if(!supplier.trim()||!invoiceNumber.trim()||!validLines||discountPercent<0||discountPercent>100||paidAmount<0||paidAmount>totals.totalTTC||(paidAmount>0&&method==="Non réglé")||((method==="Chèque"||method==="Effet")&&paidAmount>0&&(!chequeNumber.trim()||!chequeDate)))return;
   const invoice:SupplierInvoice={id:crypto.randomUUID(),supplier:supplier.trim(),invoiceNumber:invoiceNumber.trim(),date,category:lines.every(l=>l.kind==="glass")?"glass":lines.every(l=>l.kind==="accessory")?"accessory":"mixed",lines:lines.map(l=>({...l})),totalHT:totals.totalHT,totalTVA:totals.totalTVA,totalTTC:totals.totalTTC,discountPercent,paidAmount:method==="Chèque"||method==="Effet"?0:paidAmount,paymentMethod:method,...(paidAmount>0&&method!=="Chèque"&&method!=="Effet"?{paidDate}:{}),...(method==="Chèque"||method==="Effet"?{chequeNumber,chequeDate,...(paidAmount>0?{payments:[{id:crypto.randomUUID(),date,amount:paidAmount,method:method as "Chèque"|"Effet",status:"pending" as const,reference:chequeNumber,dueDate:chequeDate}]}:{})}:{})};
   onAdd(invoice);setInvoiceNumber("");setLines([blankLine()]);setDiscountPercent(0);setPaidAmount(0);setMethod("Non réglé");setChequeNumber("");setChequeDate("");
 };
 return <div className="content">
 <datalist id="purchase-glass-catalog">{glassCatalog.map(name=><option key={name} value={name}/>)}</datalist><datalist id="purchase-accessory-catalog">{accessoryCatalog.map(name=><option key={name} value={name}/>)}</datalist>
 <div className="intro"><div><h2>Achats & fournisseurs</h2><p>Saisissez les prix unitaires TTC : les totaux HT et TVA sont calculés automatiquement.</p></div><span className="draft-count">{invoices.length} facture(s)</span></div>
 <section className="panel"><div className="panel-heading"><div><h3>Nouvelle facture d’achat</h3><p>Vitrage, accessoires et services peuvent être ajoutés sur la même facture.</p></div></div>
 <div className="purchase-header-grid"><label className="field"><span>Fournisseur</span><input className="text-input" value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Nom du fournisseur"/></label><label className="field"><span>N° facture</span><input className="text-input" value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)}/></label><label className="field"><span>Date facture</span><input className="text-input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
 <div className="purchase-lines-head"><strong>Lignes de facture</strong><button className="add-btn" type="button" onClick={()=>setLines(v=>[...v,blankLine()])}>+ Ajouter une ligne</button></div>
 <div className="purchase-line-labels"><span>Type</span><span>Désignation</span><span>Largeur</span><span>Hauteur</span><span>Qté</span><span>Prix unit. TTC</span><span>Total TTC</span><span></span></div>
 {lines.map((line,i)=><div className="purchase-line" key={i}>
 <select className="text-input purchase-kind" aria-label="Type de ligne" value={line.kind||"glass"} onChange={e=>{const kind=e.target.value as NonNullable<PurchaseLine["kind"]>;updateLine(i,{kind,unit:kind==="glass"?"m²":kind==="service"?"unité":"unité",widthMm:kind==="glass"?line.widthMm:undefined,heightMm:kind==="glass"?line.heightMm:undefined});}}>
 <option value="glass">Verre</option><option value="accessory">Accessoire</option><option value="service">Service</option></select>
 <input className="text-input purchase-designation" list={line.kind==="glass"?"purchase-glass-catalog":line.kind==="accessory"?"purchase-accessory-catalog":undefined} value={line.label} onChange={e=>updateLine(i,{label:e.target.value})} placeholder={line.kind==="glass"?"Type de verre":line.kind==="accessory"?"Type d’accessoire":"Nom du service"}/>
 {line.kind==="glass"?<><input className="text-input purchase-dimension" type="number" min="1" value={line.widthMm??0} onChange={e=>updateLine(i,{widthMm:Number(e.target.value)})} placeholder="mm" aria-label="Largeur mm"/><input className="text-input purchase-dimension" type="number" min="1" value={line.heightMm??0} onChange={e=>updateLine(i,{heightMm:Number(e.target.value)})} placeholder="mm" aria-label="Hauteur mm"/></>:<><span className="purchase-no-dimension">—</span><span className="purchase-no-dimension">—</span></>}
 <input className="text-input purchase-qty" type="number" min="0.01" step="any" value={line.quantity} onChange={e=>updateLine(i,{quantity:Number(e.target.value)})} aria-label="Quantité"/>
 <input className="text-input purchase-price" type="number" min="0" step="any" value={line.unitPrice} onChange={e=>updateLine(i,{unitPrice:Number(e.target.value)})} placeholder="DH TTC" aria-label="Prix unitaire TTC"/>
 <div className="purchase-total-cell"><strong className="purchase-total">{money(lineTotal(line))}</strong>{line.kind==="glass"&&<small>{lineArea(line).toLocaleString("fr-MA",{maximumFractionDigits:3})} m²</small>}</div>
 <button className="icon-btn danger" type="button" disabled={lines.length===1} onClick={()=>setLines(v=>v.filter((_,n)=>n!==i))} aria-label="Supprimer la ligne">×</button>
 </div>)}
 <div className="purchase-discount-row"><label className="field"><span>Remise (%)</span><input className="text-input" type="number" min="0" max="100" step="0.01" value={discountPercent} onChange={e=>setDiscountPercent(Math.min(100,Math.max(0,Number(e.target.value)||0)))}/></label><div><span>Total des lignes TTC avant remise</span><strong>{money(totals.linesTTC)}</strong></div><div><span>Remise déduite (HT)</span><strong>{money(totals.discountHT)}</strong></div></div>
 <div className="purchase-summary"><div><span>TOTAL HT</span><strong>{money(totals.totalHT)}</strong></div><div><span>TVA 20%</span><strong>{money(totals.totalTVA)}</strong></div><div className="purchase-grand-total"><span>TOTAL TTC</span><strong>{money(totals.totalTTC)}</strong></div></div>
 <div className="purchase-totals-grid" style={{marginTop:18}}><label className="field"><span>Montant payé (DH)</span><input className="text-input" type="number" min="0" max={totals.totalTTC} step="0.01" value={paidAmount} onChange={e=>setPaidAmount(Number(e.target.value))}/></label><label className="field"><span>Mode de paiement</span><select className="text-input" value={method} onChange={e=>setMethod(e.target.value as typeof method)}><option>Non réglé</option><option>Espèces</option><option>Virement</option><option>Chèque</option><option>Effet</option></select></label>{paidAmount>0&&method!=="Chèque"&&method!=="Effet"&&<label className="field"><span>Date du paiement</span><input className="text-input" type="date" value={paidDate} onChange={e=>setPaidDate(e.target.value)}/></label>}{(method==="Chèque"||method==="Effet")&&<><label className="field"><span>Référence chèque / effet</span><input className="text-input" value={chequeNumber} onChange={e=>setChequeNumber(e.target.value)}/></label><label className="field"><span>Échéance</span><input className="text-input" type="date" value={chequeDate} onChange={e=>setChequeDate(e.target.value)}/></label></>}</div>
 <button className="add-btn" style={{marginTop:16}} disabled={!supplier.trim()||!invoiceNumber.trim()||!validLines||discountPercent<0||discountPercent>100||paidAmount>totals.totalTTC||paidAmount<0||(paidAmount>0&&method==="Non réglé")||((method==="Chèque"||method==="Effet")&&paidAmount>0&&(!chequeNumber.trim()||!chequeDate))} onClick={submit}>Enregistrer la facture</button>
 </section>
 <section className="panel"><div className="panel-heading"><div><h3>Historique des factures</h3><p>Les montants enregistrés restent inchangés.</p></div></div>{invoices.length?[...invoices].sort((a,b)=>b.date.localeCompare(a.date)).map(x=><div className="saved-draft" key={x.id}><div><strong>{x.supplier} · {x.invoiceNumber}</strong><span>{x.date} · {x.lines.map(l=>l.label+" × "+l.quantity).join(", ")}{x.discountPercent? " · Remise "+x.discountPercent+"%":""}</span></div><div><strong>{money(x.totalTTC)}</strong><span>Payé {money(supplierInvoicePaid(x))} · Reste {money(Math.max(0,x.totalTTC-supplierInvoicePaid(x)))}</span><button className="add-btn" type="button" style={{marginTop:6}} onClick={()=>addPayment(x)}>Ajouter un règlement</button></div></div>):<div className="empty-inline">Aucune facture fournisseur.</div>}</section>
 {paymentInvoice&&<div className="app-dialog-overlay" role="presentation" onClick={()=>{if(!paymentSaving)setPaymentInvoice(null);}}><section className="app-dialog supplier-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="achat-supplier-payment-title" onClick={e=>e.stopPropagation()}>
  <div className="app-dialog-icon success">↗</div><h3 id="achat-supplier-payment-title">Ajouter un règlement fournisseur</h3><p>{paymentInvoice.supplier} · Facture {paymentInvoice.invoiceNumber}</p>
  <div className="supplier-payment-summary"><div><span>Total facture</span><strong>{money(paymentInvoice.totalTTC)}</strong></div><div><span>Déjà réglé</span><strong>{money(supplierInvoicePaid(paymentInvoice))}</strong></div><div><span>Reste dû</span><strong>{money(Math.max(0,paymentInvoice.totalTTC-supplierInvoicePaid(paymentInvoice)))}</strong></div></div>
  <div className="supplier-payment-fields">
   <label className="field"><span>Montant du règlement (DH) *</span><input className="text-input" type="number" min="0.01" max={Math.max(0,paymentInvoice.totalTTC-supplierInvoicePaid(paymentInvoice))} step="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></label>
   <label className="field"><span>Mode de paiement *</span><select className="text-input" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as typeof paymentMethod)}><option>Espèces</option><option>Virement</option><option>Chèque</option><option>Effet</option></select></label>
   <label className="field"><span>Date du paiement *</span><input className="text-input" type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/></label>
   {(paymentMethod==="Chèque"||paymentMethod==="Effet")&&<><label className="field"><span>Référence du {paymentMethod.toLocaleLowerCase("fr")} *</span><input className="text-input" value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} placeholder="Numéro de référence"/></label><label className="field"><span>Date d’échéance *</span><input className="text-input" type="date" value={paymentDueDate} onChange={e=>setPaymentDueDate(e.target.value)}/></label></>}
  </div>
  <div className="app-dialog-actions"><button className="add-btn" disabled={paymentSaving} onClick={()=>setPaymentInvoice(null)}>Annuler</button><button className="add-btn app-dialog-primary" disabled={paymentSaving} onClick={submitPayment}>{paymentSaving?"Enregistrement…":"Enregistrer le règlement"}</button></div>
 </section></div>}
 </div>;
}
