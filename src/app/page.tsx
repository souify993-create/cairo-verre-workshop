"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, ClipboardList, Users, Package, Wallet, FileText, Settings, Plus, Trash2, Save, CheckCircle2, Search, PanelLeftClose } from "lucide-react";
import { AccessoryLine, GlassLine, LINEAR_SERVICES, ServiceLine, quoteTotals, areaM2, serviceUnit, isValidQuote } from "@/lib/calculations";
import { decodeDraftStore, readDrafts, writeDrafts } from "@/lib/storage";
import { addPayment, confirmPayment, confirmRefund, markOrderDelivered, orderFromDraft, reviseDeliveredOrder, settleCustomerAvoir } from "@/lib/workshop";
import { deriveLedger } from "@/lib/ledger";
import { decodeWorkshopStore, readWorkshopStore, writeWorkshopStore } from "@/lib/workshop-storage";
import type { StoredOrder } from "@/lib/workshop";
import type { WorkshopStore } from "@/lib/workshop-storage";
import type { Draft } from "@/lib/storage";
import { StockPanel } from "@/components/stock-panel";
import { CustomersPanel } from "@/components/customers-panel";
import { PurchasesPanel } from "@/components/purchases-panel";
import { JournalierPanel } from "@/components/journalier-panel";
import { CaissePaymentPanel } from "@/components/caisse-payment-panel";
import { ChequesEffetsPanel } from "@/components/cheques-effets-panel";
import { ExpensesPanel } from "@/components/expenses-panel";
import type { ExpenseRecord } from "@/lib/operations";
import { derivePayrollCashMovements } from "@/lib/payroll";
import { PersonnelPanel } from "@/components/personnel-panel";
import { AdminLogin } from "@/components/admin-login";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { loadCloudWorkshop, saveCloudWorkshop } from "@/lib/cloud-workshop";
// Temporary workshop test mode: local demo data only; switch off after feature QA and before admin rollout.
const DEMO_MODE = true;
const nav=[{label:"Calcul",icon:Calculator},{label:"List commandes",icon:ClipboardList},{label:"La caisse",icon:Wallet},{label:"Journalier",icon:FileText},{label:"Soldes & chèques",icon:ClipboardList},{label:"Clients & fournisseurs",icon:Users},{label:"Personnel",icon:Users},{label:"Stock",icon:Package},{label:"Dépense",icon:Wallet}];
const money=(n:number)=>new Intl.NumberFormat("fr-MA",{style:"currency",currency:"MAD",maximumFractionDigits:2}).format(n);
export default function Home(){
 const [authReady,setAuthReady]=useState(DEMO_MODE),[isAdmin,setIsAdmin]=useState(DEMO_MODE);
 const [cloudReady,setCloudReady]=useState(false),[cloudError,setCloudError]=useState("");
 const cloudRevision=useRef(0);
 const [section,setSection]=useState("Calcul"),[collapsed,setCollapsed]=useState(false),[customer,setCustomer]=useState("");
 const [glass,setGlass]=useState<GlassLine[]>([]),[services,setServices]=useState<ServiceLine[]>([]),[accessories,setAccessories]=useState<AccessoryLine[]>([]);
 const [drafts,setDrafts]=useState<Draft[]>([]),[saved,setSaved]=useState(false),[editingId,setEditingId]=useState<string|null>(null);
 const [editingDeliveredId,setEditingDeliveredId]=useState<string|null>(null);
 const [workshop,setWorkshop]=useState<WorkshopStore>({version:1,orders:[],accessoryPurchases:[],supplierInvoices:[],expenses:[],employees:[],payrollWeeks:[]});
 const ledger=useMemo(()=>deriveLedger(workshop.orders,workshop.accessoryPurchases,workshop.supplierInvoices),[workshop]);
 const cashMovements=useMemo(()=>[...ledger.cashMovements,...derivePayrollCashMovements(workshop.payrollWeeks||[],workshop.employees||[])],[ledger,workshop.payrollWeeks,workshop.employees]);
 const scheduledChequeMovements=useMemo(()=>[...workshop.orders.flatMap(o=>o.payments.filter(p=>(p.method==="Chèque"||p.method==="Effet")&&p.status==="pending"&&p.dueDate).map(p=>({orderId:o.id,reference:o.number,method:p.method,direction:"Entrée" as const,amount:p.amount,kind:"Paiement" as const,counterparty:o.customer,date:p.dueDate}))),...workshop.supplierInvoices.flatMap(i=>(i.payments||[]).filter(p=>(p.method==="Chèque"||p.method==="Effet")&&p.status==="pending"&&p.dueDate).map(p=>({orderId:i.id,reference:p.reference||i.invoiceNumber,method:p.method,direction:"Sortie" as const,amount:p.amount,kind:"Achat fournisseur" as const,counterparty:i.supplier,date:p.dueDate})))],[workshop.orders,workshop.supplierInvoices]);
 useEffect(()=>{setDrafts(readDrafts());setWorkshop(readWorkshopStore());},[]);
 useEffect(()=>{
  if(DEMO_MODE){setAuthReady(true);setIsAdmin(true);return;}
  const supabase=createSupabaseBrowserClient();
  let active=true;
  supabase.auth.getSession().then(({data})=>{
   if(!active)return;
   setIsAdmin(data.session?.user.app_metadata?.role==="admin");
   setAuthReady(true);
  }).catch(()=>{if(active)setAuthReady(true);});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
   if(active)setIsAdmin(session?.user.app_metadata?.role==="admin");
  });
  return ()=>{active=false;subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  if(DEMO_MODE){setCloudReady(true);return;}
  if(!isAdmin){setCloudReady(false);return;}
  let active=true;
  const initialize=async()=>{
   const supabase=createSupabaseBrowserClient();
   try{
    let snapshot=await loadCloudWorkshop(supabase);
    if(!snapshot){
     const localPayload={...readWorkshopStore(),drafts:readDrafts()};
     try{
      const revision=await saveCloudWorkshop(supabase,localPayload,0);
      if(!active)return;
      cloudRevision.current=revision;
      setWorkshop({...localPayload,version:1});
      setDrafts(localPayload.drafts);
      setCloudReady(true);
      writeWorkshopStore(localPayload);
      writeDrafts(localPayload.drafts);
      return;
     }catch(firstError){
      snapshot=await loadCloudWorkshop(supabase);
      if(!snapshot)throw firstError;
     }
    }
    if(!active)return;
    const payload=snapshot.payload;
    const normalized=decodeWorkshopStore(JSON.stringify(payload));
    const normalizedDrafts=decodeDraftStore(JSON.stringify(payload.drafts));
    cloudRevision.current=snapshot.revision;
    setWorkshop(normalized);
    setDrafts(normalizedDrafts);
    writeWorkshopStore(normalized);
    writeDrafts(normalizedDrafts);
    setCloudError("");
    setCloudReady(true);
   }catch(error){
    if(!active)return;
    setCloudError(error instanceof Error?error.message:"Impossible de charger les données partagées.");
    setCloudReady(false);
   }
  };
  void initialize();
  return ()=>{active=false;};
 },[isAdmin]);
 const totals=useMemo(()=>quoteTotals(glass,services,accessories),[glass,services,accessories]);
  const validQuote=isValidQuote(glass,services,accessories);
 const persistCloudState=async(nextWorkshop:WorkshopStore,nextDrafts:Draft[])=>{
  if(DEMO_MODE){setWorkshop(nextWorkshop);setDrafts(nextDrafts);const a=writeWorkshopStore(nextWorkshop),b=writeDrafts(nextDrafts);if(!a||!b)alert("Enregistrement local impossible : vérifiez le stockage de cet appareil.");return a&&b;}
  if(!cloudReady){alert("Les données partagées ne sont pas encore prêtes. Réessayez dans un instant.");return false;}
  try{
   const revision=await saveCloudWorkshop(createSupabaseBrowserClient(),{...nextWorkshop,drafts:nextDrafts},cloudRevision.current);
   cloudRevision.current=revision;
   setWorkshop(nextWorkshop);setDrafts(nextDrafts);
   const workshopCached=writeWorkshopStore(nextWorkshop),draftsCached=writeDrafts(nextDrafts);
   if(!workshopCached||!draftsCached)alert("Enregistrement cloud réussi, mais la copie locale de secours n’a pas pu être actualisée.");
   return true;
  }catch(error){
   const message=error instanceof Error?error.message:"Erreur de synchronisation.";
   if(message.includes("REVISION_CONFLICT")||message.includes("40001")){
    setCloudReady(false);
    setCloudError("Une autre session a modifié les données. Rechargez la page pour récupérer la dernière version avant de réessayer.");
    alert("Conflit de synchronisation : une autre session a modifié les données. Rechargez la page avant de réessayer.");
   }else alert("Échec de l’enregistrement partagé : "+message);
   return false;
  }
 };
 const persistDraft=async()=>{
  if(!validQuote){alert("Complétez les désignations, dimensions et quantités avant d’enregistrer le devis.");return;}
  if(editingDeliveredId){
   const original=workshop.orders.find(order=>order.id===editingDeliveredId);
   if(!original||original.status!=="delivered"){alert("Commande livrée introuvable.");return;}
   const currentMethods=[...new Set(original.payments.filter(payment=>payment.status!=="cancelled").map(payment=>payment.method))];
   let selectedMethod=currentMethods.length===1?currentMethods[0]:undefined;
   if(currentMethods.length>0){
    const entered=window.prompt("Mode de paiement actuel : "+(currentMethods.length===1?currentMethods[0]:"Mixte")+". Garder ce mode ou saisir le nouveau (Espèces, Virement, Chèque).",currentMethods.length===1?currentMethods[0]:"");
    if(entered===null)return;
    const normalized=entered.trim();
    if(!["Espèces","Virement","Chèque"].includes(normalized)){alert("Mode de paiement invalide.");return;}
    selectedMethod=normalized as "Espèces"|"Virement"|"Chèque";
   }
   try{
    const updated=reviseDeliveredOrder(original,{customer, totalTTC:totals.ttc, lines:{glass,services,accessories}},selectedMethod);
    if(!await persistCloudState({...workshop,orders:workshop.orders.map(order=>order.id===original.id?updated:order)},drafts))return;
    setEditingDeliveredId(null);setEditingId(null);setCustomer("");setGlass([]);setServices([]);setAccessories([]);setSection("List commandes");
    alert("تم تعديل الطلب المسلّم وتحديث الرصيد والمخزون.");
   }catch(error){alert(error instanceof Error?error.message:"Erreur lors de la modification.");}
   return;
  }
  const existing=drafts.find(x=>x.id===editingId);const d:Draft={id:existing?.id||crypto.randomUUID(),number:existing?.number||"CV-"+String(Date.now()).slice(-6),customer,createdAt:existing?.createdAt||new Date().toISOString(),glass,services,accessories,total:totals.ttc};const next=existing?drafts.map(x=>x.id===d.id?d:x):[d,...drafts];if(!await persistCloudState(workshop,next))return;setEditingId(d.id);setSaved(true);window.setTimeout(()=>setSaved(false),2500);};
 const saveWorkshop=async(next:WorkshopStore)=>persistCloudState(next,drafts);
 const addAccessoryPurchase=async(purchase:{accessoryId:string;label:string;quantity:number})=>{if(!Number.isFinite(purchase.quantity)||purchase.quantity<=0)return;await saveWorkshop({...workshop,accessoryPurchases:[...workshop.accessoryPurchases,purchase]});};
 const addExpense=async(expense:ExpenseRecord)=>{await saveWorkshop({...workshop,expenses:[expense,...(workshop.expenses||[])]});};
 const updateSupplierInvoice=async(invoice:WorkshopStore["supplierInvoices"][number])=>{return saveWorkshop({...workshop,supplierInvoices:workshop.supplierInvoices.map(x=>x.id===invoice.id?invoice:x)});};
 const updateOrderRecord=async(order:StoredOrder)=>saveWorkshop({...workshop,orders:workshop.orders.map(x=>x.id===order.id?order:x)});
 const addSupplierInvoice=async(invoice:WorkshopStore["supplierInvoices"][number])=>{const additions=invoice.category==="accessory"?invoice.lines.map(line=>{const key=line.label.trim().toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"accessoire-sans-nom";return {accessoryId:key,label:line.label.trim(),quantity:line.quantity};}):[];await saveWorkshop({...workshop,supplierInvoices:[invoice,...workshop.supplierInvoices],accessoryPurchases:[...workshop.accessoryPurchases,...additions]});};
 const deliverDraft=async(d:Draft)=>{try{if(workshop.orders.some(o=>o.id===d.id)){alert("Cette commande existe déjà dans la liste des commandes.");return;}const base=orderFromDraft(d);const delivered=markOrderDelivered(base,d.customer);const next={...workshop,orders:[delivered,...workshop.orders]};const remaining=drafts.filter(x=>x.id!==d.id);if(!await persistCloudState(next,remaining))return;if(editingId===d.id)setEditingId(null);}catch(error){alert(error instanceof Error?error.message:"Erreur lors de la livraison.");}};
 const recordSelectedPayment=async(order:StoredOrder,amount:number,method:"Espèces"|"Virement"|"Chèque"|"Effet",details?:{reference:string;dueDate:string}):Promise<boolean>=>{try{const updated=addPayment(order,{id:crypto.randomUUID(),method,amount,status:"pending",...(details?{reference:details.reference,dueDate:details.dueDate,date:details.dueDate}:{})});return await saveWorkshop({...workshop,orders:workshop.orders.map(o=>o.id===order.id?updated:o)});}catch(error){alert(error instanceof Error?error.message:"Erreur paiement.");return false;}};
 const recordPayment=async(order:StoredOrder)=>{const raw=window.prompt("Montant reçu (DH)");if(raw===null)return;const amount=Number(raw);if(!Number.isFinite(amount)||amount<=0){alert("Montant invalide.");return;}const methodRaw=window.prompt("Mode : Espèces, Virement, Chèque ou Effet","Espèces");if(methodRaw===null)return;const method=methodRaw.trim();if(!["Espèces","Virement","Chèque","Effet"].includes(method)){alert("Mode de paiement invalide.");return;}try{const updated=addPayment(order,{id:crypto.randomUUID(),method:method as "Espèces"|"Virement"|"Chèque"|"Effet",amount,status:"pending"});await saveWorkshop({...workshop,orders:workshop.orders.map(o=>o.id===order.id?updated:o)});}catch(error){alert(error instanceof Error?error.message:"Erreur paiement.");}};
 const collectCheque=async(order:StoredOrder,paymentId:string)=>{try{const updated=confirmPayment(order,paymentId);await saveWorkshop({...workshop,orders:workshop.orders.map(o=>o.id===order.id?updated:o)});}catch(error){alert(error instanceof Error?error.message:"Erreur de confirmation.");}};
 const confirmChequeRefund=async(order:StoredOrder,refundId:string)=>{try{const updated=confirmRefund(order,refundId);await saveWorkshop({...workshop,orders:workshop.orders.map(o=>o.id===order.id?updated:o)});}catch(error){alert(error instanceof Error?error.message:"Erreur de confirmation du remboursement.");}};
 const deleteDeliveredOrder=async(order:StoredOrder)=>{if(!window.confirm("Supprimer définitivement "+order.number+" ? Tous ses paiements, mouvements, avoirs et effets sur le stock seront supprimés du système."))return;await saveWorkshop({...workshop,orders:workshop.orders.filter(o=>o.id!==order.id)});};
 const settleAvoir=async(orderId:string,avoirId:string)=>{const order=workshop.orders.find(o=>o.id===orderId);if(!order)return;try{const updated=settleCustomerAvoir(order,avoirId);await saveWorkshop({...workshop,orders:workshop.orders.map(o=>o.id===orderId?updated:o)});}catch(error){alert(error instanceof Error?error.message:"Erreur Avoir client.");}};
 const updateGlass=(i:number,p:Partial<GlassLine>)=>setGlass(a=>a.map((x,n)=>n===i?{...x,...p}:x));
 const updateService=(i:number,p:Partial<ServiceLine>)=>setServices(a=>a.map((x,n)=>n===i?{...x,...p,...(p.name!==undefined?{unit:serviceUnit(p.name)}:{})}:x));
 const updateAccessory=(i:number,p:Partial<AccessoryLine>)=>setAccessories(a=>a.map((x,n)=>n===i?{...x,...p}:x));
 if(!authReady)return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f4f6f8",color:"#263746",fontFamily:"Arial,sans-serif"}}>Chargement de l’espace administrateur…</main>;
 if(!isAdmin)return <AdminLogin onAuthenticated={()=>setIsAdmin(true)}/>;
 if(!cloudReady)return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f4f6f8",color:"#263746",fontFamily:"Arial,sans-serif",padding:24,textAlign:"center"}}>{cloudError||"Chargement des données partagées de Cairo Verre…"}</main>;
 return <main className="shell">
 <aside className={collapsed?"sidebar collapsed":"sidebar"}><div className="brand"><div className="brand-mark">CV</div>{!collapsed&&<div><strong>CAIRO VERRE</strong><small>ATELIER · MEDIOUNA</small></div>}</div><button className="collapse" onClick={()=>setCollapsed(!collapsed)} aria-label="Réduire le menu"><PanelLeftClose size={17}/></button><div className="nav-caption">{!collapsed&&"ESPACE DE TRAVAIL"}</div>
 {nav.map(item=><button key={item.label} className={"nav-item "+(section===item.label?"active":"")} onClick={()=>setSection(item.label)} title={item.label}><item.icon size={18}/>{!collapsed&&<span>{item.label}</span>}</button>)}<div className="sidebar-bottom"><Settings size={17}/>{!collapsed&&<span>Paramètres</span>}</div></aside>
 <section className="workspace"><header className="topbar"><div><span className="eyebrow">CAIRO VERRE / ATELIER</span><h1>{section}</h1></div><div className="top-right"><span className="status-dot"/><span>{DEMO_MODE?"Mode test · données locales":"Session administrateur"}</span>{!DEMO_MODE&&<button className="add-btn" onClick={async()=>{await createSupabaseBrowserClient().auth.signOut();setIsAdmin(false);}}>Déconnexion</button>}<div className="avatar">CV</div></div></header>
 {section==="Calcul"?<div className="content"><div className="intro"><div><h2>{editingDeliveredId?"Modifier une commande livrée":editingId?"Modifier le brouillon":"Nouveau devis"}</h2><p>Composez une commande : vitrage, services et accessoires dans un seul calcul.</p></div><div className="intro-actions"><span className="draft-count">{drafts.length} brouillon(s)</span><button className="add-btn" onClick={()=>{setCustomer("");setGlass([]);setServices([]);setAccessories([]);setEditingId(null);setEditingDeliveredId(null);setSaved(false);}}>+ Nouveau</button></div></div><div className="form-grid"><div className="main-column">
 <section className="panel"><div className="panel-heading"><div><span className="step">01</span><div><h3>Client</h3><p>Le client sera enregistré à la livraison.</p></div></div></div><input className="text-input" value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Nom du client (facultatif pour le brouillon)"/></section>
 <section className="panel"><div className="panel-heading"><div><span className="step">02</span><div><h3>Vitrage</h3><p>Dimensions en millimètres · tarif de vente variable par commande.</p></div></div><button className="add-btn" onClick={()=>setGlass(a=>[...a,{label:"",widthMm:0,heightMm:0,quantity:1,pricePerM2:0}])}><Plus size={15}/> Ajouter verre</button></div>
 {glass.length===0?<div className="empty-inline">Aucun vitrage ajouté. Vous pouvez aussi créer un devis avec services ou accessoires uniquement.</div>:glass.map((x,i)=><div className="line-row" key={i}><input className="text-input item-name" placeholder="Type de verre" value={x.label} onChange={e=>updateGlass(i,{label:e.target.value})}/><Field label="Largeur mm" value={x.widthMm} onChange={v=>updateGlass(i,{widthMm:v})}/><Field label="Hauteur mm" value={x.heightMm} onChange={v=>updateGlass(i,{heightMm:v})}/><Field label="Qté" value={x.quantity} onChange={v=>updateGlass(i,{quantity:v})}/><Field label="Prix / m² TTC" value={x.pricePerM2} onChange={v=>updateGlass(i,{pricePerM2:v})}/><strong className="line-total">{money(areaM2(x.widthMm,x.heightMm,x.quantity)*x.pricePerM2)}</strong><button className="icon-btn danger" onClick={()=>setGlass(a=>a.filter((_,n)=>n!==i))}><Trash2 size={16}/></button></div>)}</section>
 <section className="panel"><div className="panel-heading"><div><span className="step">03</span><div><h3>Services</h3><p>Les six prestations ci-dessous sont au mètre linéaire (ml). Les autres sont au m².</p></div></div><button className="add-btn" onClick={()=>setServices(a=>[...a,{name:"",unit:"m²",quantity:0,unitPrice:0}])}><Plus size={15}/> Autre service</button></div>
 <div className="service-grid">{LINEAR_SERVICES.map(name=><button key={name} className={"service-chip "+(services.some(s=>s.name===name)?"selected":"")} onClick={()=>setServices(a=>a.some(s=>s.name===name)?a.filter(s=>s.name!==name):[...a,{name,unit:"ml",quantity:0,unitPrice:0}])}>{name}<span>{services.some(s=>s.name===name)?"Ajouté ✓":"+ Ajouter"}</span></button>)}</div>
 {services.map((x,i)=><div className="line-row service-row" key={x.name+i}><input className="text-input item-name" value={x.name} placeholder="Nom du service" onChange={e=>updateService(i,{name:e.target.value})}/><span className="unit-pill">{x.unit}</span><Field label={"Quantité "+x.unit} value={x.quantity} onChange={v=>updateService(i,{quantity:v})}/><Field label="Prix unitaire TTC" value={x.unitPrice} onChange={v=>updateService(i,{unitPrice:v})}/><strong className="line-total">{money(x.quantity*x.unitPrice)}</strong><button className="icon-btn danger" onClick={()=>setServices(a=>a.filter((_,n)=>n!==i))}><Trash2 size={16}/></button></div>)}
 {services.length===0&&<div className="empty-inline">Sélectionnez une prestation pour l’ajouter au devis.</div>}</section>
 <section className="panel"><div className="panel-heading"><div><span className="step">04</span><div><h3>Accessoires</h3><p>Quantités et prix TTC saisis pour cette commande.</p></div></div><button className="add-btn" onClick={()=>setAccessories(a=>[...a,{label:"",quantity:1,unitPrice:0}])}><Plus size={15}/> Ajouter accessoire</button></div>
 {accessories.length===0?<div className="empty-inline">Aucun accessoire ajouté.</div>:accessories.map((x,i)=><div className="line-row" key={i}><input className="text-input item-name" placeholder="Nom de l'accessoire" value={x.label} onChange={e=>updateAccessory(i,{label:e.target.value})}/><Field label="Quantité" value={x.quantity} onChange={v=>updateAccessory(i,{quantity:v})}/><Field label="Prix unitaire TTC" value={x.unitPrice} onChange={v=>updateAccessory(i,{unitPrice:v})}/><strong className="line-total">{money(x.quantity*x.unitPrice)}</strong><button className="icon-btn danger" onClick={()=>setAccessories(a=>a.filter((_,n)=>n!==i))}><Trash2 size={16}/></button></div>)}</section></div>
 <aside className="summary-column"><div className="summary-card"><div className="summary-title"><div><span className="eyebrow">RÉCAPITULATIF</span><h3>Votre devis</h3></div><FileText size={20}/></div><div className="summary-line"><span>Vitrage</span><strong>{money(totals.glassTotal)}</strong></div><div className="summary-line"><span>Services</span><strong>{money(totals.serviceTotal)}</strong></div><div className="summary-line"><span>Accessoires</span><strong>{money(totals.accessoryTotal)}</strong></div><div className="summary-divider"/><div className="summary-line muted"><span>Total HT (TTC / 1,20)</span><strong>{money(totals.ht)}</strong></div><div className="summary-line muted"><span>TVA 20%</span><strong>{money(totals.tva)}</strong></div><div className="total-box"><span>Total TTC</span><strong>{money(totals.ttc)}</strong></div><button className="save-btn" onClick={persistDraft} disabled={!validQuote}><Save size={17}/> {editingDeliveredId?"Enregistrer les modifications de la commande livrée":editingId?"Mettre à jour le brouillon":"Enregistrer brouillon"}</button>{saved&&<div className="saved-note"><CheckCircle2 size={16}/> Brouillon enregistré sur cet appareil.</div>}<p className="local-note">Brouillon uniquement : aucun stock, paiement, solde client ou rapport n’est modifié.</p></div><div className="tip-card"><strong>À retenir</strong><p>Les calculs commerciaux sont TTC. Le HT et la TVA sont affichés uniquement dans le récapitulatif global.</p></div></aside></div></div>
 :<div className="content"><div className="intro"><div><h2>{section}</h2><p>Section en cours de construction selon les règles métier validées.</p></div></div>{section==="List commandes"?<>
 <div className="panel"><div className="panel-heading"><div><h3>Commandes livrées / annulées</h3><p>Les soldes et mouvements sont recalculés depuis les enregistrements sources.</p></div><span className="draft-count">{workshop.orders.length} commande(s)</span></div>
 {workshop.orders.length?workshop.orders.map(o=><div className="saved-draft" key={o.id}><div><strong>{o.number} · {o.customer}</strong><span>{o.status==="delivered"?"Livrée":"Annulée"} · Total {money(o.totalTTC)} · Paiements confirmés {money(o.payments.filter(p=>p.status==="confirmed").reduce((s,p)=>s+p.amount,0))}</span><span>{o.payments.filter(p=>p.status==="pending").map(p=>p.method+" en attente : "+money(p.amount)).join(" · ")}</span><span>{o.refunds.filter(r=>r.status==="pending").map(r=>"Remboursement "+r.method+" en attente : "+money(r.amount)).join(" · ")}</span></div><div className="draft-actions">{o.status==="delivered"&&<>{!o.payments.some(p=>p.method==="Chèque"||p.method==="Effet")&&<button className="add-btn" onClick={()=>{setCustomer(o.customer);setGlass(o.lines.glass.map(line=>({...line})));setServices(o.lines.services.map(line=>({...line})));setAccessories(o.lines.accessories.map(line=>({...line})));setEditingDeliveredId(o.id);setEditingId(null);setSection("Calcul");}}>Modifier</button>}<button className="add-btn" onClick={()=>printDraft({number:o.number,customer:o.customer,glass:o.lines.glass,services:o.lines.services,accessories:o.lines.accessories,total:o.totalTTC},"Devis")}>Devis</button><button className="add-btn" onClick={()=>printDraft({number:o.number,customer:o.customer,glass:o.lines.glass,services:o.lines.services,accessories:o.lines.accessories,total:o.totalTTC},"BP")}>BP</button><button className="add-btn" onClick={()=>printDraft({number:o.number,customer:o.customer,glass:o.lines.glass,services:o.lines.services,accessories:o.lines.accessories,total:o.totalTTC},"BL")}>BL</button><button className="add-btn" onClick={()=>printDraft({number:o.number,customer:o.customer,glass:o.lines.glass,services:o.lines.services,accessories:o.lines.accessories,total:o.totalTTC},"Facture")}>Facture</button><button className="add-btn" onClick={()=>deleteDeliveredOrder(o)}>Supprimer définitivement</button></>}{o.status==="cancelled"&&<button className="add-btn" onClick={()=>deleteDeliveredOrder(o)}>Supprimer définitivement</button>}{o.refunds.filter(r=>(r.method==="Chèque"||r.method==="Effet")&&r.status==="pending").map(r=><button key={r.id} className="add-btn" onClick={()=>confirmChequeRefund(o,r.id)}>Confirmer remboursement chèque {money(r.amount)}</button>)}</div></div>):<div className="empty-inline">Aucune commande réelle pour le moment.</div>}</div>
 <div className="panel"><div className="panel-heading"><div><h3>Brouillons enregistrés</h3><p>Un brouillon devient une commande réelle uniquement après livraison.</p></div><Search size={18}/></div>{drafts.length?drafts.map(d=><div className="saved-draft" key={d.id}><div><strong>{d.number}</strong><span>{d.customer||"Client non renseigné"} · {new Date(d.createdAt).toLocaleDateString("fr-FR")}</span></div><strong>{money(d.total)}</strong><div className="draft-actions"><button className="add-btn" onClick={()=>{setCustomer(d.customer);setGlass(d.glass);setServices(d.services.map(s=>({...s,unit:serviceUnit(s.name)})));setAccessories(d.accessories);setEditingId(d.id);setSection("Calcul");}}>Modifier</button><button className="add-btn" onClick={()=>printDraft(d,"Devis")}>Devis</button><button className="add-btn" onClick={()=>printDraft(d,"BP")}>BP</button><button className="add-btn" onClick={()=>printDraft(d,"BL")}>BL</button><button className="add-btn" onClick={()=>printDraft(d,"Facture")}>Facture</button><button className="add-btn" disabled={!d.customer.trim()} onClick={()=>deliverDraft(d)}>Livrée</button><button className="icon-btn danger" aria-label="Supprimer le brouillon" onClick={async()=>{const next=drafts.filter(x=>x.id!==d.id);if(!await persistCloudState(workshop,next))return;if(editingId===d.id)setEditingId(null);}}><Trash2 size={16}/></button></div></div>):<div className="empty-inline">Aucun brouillon enregistré.</div>}</div>
 </>:section==="La caisse"?<><CaissePaymentPanel orders={workshop.orders} onRecordPayment={recordSelectedPayment}/><div className="panel"><div className="panel-heading"><div><h3>Journal de caisse</h3><p>Encaissements confirmés, règlements fournisseurs effectués et sorties réelles (remboursements et salaires).</p></div></div><div className="summary-line"><span>Total Entrée</span><strong>{money(cashMovements.filter(m=>m.direction==="Entrée").reduce((s,m)=>s+m.amount,0))}</strong></div><div className="summary-line"><span>Total Sortie</span><strong>{money(cashMovements.filter(m=>m.direction==="Sortie").reduce((s,m)=>s+m.amount,0))}</strong></div><div className="summary-line"><span>Solde net</span><strong>{money(cashMovements.reduce((s,m)=>s+(m.direction==="Entrée"?m.amount:-m.amount),0))}</strong></div><div className="summary-divider"/>{cashMovements.length?cashMovements.map((m,i)=><div className="saved-draft" key={m.orderId+"-"+i}><div><strong>{m.reference} · {m.kind}</strong><span>{m.counterparty?m.counterparty+" · ":""}{m.method} · {m.direction}</span></div><strong>{money(m.amount)}</strong></div>):<div className="empty-inline">Aucun mouvement confirmé dans la caisse.</div>}</div></>:section==="Journalier"?<JournalierPanel movements={ledger.cashMovements} scheduledMovements={scheduledChequeMovements} expenses={workshop.expenses||[]} employees={workshop.employees||[]} payrollWeeks={workshop.payrollWeeks||[]}/>:section==="Soldes & chèques"?<ChequesEffetsPanel orders={workshop.orders} invoices={workshop.supplierInvoices} onUpdateOrder={updateOrderRecord} onUpdateInvoice={updateSupplierInvoice}/>:section==="Personnel"?<PersonnelPanel employees={workshop.employees||[]} weeks={workshop.payrollWeeks||[]} onChange={(employees,weeks)=>saveWorkshop({...workshop,employees,payrollWeeks:weeks})}/>:section==="Dépense"?<ExpensesPanel expenses={workshop.expenses||[]} onAdd={addExpense}/>:section==="Stock"?<StockPanel purchases={workshop.accessoryPurchases} stock={ledger.stock} onAdd={addAccessoryPurchase}/>:section==="Clients & fournisseurs"?<div><CustomersPanel customers={ledger.customers} orders={workshop.orders} onSettleAvoir={settleAvoir}/><PurchasesPanel invoices={workshop.supplierInvoices} onAdd={addSupplierInvoice} onUpdate={updateSupplierInvoice}/></div>:<div className="panel placeholder"><div className="placeholder-icon"><Settings size={22}/></div><h3>Section planifiée</h3><p>La structure métier est définie. Cette page sera implémentée avec ses règles de gestion avant activation.</p></div>}</div>}
 </section></main>;
}
function printDraft(d:Pick<Draft,"number"|"customer"|"glass"|"services"|"accessories"|"total">,kind:"Devis"|"BP"|"BL"|"Facture"){const w=window.open("","_blank","width=900,height=700");if(!w){alert("Autorisez les fenêtres contextuelles pour imprimer.");return;}const esc=(s:string)=>s.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));const rows=[...d.glass.map(x=>({label:x.label||"Vitrage",detail:`${x.widthMm} × ${x.heightMm} mm · ${x.quantity} pièce(s)`,amount:areaM2(x.widthMm,x.heightMm,x.quantity)*x.pricePerM2})),...d.services.map(x=>({label:x.name,detail:`${x.quantity} ${x.unit} × ${money(x.unitPrice)}`,amount:x.quantity*x.unitPrice})),...d.accessories.map(x=>({label:x.label||"Accessoire",detail:`${x.quantity} × ${money(x.unitPrice)}`,amount:x.quantity*x.unitPrice}))];const ht=d.total/1.2;w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${kind} ${esc(d.number)}</title><style>body{font:14px Arial,sans-serif;color:#17212b;padding:36px}header{display:flex;justify-content:space-between;border-bottom:2px solid #24384a;padding-bottom:18px}h1{font-size:24px;margin:0}small{color:#667}table{width:100%;border-collapse:collapse;margin-top:30px}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}th:last-child,td:last-child{text-align:right}.totals{margin:28px 0 0 auto;width:280px}.totals div{display:flex;justify-content:space-between;padding:6px}.grand{font-size:20px;font-weight:bold;border-top:2px solid #24384a}.foot{margin-top:50px;color:#667;font-size:12px}@media print{button{display:none}}</style></head><body><header><div><h1>CAIRO VERRE</h1><p>72, Lotissement Al Wiam, Rdc, Mediouna<br>ICE 002843449000049 · RC 507771</p></div><div><h1>${kind}</h1><p>Document ${esc(d.number)}<br>Date : ${new Date().toLocaleDateString("fr-FR")}<br>Client : ${esc(d.customer||"Non renseigné")}</p></div></header><table><thead><tr><th>Désignation</th><th>Détails</th><th>Montant TTC</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.label)}</td><td>${esc(x.detail)}</td><td>${money(x.amount)}</td></tr>`).join("")}</tbody></table><div class="totals"><div><span>Total HT</span><strong>${money(ht)}</strong></div><div><span>TVA 20%</span><strong>${money(d.total-ht)}</strong></div><div class="grand"><span>Total TTC</span><strong>${money(d.total)}</strong></div></div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();}
function Field({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void}){return <label className="field"><span>{label}</span><input type="number" min="0" step="any" value={value} onChange={e=>onChange(Math.max(0,Number(e.target.value)||0))}/></label>}
