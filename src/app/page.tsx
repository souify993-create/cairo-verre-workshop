"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, ClipboardList, Users, Package, Wallet, FileText, Settings, Plus, Trash2, Save, CheckCircle2, Search, PanelLeftClose } from "lucide-react";
import { AccessoryLine, GlassLine, LINEAR_SERVICES, AREA_SERVICES, ServiceLine, quoteTotals, areaM2, serviceUnit, serviceQuantity, serviceQuantityForGlassLines, isValidQuote } from "@/lib/calculations";
import { decodeDraftStore, readDrafts, writeDrafts } from "@/lib/storage";
import { addPayment, confirmRefund, markOrderDelivered, orderFromDraft, reviseDeliveredOrder, settleCustomerAvoir } from "@/lib/workshop";
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
import { ACCESSORY_CATALOG, GLASS_CATALOG, catalogKey } from "@/lib/catalog";
import { loadCloudWorkshop, saveCloudWorkshop } from "@/lib/cloud-workshop";
// Temporary workshop test mode: local demo data only; switch off after feature QA and before admin rollout.
const DEMO_MODE = true;
const nav=[{label:"Calcul",icon:Calculator},{label:"List commandes",icon:ClipboardList},{label:"La caisse",icon:Wallet},{label:"Journalier",icon:FileText},{label:"Soldes & chèques",icon:ClipboardList},{label:"Clients & fournisseurs",icon:Users},{label:"Achat",icon:Package},{label:"Personnel",icon:Users},{label:"Stock",icon:Package},{label:"Dépense",icon:Wallet}];
const money=(n:number)=>new Intl.NumberFormat("fr-MA",{style:"currency",currency:"MAD",maximumFractionDigits:2}).format(n);
const remainingConfirmed=(order:StoredOrder)=>Math.max(0,order.totalTTC-order.payments.filter(p=>p.status==="confirmed").reduce((sum,p)=>sum+p.amount,0)+order.refunds.filter(r=>r.status==="confirmed").reduce((sum,r)=>sum+r.amount,0));
function normalizeOrderNumbers(drafts: Draft[], orders: StoredOrder[]) {
 const entries=[...drafts.map(item=>({id:item.id,createdAt:item.createdAt,number:item.number})),...orders.map(item=>({id:item.id,createdAt:item.createdAt,number:item.number}))];
 const used=entries.map(item=>/^C#(\d+)$/.exec(item.number)).filter(Boolean).map(match=>Number(match![1]));
 let next=Math.max(0,...used)+1;
 const numbers=new Map<string,string>();
 for(const item of [...entries].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))){
  const match=/^C#(\d+)$/.exec(item.number);
  numbers.set(item.id,match?item.number:`C#${next++}`);
 }
 const nextDrafts=drafts.map(item=>({...item,number:numbers.get(item.id)||item.number}));
 const nextOrders=orders.map(item=>({...item,number:numbers.get(item.id)||item.number}));
 return {drafts:nextDrafts,orders:nextOrders,changed:nextDrafts.some((item,i)=>item.number!==drafts[i].number)||nextOrders.some((item,i)=>item.number!==orders[i].number)};
}
function nextOrderNumber(drafts: Draft[], orders: StoredOrder[]) {
 const values=[...drafts,...orders].map(item=>Number(/^C#(\d+)$/.exec(item.number)?.[1]||0));
 return `C#${Math.max(0,...values)+1}`;
}

export default function Home(){
 const [authReady,setAuthReady]=useState(DEMO_MODE),[isAdmin,setIsAdmin]=useState(DEMO_MODE);
 const [cloudReady,setCloudReady]=useState(false),[cloudError,setCloudError]=useState("");
 const cloudRevision=useRef(0);
 const [section,setSection]=useState("Calcul"),[collapsed,setCollapsed]=useState(false),[customer,setCustomer]=useState("");
 const [glass,setGlass]=useState<GlassLine[]>([]),[services,setServices]=useState<ServiceLine[]>([]),[accessories,setAccessories]=useState<AccessoryLine[]>([]);
 const [serviceWidth,setServiceWidth]=useState(0),[serviceHeight,setServiceHeight]=useState(0),[servicePieces,setServicePieces]=useState(1);
 const glassGroupKey=(line:GlassLine)=>line.groupId||"legacy:"+line.label.trim().toLocaleLowerCase("fr");
 const glassGroups=useMemo(()=>{const map=new Map<string,GlassLine[]>();glass.forEach(line=>{const key=glassGroupKey(line);map.set(key,[...(map.get(key)||[]),line]);});return [...map.entries()].map(([id,lines])=>({id,lines}));},[glass]);
 const measuredServices=useMemo(()=>services.map(s=>{const lines=s.groupId?glass.filter(line=>line.groupId===s.groupId):[];const quantity=s.groupId?serviceQuantityForGlassLines(s.name,lines):serviceQuantity(s.name,serviceWidth,serviceHeight,servicePieces);return {...s,unit:serviceUnit(s.name),widthMm:lines[0]?.widthMm??serviceWidth,heightMm:lines[0]?.heightMm??serviceHeight,pieces:lines.reduce((sum,line)=>sum+line.quantity,0)||servicePieces,quantity};}),[services,glass,serviceWidth,serviceHeight,servicePieces]);
 const [drafts,setDrafts]=useState<Draft[]>([]),[saved,setSaved]=useState(false),[editingId,setEditingId]=useState<string|null>(null);
 const [orderFilter,setOrderFilter]=useState<"all"|"draft"|"cancelled"|"delivered">("draft"),[orderPage,setOrderPage]=useState(1),[orderSearch,setOrderSearch]=useState("");
 const [cashPage,setCashPage]=useState(1),[caisseTab,setCaisseTab]=useState<"journal"|"balances">("journal");
 const [editingDeliveredId,setEditingDeliveredId]=useState<string|null>(null);
 const [deliveryDraftId,setDeliveryDraftId]=useState<string|null>(null);
 const [initialPaidAmount,setInitialPaidAmount]=useState("");
 const [initialPaymentMethod,setInitialPaymentMethod]=useState<"Espèces"|"Virement"|"Chèque"|"Effet">("Espèces");
 const [initialChequeReference,setInitialChequeReference]=useState("");
 const [initialChequeDueDate,setInitialChequeDueDate]=useState("");
 const [workshop,setWorkshop]=useState<WorkshopStore>({version:1,orders:[],accessoryPurchases:[],supplierInvoices:[],expenses:[],employees:[],payrollWeeks:[]});
 const ledger=useMemo(()=>deriveLedger(workshop.orders,workshop.accessoryPurchases,workshop.supplierInvoices),[workshop]);
 const cashMovements=useMemo(()=>[...ledger.cashMovements,...derivePayrollCashMovements(workshop.payrollWeeks||[],workshop.employees||[])],[ledger,workshop.payrollWeeks,workshop.employees]);

 const orderRows=useMemo(()=>[
  ...drafts.map(d=>({kind:"draft" as const,id:d.id,number:d.number,customer:d.customer,createdAt:d.createdAt,total:d.total,draft:d})),
  ...workshop.orders.map(o=>({kind:"order" as const,id:o.id,number:o.number,customer:o.customer,createdAt:o.createdAt,total:o.totalTTC,status:o.status,order:o})),
 ].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),[drafts,workshop.orders]);
 const filteredOrderRows=useMemo(()=>orderRows.filter(row=>(orderFilter==="all"|| (row.kind==="draft"?"draft":row.status)===orderFilter)&&(!orderSearch.trim()||(row.number+" "+row.customer).toLocaleLowerCase("fr").includes(orderSearch.trim().toLocaleLowerCase("fr")))),[orderRows,orderFilter,orderSearch]);
 const orderPageCount=Math.max(1,Math.ceil(filteredOrderRows.length/20));
 const visibleOrderRows=filteredOrderRows.slice((Math.min(orderPage,orderPageCount)-1)*20,Math.min(orderPage,orderPageCount)*20);
 const sortedCashMovements=useMemo(()=>cashMovements.map((movement,index)=>({movement,index})).sort((a,b)=>(Date.parse(b.movement.date||"")||0)-(Date.parse(a.movement.date||"")||0)||b.index-a.index).map(item=>item.movement),[cashMovements]);
 const cashPageCount=Math.max(1,Math.ceil(sortedCashMovements.length/20));
 const visibleCashMovements=sortedCashMovements.slice((Math.min(cashPage,cashPageCount)-1)*20,Math.min(cashPage,cashPageCount)*20);
 const scheduledChequeMovements=useMemo(()=>[...workshop.orders.flatMap(o=>o.payments.filter(p=>(p.method==="Chèque"||p.method==="Effet")&&p.status==="pending"&&p.dueDate).map(p=>({orderId:o.id,reference:o.number,method:p.method,direction:"Entrée" as const,amount:p.amount,kind:"Paiement" as const,counterparty:o.customer,date:p.dueDate}))),...workshop.supplierInvoices.flatMap(i=>(i.payments||[]).filter(p=>(p.method==="Chèque"||p.method==="Effet")&&p.status==="pending"&&p.dueDate).map(p=>({orderId:i.id,reference:p.reference||i.invoiceNumber,method:p.method,direction:"Sortie" as const,amount:p.amount,kind:"Achat fournisseur" as const,counterparty:i.supplier,date:p.dueDate})))],[workshop.orders,workshop.supplierInvoices]);
 useEffect(()=>{const loadedDrafts=readDrafts();const stored=readWorkshopStore();const known=new Set(stored.accessoryPurchases.map(item=>item.accessoryId));const openingStock=ACCESSORY_CATALOG.filter(label=>!known.has(catalogKey(label))).map(label=>({accessoryId:catalogKey(label),label,quantity:200}));const initialized={...stored,accessoryPurchases:[...stored.accessoryPurchases,...openingStock]};const numbered=normalizeOrderNumbers(loadedDrafts,initialized.orders);setDrafts(numbered.drafts);setWorkshop({...initialized,orders:numbered.orders});if(openingStock.length||numbered.changed)writeWorkshopStore({...initialized,orders:numbered.orders});if(numbered.changed)writeDrafts(numbered.drafts);},[]);
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
     const localStore=readWorkshopStore();const numbered=normalizeOrderNumbers(readDrafts(),localStore.orders);const localPayload={...localStore,orders:numbered.orders,drafts:numbered.drafts};
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
    const decodedDrafts=decodeDraftStore(JSON.stringify(payload.drafts));
    const numbered=normalizeOrderNumbers(decodedDrafts,normalized.orders);
    const normalizedWithNumbers={...normalized,orders:numbered.orders};
    let revision=snapshot.revision;
    if(numbered.changed)revision=await saveCloudWorkshop(supabase,{...normalizedWithNumbers,drafts:numbered.drafts},snapshot.revision);
    cloudRevision.current=revision;
    setWorkshop(normalizedWithNumbers);
    setDrafts(numbered.drafts);
    writeWorkshopStore(normalizedWithNumbers);
    writeDrafts(numbered.drafts);
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
 const totals=useMemo(()=>quoteTotals(glass,measuredServices,accessories),[glass,measuredServices,accessories]);
  const validQuote=isValidQuote(glass,measuredServices,accessories);
 const persistCloudState=async(nextWorkshop:WorkshopStore,nextDrafts:Draft[])=>{
  if(DEMO_MODE){setWorkshop(nextWorkshop);setDrafts(nextDrafts);setOrderPage(1);setCashPage(1);const a=writeWorkshopStore(nextWorkshop),b=writeDrafts(nextDrafts);if(!a||!b)alert("Enregistrement local impossible : vérifiez le stockage de cet appareil.");return a&&b;}
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
    const updated=reviseDeliveredOrder(original,{customer, totalTTC:totals.ttc, lines:{glass,services:measuredServices,accessories}},selectedMethod);
    if(!await persistCloudState({...workshop,orders:workshop.orders.map(order=>order.id===original.id?updated:order)},drafts))return;
    setEditingDeliveredId(null);setEditingId(null);setCustomer("");setGlass([]);setServices([]);setAccessories([]);setSection("List commandes");
    alert("تم تعديل الطلب المسلّم وتحديث الرصيد والمخزون.");
   }catch(error){alert(error instanceof Error?error.message:"Erreur lors de la modification.");}
   return;
  }
  if(deliveryDraftId){
  const draft=drafts.find(x=>x.id===deliveryDraftId);
  if(!draft){alert("Brouillon introuvable. Rechargez la liste des brouillons.");return;}
  const amount=initialPaidAmount.trim()===""?0:Number(initialPaidAmount);
  if(!Number.isFinite(amount)||amount<0||amount>totals.ttc+0.009){alert("Le montant payé doit être compris entre 0 et le Total TTC.");return;}
  if((initialPaymentMethod==="Chèque"||initialPaymentMethod==="Effet")&&amount>0&&(!initialChequeReference.trim()||!initialChequeDueDate)){alert("Le numéro et la date d’échéance sont obligatoires pour un chèque ou un effet.");return;}
  try{
   let delivered=markOrderDelivered(orderFromDraft({...draft,customer,glass,services:measuredServices,accessories,total:totals.ttc}),customer);
   if(amount>0) delivered=addPayment(delivered,{id:crypto.randomUUID(),method:initialPaymentMethod,amount,status:"pending",...(initialPaymentMethod==="Chèque"||initialPaymentMethod==="Effet"?{reference:initialChequeReference.trim(),dueDate:initialChequeDueDate}:{})});
   const nextOrders=[delivered,...workshop.orders.filter(o=>o.id!==delivered.id)];
   const nextDrafts=drafts.filter(x=>x.id!==deliveryDraftId);
   if(!await persistCloudState({...workshop,orders:nextOrders},nextDrafts))return;
   setDeliveryDraftId(null);setInitialPaidAmount("");setInitialPaymentMethod("Espèces");setInitialChequeReference("");setInitialChequeDueDate("");
   setEditingId(null);setCustomer("");setGlass([]);setServices([]);setAccessories([]);setSection("List commandes");
   alert("Commande livrée et paiement initial enregistré avec succès.");
  }catch(error){alert(error instanceof Error?error.message:"Erreur lors de la livraison.");}
  return;
 }
 const existing=drafts.find(x=>x.id===editingId);const d:Draft={id:existing?.id||crypto.randomUUID(),number:existing?.number||nextOrderNumber(drafts,workshop.orders),customer,createdAt:existing?.createdAt||new Date().toISOString(),glass,services:measuredServices,accessories,total:totals.ttc};const next=existing?drafts.map(x=>x.id===d.id?d:x):[d,...drafts];if(!await persistCloudState(workshop,next))return;setEditingId(d.id);setSaved(true);window.setTimeout(()=>setSaved(false),2500);};
 const saveWorkshop=async(next:WorkshopStore)=>persistCloudState(next,drafts);
 const addAccessoryPurchase=async(purchase:{accessoryId:string;label:string;quantity:number})=>{if(!Number.isFinite(purchase.quantity)||purchase.quantity<=0)return;await saveWorkshop({...workshop,accessoryPurchases:[...workshop.accessoryPurchases,purchase]});};
 const addExpense=async(expense:ExpenseRecord)=>{await saveWorkshop({...workshop,expenses:[expense,...(workshop.expenses||[])]});};
 const updateSupplierInvoice=async(invoice:WorkshopStore["supplierInvoices"][number])=>{return saveWorkshop({...workshop,supplierInvoices:workshop.supplierInvoices.map(x=>x.id===invoice.id?invoice:x)});};
 const updateOrderRecord=async(order:StoredOrder)=>saveWorkshop({...workshop,orders:workshop.orders.map(x=>x.id===order.id?order:x)});
 const addSupplierInvoice=async(invoice:WorkshopStore["supplierInvoices"][number])=>{const additions=invoice.lines.filter(line=>line.kind==="accessory"||(line.kind===undefined&&invoice.category==="accessory")).map(line=>{const key=line.label.trim().toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"accessoire-sans-nom";return {accessoryId:key,label:line.label.trim(),quantity:line.quantity};});await saveWorkshop({...workshop,supplierInvoices:[invoice,...workshop.supplierInvoices],accessoryPurchases:[...workshop.accessoryPurchases,...additions]});};
 const deliverDraft=async(d:Draft)=>{try{if(workshop.orders.some(o=>o.id===d.id)){alert("Cette commande existe déjà dans la liste des commandes.");return;}const base=orderFromDraft(d);const delivered=markOrderDelivered(base,d.customer);const next={...workshop,orders:[delivered,...workshop.orders]};const remaining=drafts.filter(x=>x.id!==d.id);if(!await persistCloudState(next,remaining))return;if(editingId===d.id)setEditingId(null);}catch(error){alert(error instanceof Error?error.message:"Erreur lors de la livraison.");}};
 const recordSelectedPayment=async(order:StoredOrder,amount:number,method:"Espèces"|"Virement"|"Chèque"|"Effet",details?:{reference:string;dueDate:string}):Promise<boolean>=>{try{const updated=addPayment(order,{id:crypto.randomUUID(),method,amount,status:"pending",...(details?{reference:details.reference,dueDate:details.dueDate}:{})});return await saveWorkshop({...workshop,orders:workshop.orders.map(o=>o.id===order.id?updated:o)});}catch(error){alert(error instanceof Error?error.message:"Erreur paiement.");return false;}};

 const confirmChequeRefund=async(order:StoredOrder,refundId:string)=>{try{const updated=confirmRefund(order,refundId);await saveWorkshop({...workshop,orders:workshop.orders.map(o=>o.id===order.id?updated:o)});}catch(error){alert(error instanceof Error?error.message:"Erreur de confirmation du remboursement.");}};
 const deleteDeliveredOrder=async(order:StoredOrder)=>{if(!window.confirm("Supprimer définitivement "+order.number+" ? Tous ses paiements, mouvements, avoirs et effets sur le stock seront supprimés du système."))return;await saveWorkshop({...workshop,orders:workshop.orders.filter(o=>o.id!==order.id)});};
 const settleAvoir=async(orderId:string,avoirId:string)=>{const order=workshop.orders.find(o=>o.id===orderId);if(!order)return;try{const updated=settleCustomerAvoir(order,avoirId);await saveWorkshop({...workshop,orders:workshop.orders.map(o=>o.id===orderId?updated:o)});}catch(error){alert(error instanceof Error?error.message:"Erreur Avoir client.");}};
 const updateGlass=(i:number,p:Partial<GlassLine>)=>setGlass(a=>a.map((x,n)=>n===i?{...x,...p}:x));
 const updateGlassGroupLabel=(groupId:string,label:string)=>setGlass(a=>a.map(x=>glassGroupKey(x)===groupId?{...x,label}:x));
 const addGlassGroup=()=>setGlass(a=>[...a,{label:"",widthMm:0,heightMm:0,quantity:1,pricePerM2:0,groupId:crypto.randomUUID()}]);
 const addGlassDimension=(group:{id:string;lines:GlassLine[]})=>{const first=group.lines[0];setGlass(a=>[...a,{label:first?.label||"",widthMm:0,heightMm:0,quantity:1,pricePerM2:first?.pricePerM2??0,groupId:group.id}]);};
 const removeGlassDimension=(group:{id:string;lines:GlassLine[]},index:number)=>{if(group.lines.length===1){setGlass(a=>a.filter(x=>glassGroupKey(x)!==group.id));setServices(a=>a.filter(x=>x.groupId!==group.id));}else{const target=group.lines[index];setGlass(a=>a.filter(x=>x!==target));}};
 const toggleGroupService=(groupId:string,name:string)=>setServices(a=>a.some(x=>x.groupId===groupId&&x.name===name)?a.filter(x=>!(x.groupId===groupId&&x.name===name)):[...a,{name,unit:serviceUnit(name),quantity:0,unitPrice:0,groupId}]);
 const updateService=(i:number,p:Partial<ServiceLine>)=>setServices(a=>a.map((x,n)=>n===i?{...x,...p,...(p.name!==undefined?{unit:serviceUnit(p.name)}:{})}:x));
 const updateAccessory=(i:number,p:Partial<AccessoryLine>)=>setAccessories(a=>a.map((x,n)=>n===i?{...x,...p}:x));
 if(!authReady)return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f4f6f8",color:"#263746",fontFamily:"Arial,sans-serif"}}>Chargement de l’espace administrateur…</main>;
 if(!isAdmin)return <AdminLogin onAuthenticated={()=>setIsAdmin(true)}/>;
 if(!cloudReady)return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f4f6f8",color:"#263746",fontFamily:"Arial,sans-serif",padding:24,textAlign:"center"}}>{cloudError||"Chargement des données partagées de Cairo Verre…"}</main>;
 return <main className="shell">
 <datalist id="devis-glass-catalog">{GLASS_CATALOG.map(name=><option key={name} value={name}/>)}</datalist><datalist id="devis-accessory-catalog">{ACCESSORY_CATALOG.map(name=><option key={name} value={name}/>)}</datalist>
 <aside className={collapsed?"sidebar collapsed":"sidebar"}><div className="brand"><div className="brand-mark">CV</div>{!collapsed&&<div><strong>CAIRO VERRE</strong><small>ATELIER · MEDIOUNA</small></div>}</div><button className="collapse" onClick={()=>setCollapsed(!collapsed)} aria-label="Réduire le menu"><PanelLeftClose size={17}/></button><div className="nav-caption">{!collapsed&&"ESPACE DE TRAVAIL"}</div>
 {nav.map(item=><button key={item.label} className={"nav-item "+(section===item.label?"active":"")} onClick={()=>setSection(item.label)} title={item.label}><item.icon size={18}/>{!collapsed&&<span>{item.label}</span>}</button>)}<div className="sidebar-bottom"><Settings size={17}/>{!collapsed&&<span>Paramètres</span>}</div></aside>
 <section className="workspace"><header className="topbar"><div><span className="eyebrow">CAIRO VERRE / ATELIER</span><h1>{section}</h1></div><div className="top-right"><span className="status-dot"/><span>{DEMO_MODE?"Mode test · données locales":"Session administrateur"}</span>{!DEMO_MODE&&<button className="add-btn" onClick={async()=>{await createSupabaseBrowserClient().auth.signOut();setIsAdmin(false);}}>Déconnexion</button>}<div className="avatar">CV</div></div></header>
 {section==="Calcul"?<div className="content"><div className="intro"><div><h2>{editingDeliveredId?"Modifier une commande livrée":editingId?"Modifier le brouillon":"Nouveau devis"}</h2><p>Composez une commande : vitrage, services et accessoires dans un seul calcul.</p></div><div className="intro-actions"><span className="draft-count">{drafts.length} brouillon(s)</span><button className="add-btn" onClick={()=>{setCustomer("");setGlass([]);setServices([]);setAccessories([]);setServiceWidth(0);setServiceHeight(0);setServicePieces(1);setEditingId(null);setEditingDeliveredId(null);setDeliveryDraftId(null);setInitialPaidAmount("");setInitialPaymentMethod("Espèces");setInitialChequeReference("");setInitialChequeDueDate("");setSaved(false);}}>+ Nouveau</button></div></div><div className="form-grid"><div className="main-column">
 <section className="panel"><div className="panel-heading"><div><span className="step">01</span><div><h3>Client</h3><p>Le client sera enregistré à la livraison.</p></div></div></div><input className="text-input" value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Nom du client (facultatif pour le brouillon)"/></section>
 <section className="panel"><div className="panel-heading"><div><span className="step">02</span><div><h3>Vitrage</h3><p>Ajoutez plusieurs dimensions par type de verre. Les services seront calculés séparément pour chaque type.</p></div></div><button className="add-btn" onClick={addGlassGroup}><Plus size={15}/> Ajouter autre type de verre</button></div>
 {glassGroups.length===0?<div className="empty-inline">Aucun vitrage ajouté. Vous pouvez aussi créer un devis avec services ou accessoires uniquement.</div>:glassGroups.map((group,groupIndex)=><div className="glass-type-group" key={group.id}>
  <div className="panel-heading"><div><span className="step">{String(groupIndex+1).padStart(2,"0")}</span><div><h3>Type de verre · {group.lines.length} dimension(s)</h3><p>Les services de ce groupe utilisent uniquement ses dimensions.</p></div></div><button className="add-btn" onClick={()=>addGlassDimension(group)}><Plus size={15}/> Ajouter une autre dimension</button></div>
  <input className="text-input item-name" list="devis-glass-catalog" placeholder="Rechercher le type de verre" value={group.lines[0]?.label||""} onChange={e=>updateGlassGroupLabel(group.id,e.target.value)}/>
  {group.lines.map((x,i)=><div className="line-row" key={group.id+"-"+i}><Field label="Largeur mm" value={x.widthMm} onChange={v=>updateGlass(i,{widthMm:v})}/><Field label="Hauteur mm" value={x.heightMm} onChange={v=>updateGlass(i,{heightMm:v})}/><Field label="Qté" value={x.quantity} onChange={v=>updateGlass(i,{quantity:v})}/><Field label="Prix / m² TTC" value={x.pricePerM2} onChange={v=>updateGlass(i,{pricePerM2:v})}/><strong className="line-total">{money(areaM2(x.widthMm,x.heightMm,x.quantity)*x.pricePerM2)}</strong><button className="icon-btn danger" aria-label="Supprimer dimension" onClick={()=>removeGlassDimension(group,i)}><Trash2 size={16}/></button></div>)}
  <div className="services-group"><div className="panel-heading"><div><h3>Services · {group.lines[0]?.label||"Type non renseigné"}</h3><p>Calcul automatique sur le total des dimensions de ce type de verre.</p></div><button className="add-btn" onClick={()=>setServices(a=>[...a,{name:"",unit:"m²",quantity:0,unitPrice:0,groupId:group.id}])}><Plus size={15}/> Autre service</button></div>
   <div className="service-grid">{[...LINEAR_SERVICES,...AREA_SERVICES].map(name=>{const selected=services.some(s=>s.groupId===group.id&&s.name===name);return <button key={group.id+name} className={"service-chip "+(selected?"selected":"")} onClick={()=>toggleGroupService(group.id,name)}>{name}<span>{selected?"Ajouté ✓":"+ Ajouter"} · {serviceUnit(name)}</span></button>})}</div>
   {services.map((x)=>({x,i:services.indexOf(x)})).filter(({x})=>x.groupId===group.id).map(({x,i})=>{const measured=measuredServices[i];return <div className="line-row service-row" key={group.id+"-"+i}><input className="text-input item-name" value={x.name} placeholder="Nom du service" onChange={e=>updateService(i,{name:e.target.value})}/><span className="unit-pill">{measured.unit}</span><strong className="line-total">{measured.quantity.toFixed(3)} {measured.unit}</strong><Field label="Prix unitaire TTC" value={x.unitPrice} onChange={v=>updateService(i,{unitPrice:v})}/><strong className="line-total">{money(measured.quantity*x.unitPrice)}</strong><button className="icon-btn danger" onClick={()=>setServices(a=>a.filter((_,n)=>n!==i))}><Trash2 size={16}/></button></div>})}
   {!services.some(s=>s.groupId===group.id)&&<div className="empty-inline">Sélectionnez les services de ce type de verre.</div>}
  </div>
 </div>)}
 </section>
 {(!glassGroups.length||services.some(s=>!s.groupId))&&<section className="panel"><div className="panel-heading"><div><span className="step">03</span><div><h3>Services généraux</h3><p>Pour les devis sans vitrage ou les services hérités des anciens brouillons.</p></div></div><button className="add-btn" onClick={()=>setServices(a=>[...a,{name:"",unit:"m²",quantity:serviceQuantity("",serviceWidth,serviceHeight,servicePieces),unitPrice:0,widthMm:serviceWidth,heightMm:serviceHeight,pieces:servicePieces}])}><Plus size={15}/> Autre service</button></div>
 <div className="line-row"><Field label="Largeur (mm)" value={serviceWidth} onChange={setServiceWidth}/><Field label="Hauteur (mm)" value={serviceHeight} onChange={setServiceHeight}/><Field label="Qté" value={servicePieces} onChange={setServicePieces}/></div>
 <div className="service-grid">{[...LINEAR_SERVICES,...AREA_SERVICES].map(name=>{const selected=services.some(s=>!s.groupId&&s.name===name);return <button key={"general-"+name} className={"service-chip "+(selected?"selected":"")} onClick={()=>setServices(a=>selected?a.filter(s=>s.groupId||s.name!==name):[...a,{name,unit:serviceUnit(name),quantity:serviceQuantity(name,serviceWidth,serviceHeight,servicePieces),unitPrice:0,widthMm:serviceWidth,heightMm:serviceHeight,pieces:servicePieces}])}>{name}<span>{selected?"Ajouté ✓":"+ Ajouter"} · {serviceUnit(name)}</span></button>})}</div>
 {services.map((x)=>({x,i:services.indexOf(x)})).filter(({x})=>!x.groupId).map(({x,i})=>{const measured=measuredServices[i];return <div className="line-row service-row" key={"general-"+i}><input className="text-input item-name" value={x.name} placeholder="Nom du service" onChange={e=>updateService(i,{name:e.target.value})}/><span className="unit-pill">{measured.unit}</span><strong className="line-total">{measured.quantity.toFixed(3)} {measured.unit}</strong><Field label="Prix unitaire TTC" value={x.unitPrice} onChange={v=>updateService(i,{unitPrice:v})}/><strong className="line-total">{money(measured.quantity*x.unitPrice)}</strong><button className="icon-btn danger" onClick={()=>setServices(a=>a.filter((_,n)=>n!==i))}><Trash2 size={16}/></button></div>})}
 {!services.some(s=>!s.groupId)&&<div className="empty-inline">Sélectionnez une prestation générale.</div>}</section>}
 <section className="panel"><div className="panel-heading"><div><span className="step">04</span><div><h3>Accessoires</h3><p>Quantités et prix TTC saisis pour cette commande.</p></div></div><button className="add-btn" onClick={()=>setAccessories(a=>[...a,{label:"",quantity:1,unitPrice:0}])}><Plus size={15}/> Ajouter accessoire</button></div>
 {accessories.length===0?<div className="empty-inline">Aucun accessoire ajouté.</div>:accessories.map((x,i)=><div className="line-row" key={i}><input className="text-input item-name" list="devis-accessory-catalog" placeholder="Rechercher un accessoire" value={x.label} onChange={e=>updateAccessory(i,{label:e.target.value})}/><Field label="Quantité" value={x.quantity} onChange={v=>updateAccessory(i,{quantity:v})}/><Field label="Prix unitaire TTC" value={x.unitPrice} onChange={v=>updateAccessory(i,{unitPrice:v})}/><strong className="line-total">{money(x.quantity*x.unitPrice)}</strong><button className="icon-btn danger" onClick={()=>setAccessories(a=>a.filter((_,n)=>n!==i))}><Trash2 size={16}/></button></div>)}</section></div>
 <aside className="summary-column"><div className="summary-card"><div className="summary-title"><div><span className="eyebrow">RÉCAPITULATIF</span><h3>Votre devis</h3></div><FileText size={20}/></div><div className="summary-line"><span>Vitrage</span><strong>{money(totals.glassTotal)}</strong></div><div className="summary-line"><span>Services</span><strong>{money(totals.serviceTotal)}</strong></div><div className="summary-line"><span>Accessoires</span><strong>{money(totals.accessoryTotal)}</strong></div><div className="summary-divider"/><div className="summary-line muted"><span>Total HT (TTC / 1,20)</span><strong>{money(totals.ht)}</strong></div><div className="summary-line muted"><span>TVA 20%</span><strong>{money(totals.tva)}</strong></div><div className="total-box"><span>Total TTC</span><strong>{money(totals.ttc)}</strong></div>
 {deliveryDraftId&&<div style={{display:"grid",gap:10,marginTop:14}}>
  <label className="field"><span>Montant payé par le client (DH)</span><input className="text-input" type="number" min="0" max={totals.ttc} step="0.01" value={initialPaidAmount} onChange={e=>setInitialPaidAmount(e.target.value)} placeholder="0"/></label>
  <label className="field"><span>Mode de paiement</span><select className="text-input" value={initialPaymentMethod} onChange={e=>setInitialPaymentMethod(e.target.value as typeof initialPaymentMethod)}><option>Espèces</option><option>Virement</option><option>Chèque</option><option>Effet</option></select></label>
  {(initialPaymentMethod==="Chèque"||initialPaymentMethod==="Effet")&&Number(initialPaidAmount)>0&&<><label className="field"><span>Numéro du {initialPaymentMethod==="Chèque"?"chèque":"effet"}</span><input className="text-input" value={initialChequeReference} onChange={e=>setInitialChequeReference(e.target.value)} placeholder="Référence"/></label><label className="field"><span>Date d’échéance</span><input className="text-input" type="date" value={initialChequeDueDate} onChange={e=>setInitialChequeDueDate(e.target.value)}/></label></>}
  <div className="summary-line"><span>Reste à payer</span><strong>{money(Math.max(0,totals.ttc-(Number(initialPaidAmount)||0)))}</strong></div>
 </div>}
 <button className="save-btn" onClick={persistDraft} disabled={!validQuote||(!!deliveryDraftId&&((initialPaidAmount.trim()!==""&&(!Number.isFinite(Number(initialPaidAmount))||Number(initialPaidAmount)<0||Number(initialPaidAmount)>totals.ttc+0.009))||((initialPaymentMethod==="Chèque"||initialPaymentMethod==="Effet")&&Number(initialPaidAmount)>0&&(!initialChequeReference.trim()||!initialChequeDueDate))))}><Save size={17}/> {editingDeliveredId?"Enregistrer les modifications de la commande livrée":editingId?"Mettre à jour le brouillon":"Enregistrer brouillon"}</button>{saved&&<div className="saved-note"><CheckCircle2 size={16}/> Brouillon enregistré sur cet appareil.</div>}<p className="local-note">Brouillon uniquement : aucun stock, paiement, solde client ou rapport n’est modifié.</p></div><div className="tip-card"><strong>À retenir</strong><p>Les calculs commerciaux sont TTC. Le HT et la TVA sont affichés uniquement dans le récapitulatif global.</p></div></aside></div></div>
 :<div className="content"><div className="intro"><div><h2>{section}</h2><p>Section en cours de construction selon les règles métier validées.</p></div></div>{section==="List commandes"?<>
 <div className="panel">
  <div className="panel-heading"><div><h3>Liste des commandes</h3><p>Toutes les commandes et tous les brouillons, classés par date de création.</p></div><span className="draft-count">{orderRows.length} commande(s)</span></div>
  <div className="form-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginBottom:14}}>
   <div className="order-filter-bar" role="group" aria-label="Filtrer les commandes">{([{value:"draft",label:"Brouillon"},{value:"delivered",label:"Livrée"},{value:"cancelled",label:"Annulée"},{value:"all",label:"Tous"}] as const).map(item=><button key={item.value} className={"order-filter "+item.value+(orderFilter===item.value?" active":"")} onClick={()=>{setOrderFilter(item.value);setOrderPage(1);}}>{item.label}</button>)}</div>
   <label className="field"><span>Recherche</span><input className="text-input" value={orderSearch} onChange={e=>{setOrderSearch(e.target.value);setOrderPage(1);}} placeholder="N° commande C#… ou client"/></label>
  </div>
  {visibleOrderRows.length?visibleOrderRows.map(row=>row.kind==="draft"?<div className="saved-draft" key={row.id}>
   <div><strong>{row.number} · {row.customer||"Client non renseigné"}</strong><span>Brouillon · {new Date(row.createdAt).toLocaleDateString("fr-FR")} · Total {money(row.total)}</span></div>
   <div className="draft-actions">
    <button className="add-btn" onClick={()=>{const d=row.draft;setCustomer(d.customer);setGlass(d.glass.map(x=>({...x})));setServices(d.services.map(x=>({...x,unit:serviceUnit(x.name)})));setServiceWidth(d.services[0]?.widthMm??d.glass[0]?.widthMm??0);setServiceHeight(d.services[0]?.heightMm??d.glass[0]?.heightMm??0);setServicePieces(d.services[0]?.pieces??d.glass[0]?.quantity??1);setAccessories(d.accessories.map(x=>({...x})));setEditingId(d.id);setSection("Calcul");}}>Modifier</button>
    <button className="add-btn" onClick={()=>printDraft(row.draft,"Devis")}>Devis</button><button className="add-btn" onClick={()=>printDraft(row.draft,"BP")}>BP</button><button className="add-btn" onClick={()=>printDraft(row.draft,"BL")}>BL</button><button className="add-btn" onClick={()=>printDraft(row.draft,"Facture")}>Facture</button>
    <button className="add-btn" disabled={!row.draft.customer.trim()} onClick={()=>{const d=row.draft;setCustomer(d.customer);setGlass(d.glass.map(x=>({...x})));setServices(d.services.map(x=>({...x})));setServiceWidth(d.services[0]?.widthMm??d.glass[0]?.widthMm??0);setServiceHeight(d.services[0]?.heightMm??d.glass[0]?.heightMm??0);setServicePieces(d.services[0]?.pieces??d.glass[0]?.quantity??1);setAccessories(d.accessories.map(x=>({...x})));setEditingId(d.id);setEditingDeliveredId(null);setDeliveryDraftId(d.id);setInitialPaidAmount("");setInitialPaymentMethod("Espèces");setInitialChequeReference("");setInitialChequeDueDate("");setSection("Calcul");}}>Confirmer</button>
    <button className="icon-btn danger" aria-label="Supprimer le brouillon" onClick={async()=>{const next=drafts.filter(x=>x.id!==row.id);if(!await persistCloudState(workshop,next))return;if(editingId===row.id)setEditingId(null);}}><Trash2 size={16}/></button>
   </div>
  </div>:<div className="saved-draft" key={row.id}>
   <div><strong>{row.number} · {row.customer}</strong><span>{row.status==="delivered"?"Validée":"Annulée"} · Total {money(row.total)} · Paiements confirmés {money(row.order.payments.filter(p=>p.status==="confirmed").reduce((sum,p)=>sum+p.amount,0))}</span><span>{row.order.payments.filter(p=>p.status==="pending").map(p=>p.method+" en attente : "+money(p.amount)).join(" · ")}</span><span>{row.order.refunds.filter(r=>r.status==="pending").map(r=>"Remboursement "+r.method+" en attente : "+money(r.amount)).join(" · ")}</span></div>
   <div className="draft-actions">{row.status==="delivered"&&<>{!row.order.payments.some(p=>p.method==="Chèque"||p.method==="Effet")&&<button className="add-btn" onClick={()=>{const o=row.order;setCustomer(o.customer);setGlass(o.lines.glass.map(line=>({...line})));setServices(o.lines.services.map(line=>({...line})));setServiceWidth(o.lines.services[0]?.widthMm??o.lines.glass[0]?.widthMm??0);setServiceHeight(o.lines.services[0]?.heightMm??o.lines.glass[0]?.heightMm??0);setServicePieces(o.lines.services[0]?.pieces??o.lines.glass[0]?.quantity??1);setAccessories(o.lines.accessories.map(line=>({...line})));setEditingDeliveredId(o.id);setEditingId(null);setSection("Calcul");}}>Modifier</button>}<button className="add-btn" onClick={()=>printDraft({number:row.number,customer:row.customer,glass:row.order.lines.glass,services:row.order.lines.services,accessories:row.order.lines.accessories,total:row.total},"Devis")}>Devis</button><button className="add-btn" onClick={()=>printDraft({number:row.number,customer:row.customer,glass:row.order.lines.glass,services:row.order.lines.services,accessories:row.order.lines.accessories,total:row.total},"BP")}>BP</button><button className="add-btn" onClick={()=>printDraft({number:row.number,customer:row.customer,glass:row.order.lines.glass,services:row.order.lines.services,accessories:row.order.lines.accessories,total:row.total},"BL")}>BL</button><button className="add-btn" onClick={()=>printDraft({number:row.number,customer:row.customer,glass:row.order.lines.glass,services:row.order.lines.services,accessories:row.order.lines.accessories,total:row.total},"Facture")}>Facture</button><button className="add-btn" onClick={()=>deleteDeliveredOrder(row.order)}>Supprimer définitivement</button></>}{row.status==="cancelled"&&<button className="add-btn" onClick={()=>deleteDeliveredOrder(row.order)}>Supprimer définitivement</button>}{row.order.refunds.filter(r=>(r.method==="Chèque"||r.method==="Effet")&&r.status==="pending").map(r=><button key={r.id} className="add-btn" onClick={()=>confirmChequeRefund(row.order,r.id)}>Confirmer remboursement chèque {money(r.amount)}</button>)}</div>
  </div>):<div className="empty-inline">{orderSearch?"Aucun résultat pour cette recherche.":orderFilter==="draft"?"Aucun brouillon enregistré.":"Aucune commande pour ce filtre."}</div>}
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginTop:16,flexWrap:"wrap"}}>
   <span className="local-note">Page {Math.min(orderPage,orderPageCount)} / {orderPageCount} · {filteredOrderRows.length} résultat(s) · 20 par page</span>
   <div className="draft-actions"><button className="add-btn" disabled={orderPage<=1} onClick={()=>setOrderPage(page=>Math.max(1,page-1))}>Précédent</button><button className="add-btn" disabled={orderPage>=orderPageCount} onClick={()=>setOrderPage(page=>Math.min(orderPageCount,page+1))}>Suivant</button></div>
  </div>
 </div>
 </>:section==="La caisse"?<><div className="panel caisse-tabs"><button className={"caisse-tab "+(caisseTab==="journal"?"active":"")} onClick={()=>setCaisseTab("journal")}>Journal de caisse</button><button className={"caisse-tab "+(caisseTab==="balances"?"active":"")} onClick={()=>setCaisseTab("balances")}>Soldes à régler</button></div>{caisseTab==="journal"?<><CaissePaymentPanel orders={workshop.orders} onRecordPayment={recordSelectedPayment}/><div className="panel"><div className="panel-heading"><div><h3>Journal de caisse</h3><p>Encaissements confirmés, règlements fournisseurs et sorties réelles.</p></div></div><div className="summary-line"><span>Total Entrée</span><strong className="amount-in">{money(cashMovements.filter(m=>m.direction==="Entrée").reduce((s,m)=>s+m.amount,0))}</strong></div><div className="summary-line"><span>Total Sortie</span><strong className="amount-out">{money(cashMovements.filter(m=>m.direction==="Sortie").reduce((s,m)=>s+m.amount,0))}</strong></div><div className="summary-line"><span>Solde net</span><strong className={cashMovements.reduce((s,m)=>s+(m.direction==="Entrée"?m.amount:-m.amount),0)<0?"amount-out":"amount-in"}>{money(cashMovements.reduce((s,m)=>s+(m.direction==="Entrée"?m.amount:-m.amount),0))}</strong></div><div className="summary-divider"/>{visibleCashMovements.length?visibleCashMovements.map((m,i)=><div className="saved-draft" key={m.orderId+"-"+i}><div><strong>{m.reference} · {m.counterparty||m.kind}</strong><span>{m.kind} · {m.method}{m.date?" · "+m.date:""}</span></div><strong className={m.direction==="Entrée"?"amount-in":"amount-out"}>{money(m.amount)}</strong></div>):<div className="empty-inline">Aucun mouvement confirmé dans la caisse.</div>}<div className="purchase-pagination"><span>Page {Math.min(cashPage,cashPageCount)} / {cashPageCount} · {cashMovements.length} opération(s) · 20 par page</span><div><button className="add-btn" disabled={cashPage<=1} onClick={()=>setCashPage(page=>Math.max(1,page-1))}>Précédent</button><button className="add-btn" disabled={cashPage>=cashPageCount} onClick={()=>setCashPage(page=>Math.min(cashPageCount,page+1))}>Suivant</button></div></div></div></>:<div className="panel"><div className="panel-heading"><div><h3>Soldes clients à régler</h3><p>Commandes livrées dont le montant encaissé confirmé reste inférieur au total.</p></div><span className="draft-count">{workshop.orders.filter(o=>o.status==="delivered"&&remainingConfirmed(o)>0.009).length} commande(s)</span></div>{workshop.orders.filter(o=>o.status==="delivered"&&remainingConfirmed(o)>0.009).length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{["Commande","Client","Date","Total TTC","Payé confirmé","Reste à régler"].map(x=><th key={x} style={{textAlign:["Commande","Client","Date"].includes(x)?"left":"right",padding:10}}>{x}</th>)}</tr></thead><tbody>{workshop.orders.filter(o=>o.status==="delivered"&&remainingConfirmed(o)>0.009).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(o=><tr key={o.id} style={{borderTop:"1px solid #e7ecee"}}><td style={{padding:10,fontWeight:700}}>{o.number}</td><td style={{padding:10}}>{o.customer}</td><td style={{padding:10}}>{o.createdAt.slice(0,10)}</td><td style={{padding:10,textAlign:"right"}}>{money(o.totalTTC)}</td><td style={{padding:10,textAlign:"right"}}>{money(o.payments.filter(p=>p.status==="confirmed").reduce((s,p)=>s+p.amount,0))}</td><td style={{padding:10,textAlign:"right",fontWeight:700,color:"#b84d45"}}>{money(remainingConfirmed(o))}</td></tr>)}</tbody></table></div>:<div className="empty-inline">Tous les soldes clients sont réglés.</div>}</div>}</>:section==="Journalier"?<JournalierPanel movements={ledger.cashMovements} scheduledMovements={scheduledChequeMovements} expenses={workshop.expenses||[]} employees={workshop.employees||[]} payrollWeeks={workshop.payrollWeeks||[]}/>:section==="Soldes & chèques"?<ChequesEffetsPanel orders={workshop.orders} invoices={workshop.supplierInvoices} onUpdateOrder={updateOrderRecord} onUpdateInvoice={updateSupplierInvoice}/>:section==="Personnel"?<PersonnelPanel employees={workshop.employees||[]} weeks={workshop.payrollWeeks||[]} onChange={(employees,weeks)=>saveWorkshop({...workshop,employees,payrollWeeks:weeks})}/>:section==="Dépense"?<ExpensesPanel expenses={workshop.expenses||[]} onAdd={addExpense}/>:section==="Stock"?<StockPanel purchases={workshop.accessoryPurchases} stock={ledger.stock} onAdd={addAccessoryPurchase} accessoryCatalog={ACCESSORY_CATALOG}/>:section==="Clients & fournisseurs"?<CustomersPanel customers={ledger.customers} orders={workshop.orders} onSettleAvoir={settleAvoir}/>:section==="Achat"?<PurchasesPanel invoices={workshop.supplierInvoices} onAdd={addSupplierInvoice} onUpdate={updateSupplierInvoice} glassCatalog={GLASS_CATALOG} accessoryCatalog={ACCESSORY_CATALOG}/>:<div className="panel placeholder"><div className="placeholder-icon"><Settings size={22}/></div><h3>Section planifiée</h3><p>La structure métier est définie. Cette page sera implémentée avec ses règles de gestion avant activation.</p></div>}</div>}
 </section></main>;
}
function printDraft(d:Pick<Draft,"number"|"customer"|"glass"|"services"|"accessories"|"total">,kind:"Devis"|"BP"|"BL"|"Facture"){const w=window.open("","_blank","width=900,height=700");if(!w){alert("Autorisez les fenêtres contextuelles pour imprimer.");return;}const esc=(s:string)=>s.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));const rows=[...d.glass.map(x=>({label:x.label||"Vitrage",detail:`${x.widthMm} × ${x.heightMm} mm · ${x.quantity} pièce(s)`,amount:areaM2(x.widthMm,x.heightMm,x.quantity)*x.pricePerM2})),...d.services.map(x=>({label:x.groupId?`${d.glass.find(g=>g.groupId===x.groupId)?.label||"Vitrage"} — ${x.name}`:x.name,detail:`${x.quantity} ${x.unit} × ${money(x.unitPrice)}`,amount:x.quantity*x.unitPrice})),...d.accessories.map(x=>({label:x.label||"Accessoire",detail:`${x.quantity} × ${money(x.unitPrice)}`,amount:x.quantity*x.unitPrice}))];const ht=d.total/1.2;w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${kind} ${esc(d.number)}</title><style>body{font:14px Arial,sans-serif;color:#17212b;padding:36px}header{display:flex;justify-content:space-between;border-bottom:2px solid #24384a;padding-bottom:18px}h1{font-size:24px;margin:0}small{color:#667}table{width:100%;border-collapse:collapse;margin-top:30px}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}th:last-child,td:last-child{text-align:right}.totals{margin:28px 0 0 auto;width:280px}.totals div{display:flex;justify-content:space-between;padding:6px}.grand{font-size:20px;font-weight:bold;border-top:2px solid #24384a}.foot{margin-top:50px;color:#667;font-size:12px}@media print{button{display:none}}</style></head><body><header><div><h1>CAIRO VERRE</h1><p>72, Lotissement Al Wiam, Rdc, Mediouna<br>ICE 002843449000049 · RC 507771</p></div><div><h1>${kind}</h1><p>Document ${esc(d.number)}<br>Date : ${new Date().toLocaleDateString("fr-FR")}<br>Client : ${esc(d.customer||"Non renseigné")}</p></div></header><table><thead><tr><th>Désignation</th><th>Détails</th><th>Montant TTC</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.label)}</td><td>${esc(x.detail)}</td><td>${money(x.amount)}</td></tr>`).join("")}</tbody></table><div class="totals"><div><span>Total HT</span><strong>${money(ht)}</strong></div><div><span>TVA 20%</span><strong>${money(d.total-ht)}</strong></div><div class="grand"><span>Total TTC</span><strong>${money(d.total)}</strong></div></div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();}
function Field({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void}){return <label className="field"><span>{label}</span><input type="number" min="0" step="any" value={value} onChange={e=>onChange(Math.max(0,Number(e.target.value)||0))}/></label>}
