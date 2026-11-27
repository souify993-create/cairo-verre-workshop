"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, ClipboardList, Users, Package, Wallet, FileText, Settings, Plus, Trash2, Save, CheckCircle2, Search, PanelLeftClose } from "lucide-react";
import { AccessoryLine, GlassLine, LINEAR_SERVICES, AREA_SERVICES, ServiceLine, quoteTotals, areaM2, serviceUnit, serviceQuantity, serviceQuantityForGlassLines, isValidQuote } from "@/lib/calculations";
import { decodeDraftStore, readDrafts, writeDrafts } from "@/lib/storage";
import { addPayment, confirmRefund, markOrderDelivered, orderFromDraft, reviseDeliveredOrder, settleCustomerAvoir } from "@/lib/workshop";
import { deriveLedger } from "@/lib/ledger";
import { decodeWorkshopStore, readWorkshopStore, writeWorkshopStore } from "@/lib/workshop-storage";
import type { StoredOrder } from "@/lib/workshop";
import type { WorkshopStore, CustomerRecord, IndependentInvoiceRecord } from "@/lib/workshop-storage";
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
import { loadCloudWorkshop, saveCloudWorkshop, saveCloudWorkshopMerge } from "@/lib/cloud-workshop";
import type { CloudWorkshopPayload } from "@/lib/cloud-workshop";
import { serializeWorkshopBackup } from "@/lib/backup";
import { IndependentInvoicePanel } from "@/components/independent-invoice-panel";
// Temporary workshop test mode: local demo data only; switch off after feature QA and before admin rollout.
const DEMO_MODE = false;
const nav=[{label:"Calcul",icon:Calculator},{label:"List commandes",icon:ClipboardList},{label:"La caisse",icon:Wallet},{label:"Journalier",icon:FileText},{label:"Chèque et effet",icon:ClipboardList},{label:"Clients & fournisseurs",icon:Users},{label:"Achat",icon:Package},{label:"Personnel",icon:Users},{label:"Stock",icon:Package},{label:"Dépense",icon:Wallet},{label:"Facture indépendante",icon:FileText}];
const money=(n:number)=>new Intl.NumberFormat("fr-MA",{style:"currency",currency:"MAD",maximumFractionDigits:2}).format(n);
function serviceCode(name:string){const key=name.trim().toLocaleUpperCase("fr");if(key==="RTC TOTAL")return {main:"REC",sub:"T"};if(key.startsWith("RCT "))return {main:"REC",sub:key.includes("1 FACE")?"1F":key.includes("2 FACE")?"2F":"3F"};if(key==="BISAUTAGE")return {main:"BIS",sub:""};if(key==="BP")return {main:"BP",sub:""};if(key.startsWith("VID "))return {main:"VID",sub:key.replace("VID ","")};if(key.startsWith("COULLAGE "))return {main:"COU",sub:key.replace("COULLAGE ","")};if(key.startsWith("ASSEMBLAGE "))return {main:"ASS",sub:key.replace("ASSEMBLAGE ","").slice(0,4)};if(key==="SABLAGE")return {main:"SAB",sub:""};if(key==="DESSIN")return {main:"DES",sub:""};return {main:key.slice(0,3),sub:""};}
const remainingConfirmed=(order:StoredOrder)=>Math.max(0,order.totalTTC-order.payments.filter(p=>p.status==="confirmed").reduce((sum,p)=>sum+p.amount,0)+order.refunds.filter(r=>r.status==="confirmed").reduce((sum,r)=>sum+r.amount,0));
function normalizeOrderNumbers(drafts: Draft[], orders: StoredOrder[]) {
 const entries=[...drafts.map(item=>({id:item.id,createdAt:item.createdAt,number:item.number})),...orders.map(item=>({id:item.id,createdAt:item.createdAt,number:item.number}))];
 const used=entries.map(item=>/^(?:C#|#C)(\d+)$/.exec(item.number)).filter(Boolean).map(match=>Number(match![1]));
 let next=Math.max(0,...used)+1;
 const numbers=new Map<string,string>();
 for(const item of [...entries].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))){
  const match=/^(?:C#|#C)(\d+)$/.exec(item.number);
  numbers.set(item.id,match?`#C${match[1]}`:`#C${next++}`);
 }
 const nextDrafts=drafts.map(item=>({...item,number:numbers.get(item.id)||item.number}));
 const nextOrders=orders.map(item=>({...item,number:numbers.get(item.id)||item.number}));
 return {drafts:nextDrafts,orders:nextOrders,changed:nextDrafts.some((item,i)=>item.number!==drafts[i].number)||nextOrders.some((item,i)=>item.number!==orders[i].number)};
}
function nextOrderNumber(drafts: Draft[], orders: StoredOrder[]) {
 const values=[...drafts,...orders].map(item=>Number(/^(?:C#|#C)(\d+)$/.exec(item.number)?.[1]||0));
 return `#C${Math.max(0,...values)+1}`;
}

export default function Home(){
 const [authReady,setAuthReady]=useState(DEMO_MODE),[isAdmin,setIsAdmin]=useState(DEMO_MODE);
 const [cloudReady,setCloudReady]=useState(false),[cloudError,setCloudError]=useState("");
 const cloudRevision=useRef(0);
 const cloudBase=useRef<CloudWorkshopPayload|null>(null);
 const [confirmation,setConfirmation]=useState<{title:string;message:string;confirmLabel:string;danger:boolean;kind:"confirm"|"info"|"success"|"warning"|"error"}|null>(null);
 const confirmationResolver=useRef<((value:boolean)=>void)|null>(null);
 const requestConfirmation=(message:string,title="Confirmer l’opération",confirmLabel="Confirmer",danger=false)=>new Promise<boolean>(resolve=>{confirmationResolver.current=resolve;setConfirmation({title,message,confirmLabel,danger,kind:"confirm"});});
  useEffect(()=>{const nativeAlert=window.alert;window.alert=(message?:string)=>{const value=String(message??"");const lower=value.toLocaleLowerCase("fr");const kind: "info"|"success"|"warning"|"error"=/(succès|réussi|enregistré|livrée|mis à jour|ajouté|confirmé|تم بنجاح|تم تعديل)/i.test(lower)?"success":/(erreur|impossible|échec|invalide|obligatoire|conflit|introuvable|ne peut pas|doit être)/i.test(lower)?"error":/(attention|choisissez|aucun|sélectionnez|réessayez|autorisez|existe déjà)/i.test(lower)?"warning":"info";const title=kind==="success"?"Opération réussie":kind==="error"?"Une erreur est survenue":kind==="warning"?"Vérification nécessaire":"Information";confirmationResolver.current?.(false);confirmationResolver.current=null;setConfirmation({title,message:value,confirmLabel:"Compris",danger:false,kind});};return()=>{window.alert=nativeAlert;};},[]);
 const [section,setSection]=useState("Calcul"),[collapsed,setCollapsed]=useState(false),[customer,setCustomer]=useState("");
 const [showNewCustomer,setShowNewCustomer]=useState(false),[newCustomerName,setNewCustomerName]=useState(""),[newCustomerPhone,setNewCustomerPhone]=useState("");
 const [glass,setGlass]=useState<GlassLine[]>([{label:"",widthMm:0,heightMm:0,quantity:1,pricePerM2:0,groupId:"default-glass-group"}]),[services,setServices]=useState<ServiceLine[]>([]),[accessories,setAccessories]=useState<AccessoryLine[]>([]);
 const [serviceWidth,setServiceWidth]=useState(0),[serviceHeight,setServiceHeight]=useState(0),[servicePieces,setServicePieces]=useState(1);
 const glassGroupKey=(line:GlassLine)=>line.groupId||"legacy:"+line.label.trim().toLocaleLowerCase("fr");
 const glassGroups=useMemo(()=>{const map=new Map<string,GlassLine[]>();glass.forEach(line=>{const key=glassGroupKey(line);map.set(key,[...(map.get(key)||[]),line]);});return [...map.entries()].map(([id,lines])=>({id,lines}));},[glass]);
 const measuredServices=useMemo(()=>services.map(s=>{const lines=s.groupId?glass.filter(line=>line.groupId===s.groupId):[];const quantity=s.groupId?serviceQuantityForGlassLines(s.name,lines):serviceQuantity(s.name,serviceWidth,serviceHeight,servicePieces);return {...s,unit:serviceUnit(s.name),widthMm:lines[0]?.widthMm??serviceWidth,heightMm:lines[0]?.heightMm??serviceHeight,pieces:lines.reduce((sum,line)=>sum+line.quantity,0)||servicePieces,quantity};}),[services,glass,serviceWidth,serviceHeight,servicePieces]);
 const [drafts,setDrafts]=useState<Draft[]>([]),[saved,setSaved]=useState(false),[editingId,setEditingId]=useState<string|null>(null);
 const [orderFilter,setOrderFilter]=useState<"all"|"draft"|"cancelled"|"delivered">("draft"),[orderPage,setOrderPage]=useState(1),[orderSearch,setOrderSearch]=useState("");
 const [cashPage,setCashPage]=useState(1),[caisseTab,setCaisseTab]=useState<"journal"|"balances">("balances");
 const [editingDeliveredId,setEditingDeliveredId]=useState<string|null>(null);
 const [paymentMethodDialog,setPaymentMethodDialog]=useState<{current:string;value:string}|null>(null);
 const paymentMethodResolver=useRef<((value:string|null)=>void)|null>(null);
 const requestPaymentMethod=(current:string)=>new Promise<string|null>(resolve=>{paymentMethodResolver.current=resolve;setPaymentMethodDialog({current,value:current==="Mixte"?"":current});});
 const [deliveryDraftId,setDeliveryDraftId]=useState<string|null>(null);
 const [deliveryConfirmationDraft,setDeliveryConfirmationDraft]=useState<Draft|null>(null);
 const [deliveryCustomer,setDeliveryCustomer]=useState("");
 const [deliveryCustomerSuggestionsOpen,setDeliveryCustomerSuggestionsOpen]=useState(false);
 const [deliveryPaidAmount,setDeliveryPaidAmount]=useState("");
 const [deliveryPaymentMethod,setDeliveryPaymentMethod]=useState<"Espèces"|"Virement"|"Chèque"|"Effet">("Espèces");
 const [deliveryChequeReference,setDeliveryChequeReference]=useState("");
 const [deliveryChequeDueDate,setDeliveryChequeDueDate]=useState("");
 const [deliverySaving,setDeliverySaving]=useState(false);
 const [initialPaidAmount,setInitialPaidAmount]=useState("");
 const [initialPaymentMethod,setInitialPaymentMethod]=useState<"Espèces"|"Virement"|"Chèque"|"Effet">("Espèces");
 const [initialChequeReference,setInitialChequeReference]=useState("");
 const [initialChequeDueDate,setInitialChequeDueDate]=useState("");
 const [workshop,setWorkshop]=useState<WorkshopStore>({version:1,orders:[],accessoryPurchases:[],supplierInvoices:[],expenses:[],employees:[],payrollWeeks:[],customers:[],independentInvoices:[]});
 const ledger=useMemo(()=>deriveLedger(workshop.orders,workshop.accessoryPurchases,workshop.supplierInvoices),[workshop]);
 const cashMovements=useMemo(()=>[...ledger.cashMovements,...derivePayrollCashMovements(workshop.payrollWeeks||[],workshop.employees||[])],[ledger,workshop.payrollWeeks,workshop.employees]);

 const printDocument=(d:Pick<Draft,"number"|"customer"|"glass"|"services"|"accessories"|"total">,kind:"Devis"|"BP"|"BL"|"Facture")=>printDraft(d,kind,workshop.customers?.find(c=>c.name.trim().toLocaleLowerCase("fr")===d.customer.trim().toLocaleLowerCase("fr"))?.ice);
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
 useEffect(()=>{const loadedDrafts=readDrafts();const stored=readWorkshopStore();const known=new Set(stored.accessoryPurchases.map(item=>item.accessoryId));const openingStock=ACCESSORY_CATALOG.filter(label=>!known.has(catalogKey(label))).map(label=>({id:crypto.randomUUID(),accessoryId:catalogKey(label),label,quantity:200}));const initialized={...stored,customers:stored.customers||[],independentInvoices:stored.independentInvoices||[],accessoryPurchases:[...stored.accessoryPurchases,...openingStock]};const numbered=normalizeOrderNumbers(loadedDrafts,initialized.orders);setDrafts(numbered.drafts);setWorkshop({...initialized,orders:numbered.orders});if(openingStock.length||numbered.changed)writeWorkshopStore({...initialized,orders:numbered.orders});if(numbered.changed)writeDrafts(numbered.drafts);},[]);
 useEffect(()=>{
  if(DEMO_MODE){setAuthReady(true);setIsAdmin(true);return;}
  const supabase=createSupabaseBrowserClient();
  let active=true;
  supabase.auth.getSession().then(({data})=>{
   if(!active)return;
   setIsAdmin(data.session?.user.app_metadata?.role==="admin" && data.session?.user.app_metadata?.application==="cairo-verre");
   setAuthReady(true);
  }).catch(()=>{if(active)setAuthReady(true);});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
   if(active)setIsAdmin(session?.user.app_metadata?.role==="admin" && session?.user.app_metadata?.application==="cairo-verre");
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
     const localStore=readWorkshopStore();const numbered=normalizeOrderNumbers(readDrafts(),localStore.orders);const localPurchases=localStore.accessoryPurchases.map(item=>({...item,id:item.id||crypto.randomUUID()}));const localPayload={...localStore,accessoryPurchases:localPurchases,orders:numbered.orders,drafts:numbered.drafts};
     try{
      const revision=await saveCloudWorkshop(supabase,localPayload,0);
      if(!active)return;
      cloudRevision.current=revision;
      cloudBase.current=localPayload;
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
    const normalizedWithNumbers={...normalized,orders:numbered.orders,independentInvoices:normalized.independentInvoices||[]};
    // Normalize legacy order numbers in memory only during startup.
    // Do not write shared state while opening the app: concurrent sessions can
    // otherwise race on the same revision and prevent the workspace from loading.
    cloudRevision.current=snapshot.revision;
    cloudBase.current={
     version:1,
     orders:Array.isArray(payload.orders)?payload.orders:[],
     accessoryPurchases:Array.isArray(payload.accessoryPurchases)?payload.accessoryPurchases:[],
     supplierInvoices:Array.isArray(payload.supplierInvoices)?payload.supplierInvoices:[],
     expenses:Array.isArray(payload.expenses)?payload.expenses:[],
     employees:Array.isArray(payload.employees)?payload.employees:[],
     payrollWeeks:Array.isArray(payload.payrollWeeks)?payload.payrollWeeks:[],
     customers:Array.isArray(payload.customers)?payload.customers:[],
     independentInvoices:Array.isArray(payload.independentInvoices)?payload.independentInvoices:[],
     drafts:Array.isArray(payload.drafts)?payload.drafts:[],
    } as CloudWorkshopPayload;
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
   const base=cloudBase.current;
   if(!base)throw new Error("La base de synchronisation n’est pas initialisée. Rechargez la page.");
   const proposed={...nextWorkshop,drafts:nextDrafts} as CloudWorkshopPayload;
   const saved=await saveCloudWorkshopMerge(createSupabaseBrowserClient(),base,proposed);
   // A slower response must never replace a newer snapshot already received
   // by this tab from another in-flight save.
   if(saved.revision>=cloudRevision.current){
    cloudRevision.current=saved.revision;
    cloudBase.current=saved.payload;
    const mergedWorkshop=decodeWorkshopStore(JSON.stringify(saved.payload));
    const mergedDrafts=decodeDraftStore(JSON.stringify(saved.payload.drafts));
    setWorkshop(mergedWorkshop);setDrafts(mergedDrafts);
    const workshopCached=writeWorkshopStore(mergedWorkshop),draftsCached=writeDrafts(mergedDrafts);
    if(!workshopCached||!draftsCached)alert("Enregistrement cloud réussi, mais la copie locale de secours n’a pas pu être actualisée.");
   }
   return true;
  }catch(error){
   const message=error instanceof Error?error.message:"Erreur de synchronisation.";
   if(message.includes("RECORD_CONFLICT")||message.includes("40001")){
    try{
     const latest=await loadCloudWorkshop(createSupabaseBrowserClient());
     if(latest){
      cloudRevision.current=latest.revision;
      cloudBase.current=latest.payload;
      const latestWorkshop=decodeWorkshopStore(JSON.stringify(latest.payload));
      const latestDrafts=decodeDraftStore(JSON.stringify(latest.payload.drafts));
      setWorkshop(latestWorkshop);setDrafts(latestDrafts);
      writeWorkshopStore(latestWorkshop);writeDrafts(latestDrafts);
     }
    }catch(refreshError){
     setCloudError(refreshError instanceof Error?refreshError.message:"Impossible de recharger la dernière version.");
    }
    alert("تم تحديث البيانات من الجهاز الآخر. هذا السجل بالذات تغيّر في نفس الوقت؛ راجع آخر نسخة ثم أعد العملية.");
   }else alert("Échec de l’enregistrement partagé : "+message);
   return false;
  }
 };
 const persistDraft=async()=>{
  if(!validQuote){alert("Complétez les désignations, dimensions et quantités avant d’enregistrer le devis.");return;}
  if(customer.trim()&&!customerNames.some(name=>customerKey(name)===customerKey(customer))){alert("Choisissez un client dans les résultats ou ajoutez-le avec le bouton +.");return;}
  if(editingDeliveredId){
   const original=workshop.orders.find(order=>order.id===editingDeliveredId);
   if(!original||original.status!=="delivered"){alert("Commande livrée introuvable.");return;}
   const currentMethods=[...new Set(original.payments.filter(payment=>payment.status!=="cancelled").map(payment=>payment.method))];
   let selectedMethod=currentMethods.length===1?currentMethods[0]:undefined;
   if(currentMethods.length>0){
    const entered=await requestPaymentMethod(currentMethods.length===1?currentMethods[0]:"Mixte");
    if(entered===null)return;
    const normalized=entered.trim();
    if(!["Espèces","Virement","Chèque"].includes(normalized)){alert("Mode de paiement invalide.");return;}
    selectedMethod=normalized as "Espèces"|"Virement"|"Chèque";
   }
   try{
    const updated=reviseDeliveredOrder(original,{customer, totalTTC:totals.ttc, lines:{glass,services:measuredServices,accessories}},selectedMethod);
    if(!await persistCloudState({...workshop,orders:workshop.orders.map(order=>order.id===original.id?updated:order)},drafts))return;
    setEditingDeliveredId(null);setEditingId(null);setCustomer("");setGlass([]);setServices([]);setAccessories([]);setSection("List commandes");
    alert("La commande livrée a été modifiée et le solde ainsi que le stock ont été mis à jour.");
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
 const saveIndependentInvoice=async(invoice:IndependentInvoiceRecord):Promise<boolean>=>{
  const current=workshop.independentInvoices||[];
  const exists=current.some(item=>item.id===invoice.id);
  const independentInvoices=exists?current.map(item=>item.id===invoice.id?invoice:item):[invoice,...current];
  return persistCloudState({...workshop,independentInvoices},drafts);
 };
 const downloadBackup=()=>{
  try{
   const json=serializeWorkshopBackup(workshop,drafts,cloudRevision.current);
   const blob=new Blob([json],{type:"application/json"});
   const url=URL.createObjectURL(blob);
   const link=document.createElement("a");
   link.href=url;
   link.download="cairo-verre-backup-"+new Date().toISOString().replace(/[:.]/g,"-")+".json";
   document.body.appendChild(link);
   link.click();
   link.remove();
   URL.revokeObjectURL(url);
  }catch(error){
   alert(error instanceof Error?"Impossible de créer la sauvegarde : "+error.message:"Impossible de créer la sauvegarde.");
  }
 };
 const customerKey=(name:string)=>name.trim().toLocaleLowerCase("fr").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/\\s+/g," ");
 const customerNames=[...new Map([...(workshop.customers||[]).map(x=>x.name),...ledger.customers.map(x=>x.customer),...drafts.map(x=>x.customer).filter(Boolean)].map(name=>[customerKey(name),name])).values()];
 const saveNewCustomer=async()=>{
  const name=newCustomerName.trim(),phone=newCustomerPhone.trim();
  if(!name){alert("Le nom du client est obligatoire.");return;}
  if(customerNames.some(existing=>customerKey(existing)===customerKey(name))){alert("Ce nom existe déjà. Recherchez le client au lieu de le créer une deuxième fois.");return;}
  const record:CustomerRecord={id:crypto.randomUUID(),name,phone};
  if(!await persistCloudState({...workshop,customers:[...(workshop.customers||[]),record]},drafts))return;
  setCustomer(name);setNewCustomerName("");setNewCustomerPhone("");setShowNewCustomer(false);
 };
 const updateCustomerRecord=async(updated:CustomerRecord)=>{
  const old=(workshop.customers||[]).find(x=>x.id===updated.id);
  const oldName=old?.name||(updated.id.startsWith("legacy:")?updated.id.slice(7):updated.name);
  if((workshop.customers||[]).some(x=>x.id!==updated.id&&customerKey(x.name)===customerKey(updated.name))){alert("Un client porte déjà ce nom.");return false;}
  if(customerNames.some(name=>customerKey(name)===customerKey(updated.name)&&customerKey(name)!==customerKey(oldName))){alert("Un client porte déjà ce nom.");return false;}
  const savedRecord={...updated,id:updated.id.startsWith("legacy:")?crypto.randomUUID():updated.id};
  const customers=[...(workshop.customers||[]).filter(x=>x.id!==updated.id),savedRecord];
  const orders=workshop.orders.map(o=>customerKey(o.customer)===customerKey(oldName)?{...o,customer:updated.name}:o);
  const nextDrafts=drafts.map(d=>customerKey(d.customer)===customerKey(oldName)?{...d,customer:updated.name}:d);
  return persistCloudState({...workshop,customers,orders},nextDrafts);
 };
 const addAccessoryPurchase=async(purchase:{accessoryId:string;label:string;quantity:number})=>{if(!Number.isFinite(purchase.quantity)||purchase.quantity<=0)return;await saveWorkshop({...workshop,accessoryPurchases:[...workshop.accessoryPurchases,{...purchase,id:crypto.randomUUID()}]});};
 const addExpense=async(expense:ExpenseRecord)=>{await saveWorkshop({...workshop,expenses:[expense,...(workshop.expenses||[])]});};
 const updateSupplierInvoice=async(invoice:WorkshopStore["supplierInvoices"][number])=>{return saveWorkshop({...workshop,supplierInvoices:workshop.supplierInvoices.map(x=>x.id===invoice.id?invoice:x)});};
 const updateOrderRecord=async(order:StoredOrder)=>saveWorkshop({...workshop,orders:workshop.orders.map(x=>x.id===order.id?order:x)});
 const addSupplierInvoice=async(invoice:WorkshopStore["supplierInvoices"][number])=>{const additions=invoice.lines.filter(line=>line.kind==="accessory"||(line.kind===undefined&&invoice.category==="accessory")).map(line=>{const key=line.label.trim().toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"accessoire-sans-nom";return {id:crypto.randomUUID(),accessoryId:key,label:line.label.trim(),quantity:line.quantity};});await saveWorkshop({...workshop,supplierInvoices:[invoice,...workshop.supplierInvoices],accessoryPurchases:[...workshop.accessoryPurchases,...additions]});};
 const openDeliveryConfirmation=(draft:Draft)=>{setDeliveryConfirmationDraft(draft);setDeliveryCustomer(draft.customer||"");setDeliveryCustomerSuggestionsOpen(!draft.customer.trim());setDeliveryPaidAmount("");setDeliveryPaymentMethod("Espèces");setDeliveryChequeReference("");setDeliveryChequeDueDate("");};
 const confirmDeliveryFromList=async()=>{
  const draft=deliveryConfirmationDraft;if(!draft||deliverySaving)return;
  const name=deliveryCustomer.trim();if(!name){alert("Le nom du client est obligatoire pour confirmer le devis.");return;}
  const amount=deliveryPaidAmount.trim()===""?0:Number(deliveryPaidAmount);
  if(!Number.isFinite(amount)||amount<0||amount>draft.total+0.009){alert("Le montant payé doit être compris entre 0 et le Total TTC.");return;}
  if((deliveryPaymentMethod==="Chèque"||deliveryPaymentMethod==="Effet")&&amount>0&&(!deliveryChequeReference.trim()||!deliveryChequeDueDate)){alert("Le numéro et la date d’échéance sont obligatoires pour un chèque ou un effet.");return;}
  if(workshop.orders.some(order=>order.id===draft.id)){alert("Cette commande existe déjà dans la liste des commandes.");return;}
  setDeliverySaving(true);
  try{
   let delivered=markOrderDelivered(orderFromDraft({...draft,customer:name}),name);
   if(amount>0)delivered=addPayment(delivered,{id:crypto.randomUUID(),method:deliveryPaymentMethod,amount,status:"pending",...(deliveryPaymentMethod==="Chèque"||deliveryPaymentMethod==="Effet"?{reference:deliveryChequeReference.trim(),dueDate:deliveryChequeDueDate}:{})});
   const nextOrders=[delivered,...workshop.orders];
   const nextDrafts=drafts.filter(item=>item.id!==draft.id);
   if(!await persistCloudState({...workshop,orders:nextOrders},nextDrafts))return;
   setDeliveryConfirmationDraft(null);
   alert("Commande confirmée et paiement initial enregistré avec succès.");
  }catch(error){alert(error instanceof Error?error.message:"Erreur lors de la confirmation du devis.");}
  finally{setDeliverySaving(false);}
 };
 const recordSelectedPayment=async(order:StoredOrder,amount:number,method:"Espèces"|"Virement"|"Chèque"|"Effet"|"Remise",details?:{reference:string;dueDate:string}):Promise<boolean>=>{try{const updated=addPayment(order,{id:crypto.randomUUID(),method,amount,status:"pending",...(details?{reference:details.reference,dueDate:details.dueDate}:{})});return await saveWorkshop({...workshop,orders:workshop.orders.map(o=>o.id===order.id?updated:o)});}catch(error){alert(error instanceof Error?error.message:"Erreur paiement.");return false;}};

 const confirmChequeRefund=async(order:StoredOrder,refundId:string)=>{try{const updated=confirmRefund(order,refundId);await saveWorkshop({...workshop,orders:workshop.orders.map(o=>o.id===order.id?updated:o)});}catch(error){alert(error instanceof Error?error.message:"Erreur de confirmation du remboursement.");}};
 const deleteDeliveredOrder=async(order:StoredOrder)=>{if(!await requestConfirmation("Supprimer définitivement "+order.number+" ? Tous ses paiements, mouvements et avoirs liés seront supprimés du système.","Suppression définitive","Supprimer",true))return;await saveWorkshop({...workshop,orders:workshop.orders.filter(o=>o.id!==order.id)});};
 const settleAvoir=async(orderId:string,avoirId:string)=>{const order=workshop.orders.find(o=>o.id===orderId);if(!order)return;try{const updated=settleCustomerAvoir(order,avoirId);await saveWorkshop({...workshop,orders:workshop.orders.map(o=>o.id===orderId?updated:o)});}catch(error){alert(error instanceof Error?error.message:"Erreur Avoir client.");}};
 const updateGlassLine=(line:GlassLine,p:Partial<GlassLine>)=>setGlass(a=>a.map(x=>x===line?{...x,...p}:x));
 const updateGlassGroupLabel=(groupId:string,label:string)=>setGlass(a=>a.map(x=>glassGroupKey(x)===groupId?{...x,label}:x));
 const addGlassGroup=()=>setGlass(a=>[...a,{label:"",widthMm:0,heightMm:0,quantity:1,pricePerM2:0,groupId:crypto.randomUUID()}]);
 const addGlassDimension=(group:{id:string;lines:GlassLine[]})=>{const first=group.lines[0];setGlass(a=>[...a,{label:first?.label||"",widthMm:0,heightMm:0,quantity:1,pricePerM2:first?.pricePerM2??0,groupId:group.id}]);};
 const addDimensionFromKeyboard=(group:{id:string;lines:GlassLine[]})=>{const nextIndex=group.lines.length;addGlassDimension(group);window.requestAnimationFrame(()=>document.getElementById("glass-width-"+group.id+"-"+nextIndex)?.focus());};
 const removeGlassDimension=(group:{id:string;lines:GlassLine[]},index:number)=>{if(group.lines.length===1){setGlass(a=>a.filter(x=>glassGroupKey(x)!==group.id));setServices(a=>a.filter(x=>x.groupId!==group.id));}else{const target=group.lines[index];setGlass(a=>a.filter(x=>x!==target));}};
 const toggleGroupService=(groupId:string,name:string)=>setServices(a=>a.some(x=>x.groupId===groupId&&x.name===name)?a.filter(x=>!(x.groupId===groupId&&x.name===name)):[...a,{name,unit:serviceUnit(name),quantity:0,unitPrice:0,groupId}]);
 const updateService=(i:number,p:Partial<ServiceLine>)=>setServices(a=>a.map((x,n)=>n===i?{...x,...p,...(p.name!==undefined?{unit:serviceUnit(p.name)}:{})}:x));
 const updateAccessory=(i:number,p:Partial<AccessoryLine>)=>setAccessories(a=>a.map((x,n)=>n===i?{...x,...p}:x));
 if(!authReady)return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f4f6f8",color:"#263746",fontFamily:"Arial,sans-serif"}}>Chargement de l’espace administrateur…</main>;
 if(!isAdmin)return <AdminLogin onAuthenticated={()=>setIsAdmin(true)}/>;
 if(!cloudReady)return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f4f6f8",color:"#263746",fontFamily:"Arial,sans-serif",padding:24,textAlign:"center"}}>{cloudError||"Chargement des données partagées de Cairo Verre…"}</main>;
 return <main className="shell">
 <datalist id="devis-glass-catalog">{GLASS_CATALOG.map(name=><option key={name} value={name}/>)}</datalist><datalist id="devis-accessory-catalog">{ACCESSORY_CATALOG.map(name=><option key={name} value={name}/>)}</datalist>
 <aside className={collapsed?"sidebar collapsed":"sidebar"}><div className="brand"><img className="brand-mark" src="/cairo-verre-logo.svg" alt="Cairo Verre"/>{!collapsed&&<div><strong>CAIRO VERRE</strong></div>}</div><button className="collapse" onClick={()=>setCollapsed(!collapsed)} aria-label="Réduire le menu"><PanelLeftClose size={17}/></button><div className="nav-caption">{!collapsed&&"ESPACE DE TRAVAIL"}</div>
 {nav.map(item=><button key={item.label} className={"nav-item "+(section===item.label?"active":"")} onClick={()=>setSection(item.label)} title={item.label}><item.icon size={18}/>{!collapsed&&<span>{item.label}</span>}</button>)}<div className="sidebar-bottom"><Settings size={17}/>{!collapsed&&<span>Paramètres</span>}</div></aside>
 <section className="workspace"><header className="topbar"><div>{section!=="Calcul"&&<span className="eyebrow">CAIRO VERRE / ATELIER</span>}<h1>{section}</h1></div><div className="top-right"><span className="status-dot"/><span>{DEMO_MODE?"Mode test · données locales":"Session administrateur"}</span>{!DEMO_MODE&&<button className="add-btn" onClick={async()=>{await createSupabaseBrowserClient().auth.signOut();setIsAdmin(false);}}>Déconnexion</button>}<div className="avatar">CV</div></div></header>
 {section==="Calcul"?<div className="content"><div className="intro"><div><h2>{editingDeliveredId?"Modifier une commande livrée":editingId?"Modifier le brouillon":"Nouveau devis"}</h2></div><div className="intro-actions"><span className="draft-count">{drafts.length} brouillon(s)</span><button className="add-btn" onClick={()=>{setCustomer("");setGlass([{label:"",widthMm:0,heightMm:0,quantity:1,pricePerM2:0,groupId:crypto.randomUUID()}]);setServices([]);setAccessories([]);setServiceWidth(0);setServiceHeight(0);setServicePieces(1);setEditingId(null);setEditingDeliveredId(null);setDeliveryDraftId(null);setInitialPaidAmount("");setInitialPaymentMethod("Espèces");setInitialChequeReference("");setInitialChequeDueDate("");setSaved(false);}}>+ Nouveau</button></div></div><div className="form-grid"><div className="main-column">
 <section className="panel"><div className="panel-heading"><h3>Client</h3></div>
  <div className="customer-search-row"><div className="customer-search-wrap"><input className="text-input" value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Rechercher le nom du client..."/>{customer.trim()&&customerNames.filter(name=>name.toLocaleLowerCase("fr").includes(customer.trim().toLocaleLowerCase("fr"))).length>0&&!customerNames.some(name=>customerKey(name)===customerKey(customer))&&<div className="customer-suggestions">{customerNames.filter(name=>name.toLocaleLowerCase("fr").includes(customer.trim().toLocaleLowerCase("fr"))).slice(0,6).map(name=><button type="button" key={name} onClick={()=>setCustomer(name)}>{name}</button>)}</div>}</div><button className="add-btn customer-add" onClick={()=>{setNewCustomerName(customer);setNewCustomerPhone("");setShowNewCustomer(v=>!v);}}><Plus size={14}/></button></div>
  {customer&&(workshop.customers||[]).find(x=>customerKey(x.name)===customerKey(customer))?.phone&&<div className="customer-selected-note">Téléphone : {(workshop.customers||[]).find(x=>customerKey(x.name)===customerKey(customer))?.phone}</div>}
  {showNewCustomer&&<div className="customer-edit-panel"><div className="customer-edit-grid customer-new-grid"><label>Nom du client<input className="text-input" value={newCustomerName} onChange={e=>setNewCustomerName(e.target.value)} autoFocus/></label><label>Téléphone<input className="text-input" value={newCustomerPhone} onChange={e=>setNewCustomerPhone(e.target.value)} inputMode="tel" placeholder="06..."/></label></div><div className="draft-actions"><button className="add-btn" onClick={()=>setShowNewCustomer(false)}>Annuler</button><button className="add-btn" onClick={saveNewCustomer}>Valider</button></div></div>}
 </section>
 <section className="panel"><div className="panel-heading"><h3>Vitrage</h3><button className="add-btn" onClick={addGlassGroup}><Plus size={15}/> Ajouter autre type de verre</button></div>
 {glassGroups.length===0?<div className="empty-inline">Aucun vitrage.</div>:glassGroups.map((group,groupIndex)=><div className="glass-type-group" key={group.id}>
  <div className="panel-heading"><h3>Type de verre · {group.lines.length} dimension(s)</h3><button className="add-btn" onClick={()=>addGlassDimension(group)}><Plus size={15}/> Ajouter une autre dimension</button></div>
  <input className="text-input item-name" list="devis-glass-catalog" placeholder="Rechercher le type de verre" value={group.lines[0]?.label||""} onChange={e=>updateGlassGroupLabel(group.id,e.target.value)}/>
  {group.lines.map((x,i)=><div className="line-row" key={group.id+"-"+i}><Field label="Largeur mm" value={x.widthMm} onChange={v=>updateGlassLine(x,{widthMm:v})} inputId={"glass-width-"+group.id+"-"+i} onEnter={()=>addDimensionFromKeyboard(group)}/><Field label="Hauteur mm" value={x.heightMm} onChange={v=>updateGlassLine(x,{heightMm:v})} onEnter={()=>addDimensionFromKeyboard(group)}/><Field label="Qté" value={x.quantity} onChange={v=>updateGlassLine(x,{quantity:v})} onEnter={()=>addDimensionFromKeyboard(group)}/><Field label="Prix / m² TTC" value={x.pricePerM2} onChange={v=>updateGlassLine(x,{pricePerM2:v})} onEnter={()=>addDimensionFromKeyboard(group)}/><strong className="line-total">{money(areaM2(x.widthMm,x.heightMm,x.quantity)*x.pricePerM2)}</strong><button className="icon-btn danger" aria-label="Supprimer dimension" onClick={()=>removeGlassDimension(group,i)}><Trash2 size={16}/></button></div>)}
  <div className="services-group"><div className="panel-heading"><h3>Services · {group.lines[0]?.label||"Type non renseigné"}</h3><button className="add-btn" onClick={()=>setServices(a=>[...a,{name:"",unit:"m²",quantity:0,unitPrice:0,groupId:group.id}])}><Plus size={15}/> Autre service</button></div>
   <div className="service-grid">{[...LINEAR_SERVICES,...AREA_SERVICES].map(name=>{const selected=services.some(x=>x.groupId===group.id&&x.name===name);const code=serviceCode(name);return <button type="button" key={group.id+name} className={"service-chip "+(selected?"selected":"")} onClick={()=>toggleGroupService(group.id,name)}><strong>{code.main}</strong>{code.sub&&<span>{code.sub}</span>}<small>{serviceUnit(name)}</small></button>})}</div>
   {services.map((x)=>({x,i:services.indexOf(x)})).filter(({x})=>x.groupId===group.id).map(({x,i})=>{const measured=measuredServices[i];return <div className="line-row service-row" key={group.id+"-"+i}>{LINEAR_SERVICES.includes(x.name as typeof LINEAR_SERVICES[number])||AREA_SERVICES.includes(x.name as typeof AREA_SERVICES[number])?<div className="service-code"><strong>{serviceCode(x.name).main}</strong>{serviceCode(x.name).sub&&<span>{serviceCode(x.name).sub}</span>}</div>:<input className="text-input service-custom-name" value={x.name} placeholder="Service" onChange={e=>updateService(i,{name:e.target.value})}/>}<input className="service-price-input" aria-label={"Prix unitaire TTC "+x.name} type="number" min="0" step="any" value={x.unitPrice} onFocus={e=>e.currentTarget.select()} onChange={e=>updateService(i,{unitPrice:Math.max(0,Number(e.target.value)||0)})}/><span className="unit-pill">{measured.unit}</span><strong className="line-total service-quantity">{measured.quantity.toFixed(3)} {measured.unit}</strong><strong className="line-total">{money(measured.quantity*x.unitPrice)}</strong><button className="icon-btn danger" aria-label="Supprimer service" onClick={()=>setServices(a=>a.filter((_,n)=>n!==i))}><Trash2 size={16}/></button></div>})}
   {!services.some(s=>s.groupId===group.id)&&<div className="empty-inline">Aucun service ajouté.</div>}
  </div>
 </div>)}
 </section>
 {(!glassGroups.length||services.some(s=>!s.groupId))&&<section className="panel"><div className="panel-heading"><h3>Services généraux</h3><button className="add-btn" onClick={()=>setServices(a=>[...a,{name:"",unit:"m²",quantity:serviceQuantity("",serviceWidth,serviceHeight,servicePieces),unitPrice:0,widthMm:serviceWidth,heightMm:serviceHeight,pieces:servicePieces}])}><Plus size={15}/> Autre service</button></div>
 <div className="line-row"><Field label="Largeur (mm)" value={serviceWidth} onChange={setServiceWidth}/><Field label="Hauteur (mm)" value={serviceHeight} onChange={setServiceHeight}/><Field label="Qté" value={servicePieces} onChange={setServicePieces}/></div>
 <div className="service-grid">{[...LINEAR_SERVICES,...AREA_SERVICES].map(name=>{const selected=services.some(x=>!x.groupId&&x.name===name);const code=serviceCode(name);return <button type="button" key={"general-"+name} className={"service-chip "+(selected?"selected":"")} onClick={()=>setServices(a=>selected?a.filter(x=>x.groupId||x.name!==name):[...a,{name,unit:serviceUnit(name),quantity:serviceQuantity(name,serviceWidth,serviceHeight,servicePieces),unitPrice:0,widthMm:serviceWidth,heightMm:serviceHeight,pieces:servicePieces}])}><strong>{code.main}</strong>{code.sub&&<span>{code.sub}</span>}<small>{serviceUnit(name)}</small></button>})}</div>
 {services.map((x)=>({x,i:services.indexOf(x)})).filter(({x})=>!x.groupId).map(({x,i})=>{const measured=measuredServices[i];return <div className="line-row service-row" key={"general-"+i}>{LINEAR_SERVICES.includes(x.name as typeof LINEAR_SERVICES[number])||AREA_SERVICES.includes(x.name as typeof AREA_SERVICES[number])?<div className="service-code"><strong>{serviceCode(x.name).main}</strong>{serviceCode(x.name).sub&&<span>{serviceCode(x.name).sub}</span>}</div>:<input className="text-input service-custom-name" value={x.name} placeholder="Service" onChange={e=>updateService(i,{name:e.target.value})}/>}<input className="service-price-input" aria-label={"Prix unitaire TTC "+x.name} type="number" min="0" step="any" value={x.unitPrice} onFocus={e=>e.currentTarget.select()} onChange={e=>updateService(i,{unitPrice:Math.max(0,Number(e.target.value)||0)})}/><span className="unit-pill">{measured.unit}</span><strong className="line-total service-quantity">{measured.quantity.toFixed(3)} {measured.unit}</strong><strong className="line-total">{money(measured.quantity*x.unitPrice)}</strong><button className="icon-btn danger" aria-label="Supprimer service" onClick={()=>setServices(a=>a.filter((_,n)=>n!==i))}><Trash2 size={16}/></button></div>})}
 {!services.some(s=>!s.groupId)&&<div className="empty-inline">Aucun service ajouté.</div>}</section>}
 <section className="panel"><div className="panel-heading"><h3>Accessoires</h3><button className="add-btn" onClick={()=>setAccessories(a=>[...a,{label:"",quantity:1,unitPrice:0}])}><Plus size={15}/> Ajouter accessoire</button></div>
 {accessories.length===0?<div className="empty-inline">Aucun accessoire.</div>:accessories.map((x,i)=><div className="line-row" key={i}><input className="text-input item-name" list="devis-accessory-catalog" placeholder="Rechercher un accessoire" value={x.label} onChange={e=>updateAccessory(i,{label:e.target.value})}/><Field label="Quantité" value={x.quantity} onChange={v=>updateAccessory(i,{quantity:v})}/><Field label="Prix unitaire TTC" value={x.unitPrice} onChange={v=>updateAccessory(i,{unitPrice:v})}/><strong className="line-total">{money(x.quantity*x.unitPrice)}</strong><button className="icon-btn danger" onClick={()=>setAccessories(a=>a.filter((_,n)=>n!==i))}><Trash2 size={16}/></button></div>)}</section></div>
 <aside className="summary-column"><div className="summary-card"><div className="summary-title"><div><span className="eyebrow">RÉCAPITULATIF</span><h3>Votre devis</h3></div><FileText size={20}/></div><div className="summary-line"><span>Vitrage</span><strong>{money(totals.glassTotal)}</strong></div><div className="summary-line"><span>Services</span><strong>{money(totals.serviceTotal)}</strong></div><div className="summary-line"><span>Accessoires</span><strong>{money(totals.accessoryTotal)}</strong></div><div className="summary-divider"/><div className="summary-line muted"><span>Total HT (TTC / 1,20)</span><strong>{money(totals.ht)}</strong></div><div className="summary-line muted"><span>TVA 20%</span><strong>{money(totals.tva)}</strong></div><div className="total-box"><span>Total TTC</span><strong>{money(totals.ttc)}</strong></div>
 {deliveryDraftId&&<div style={{display:"grid",gap:10,marginTop:14}}>
  <label className="field"><span>Montant payé par le client (DH)</span><input className="text-input" type="number" min="0" max={totals.ttc} step="0.01" value={initialPaidAmount} onChange={e=>setInitialPaidAmount(e.target.value)} placeholder="0"/></label>
  <label className="field"><span>Mode de paiement</span><select className="text-input" value={initialPaymentMethod} onChange={e=>setInitialPaymentMethod(e.target.value as typeof initialPaymentMethod)}><option>Espèces</option><option>Virement</option><option>Chèque</option><option>Effet</option></select></label>
  {(initialPaymentMethod==="Chèque"||initialPaymentMethod==="Effet")&&Number(initialPaidAmount)>0&&<><label className="field"><span>Numéro du {initialPaymentMethod==="Chèque"?"chèque":"effet"}</span><input className="text-input" value={initialChequeReference} onChange={e=>setInitialChequeReference(e.target.value)} placeholder="Référence"/></label><label className="field"><span>Date d’échéance</span><input className="text-input" type="date" value={initialChequeDueDate} onChange={e=>setInitialChequeDueDate(e.target.value)}/></label></>}
  <div className="summary-line"><span>Reste à payer</span><strong>{money(Math.max(0,totals.ttc-(Number(initialPaidAmount)||0)))}</strong></div>
 </div>}
 <button className="save-btn" onClick={persistDraft} disabled={!validQuote||(!!deliveryDraftId&&((initialPaidAmount.trim()!==""&&(!Number.isFinite(Number(initialPaidAmount))||Number(initialPaidAmount)<0||Number(initialPaidAmount)>totals.ttc+0.009))||((initialPaymentMethod==="Chèque"||initialPaymentMethod==="Effet")&&Number(initialPaidAmount)>0&&(!initialChequeReference.trim()||!initialChequeDueDate))))}><Save size={17}/> {deliveryDraftId?"Confirmer la commande":editingDeliveredId?"Enregistrer les modifications":editingId?"Mettre à jour le brouillon":"Enregistrer brouillon"}</button>{saved&&<div className="saved-note"><CheckCircle2 size={16}/> Brouillon enregistré.</div>}</div></aside></div></div>
 :<div className="content"><div className="intro"><div><h2>{section}</h2></div></div>{section==="List commandes"?<>
 <div className="panel">
  <div className="panel-heading"><div><h3>Liste des commandes</h3><p>Toutes les commandes et tous les brouillons, classés par date de création.</p></div><span className="draft-count">{orderRows.length} commande(s)</span></div>
  <div className="form-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginBottom:14}}>
   <div className="order-filter-bar" role="group" aria-label="Filtrer les commandes">{([{value:"draft",label:"Brouillon"},{value:"delivered",label:"Livrée"},{value:"all",label:"Tous"}] as const).map(item=><button key={item.value} className={"order-filter "+item.value+(orderFilter===item.value?" active":"")} onClick={()=>{setOrderFilter(item.value);setOrderPage(1);}}>{item.label}</button>)}</div>
   <label className="field"><span>Recherche</span><input className="text-input" value={orderSearch} onChange={e=>{setOrderSearch(e.target.value);setOrderPage(1);}} placeholder="N° commande #C… ou client"/></label>
  </div>
  {visibleOrderRows.length?visibleOrderRows.map(row=>row.kind==="draft"?<div className="saved-draft" key={row.id}>
   <div><strong>{row.number} · {row.customer||"Client non renseigné"}</strong><span>Brouillon · {new Date(row.createdAt).toLocaleDateString("fr-FR")} · Total {money(row.total)}</span></div>
   <div className="draft-actions">
    <button className="add-btn" onClick={()=>{const d=row.draft;setCustomer(d.customer);setGlass(d.glass.map(x=>({...x})));setServices(d.services.map(x=>({...x,unit:serviceUnit(x.name)})));setServiceWidth(d.services[0]?.widthMm??d.glass[0]?.widthMm??0);setServiceHeight(d.services[0]?.heightMm??d.glass[0]?.heightMm??0);setServicePieces(d.services[0]?.pieces??d.glass[0]?.quantity??1);setAccessories(d.accessories.map(x=>({...x})));setEditingId(d.id);setSection("Calcul");}}>Modifier</button>
    <button className="add-btn" onClick={()=>printDocument(row.draft,"Devis")}>Devis</button><button className="add-btn" onClick={()=>printDocument(row.draft,"BP")}>BP</button><button className="add-btn" onClick={()=>printDocument(row.draft,"BL")}>BL</button><button className="add-btn" onClick={()=>printDocument(row.draft,"Facture")}>Facture</button>
    <button className="add-btn" onClick={()=>openDeliveryConfirmation(row.draft)}>Confirmer</button>
    <button className="icon-btn danger" aria-label="Supprimer le brouillon" onClick={async()=>{const next=drafts.filter(x=>x.id!==row.id);if(!await persistCloudState(workshop,next))return;if(editingId===row.id)setEditingId(null);}}><Trash2 size={16}/></button>
   </div>
  </div>:<div className="saved-draft" key={row.id}>
   <div><strong>{row.number} · {row.customer}</strong><span>{row.status==="delivered"?"Validée":"Clôturée"} · Total {money(row.total)} · Paiements confirmés {money(row.order.payments.filter(p=>p.status==="confirmed").reduce((sum,p)=>sum+p.amount,0))}</span><span>{row.order.payments.filter(p=>p.status==="pending").map(p=>p.method+" en attente : "+money(p.amount)).join(" · ")}</span><span>{row.order.refunds.filter(r=>r.status==="pending").map(r=>"Remboursement "+r.method+" en attente : "+money(r.amount)).join(" · ")}</span></div>
   <div className="draft-actions">{row.status==="delivered"&&<>{!row.order.payments.some(p=>(p.method==="Chèque"||p.method==="Effet")&&p.status!=="cancelled")&&<button className="add-btn" onClick={()=>{const o=row.order;setCustomer(o.customer);setGlass(o.lines.glass.map(line=>({...line})));setServices(o.lines.services.map(line=>({...line})));setServiceWidth(o.lines.services[0]?.widthMm??o.lines.glass[0]?.widthMm??0);setServiceHeight(o.lines.services[0]?.heightMm??o.lines.glass[0]?.heightMm??0);setServicePieces(o.lines.services[0]?.pieces??o.lines.glass[0]?.quantity??1);setAccessories(o.lines.accessories.map(line=>({...line})));setEditingDeliveredId(o.id);setEditingId(null);setSection("Calcul");}}>Modifier</button>}<button className="add-btn" onClick={()=>printDocument({number:row.number,customer:row.customer,glass:row.order.lines.glass,services:row.order.lines.services,accessories:row.order.lines.accessories,total:row.total},"Devis")}>Devis</button><button className="add-btn" onClick={()=>printDocument({number:row.number,customer:row.customer,glass:row.order.lines.glass,services:row.order.lines.services,accessories:row.order.lines.accessories,total:row.total},"BP")}>BP</button><button className="add-btn" onClick={()=>printDocument({number:row.number,customer:row.customer,glass:row.order.lines.glass,services:row.order.lines.services,accessories:row.order.lines.accessories,total:row.total},"BL")}>BL</button><button className="add-btn" onClick={()=>printDocument({number:row.number,customer:row.customer,glass:row.order.lines.glass,services:row.order.lines.services,accessories:row.order.lines.accessories,total:row.total},"Facture")}>Facture</button><button className="add-btn" onClick={()=>deleteDeliveredOrder(row.order)}>Supprimer définitivement</button></>}{row.status==="cancelled"&&<button className="add-btn" onClick={()=>deleteDeliveredOrder(row.order)}>Supprimer définitivement</button>}{row.order.refunds.filter(r=>(r.method==="Chèque"||r.method==="Effet")&&r.status==="pending").map(r=><button key={r.id} className="add-btn" onClick={()=>confirmChequeRefund(row.order,r.id)}>Confirmer remboursement chèque {money(r.amount)}</button>)}</div>
  </div>):<div className="empty-inline">{orderSearch?"Aucun résultat pour cette recherche.":orderFilter==="draft"?"Aucun brouillon enregistré.":"Aucune commande pour ce filtre."}</div>}
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginTop:16,flexWrap:"wrap"}}>
   <span className="local-note">Page {Math.min(orderPage,orderPageCount)} / {orderPageCount} · {filteredOrderRows.length} résultat(s) · 20 par page</span>
   <div className="draft-actions"><button className="add-btn" disabled={orderPage<=1} onClick={()=>setOrderPage(page=>Math.max(1,page-1))}>Précédent</button><button className="add-btn" disabled={orderPage>=orderPageCount} onClick={()=>setOrderPage(page=>Math.min(orderPageCount,page+1))}>Suivant</button></div>
  </div>
 </div>
 </>:section==="La caisse"?<><div className="panel caisse-tabs"><button className={"caisse-tab "+(caisseTab==="balances"?"active":"")} onClick={()=>setCaisseTab("balances")}>Soldes à régler</button><button className={"caisse-tab "+(caisseTab==="journal"?"active":"")} onClick={()=>setCaisseTab("journal")}>Journal de caisse</button></div>{caisseTab==="journal"?<><div className="panel"><div className="panel-heading"><div><h3>Journal de caisse</h3><p>Encaissements confirmés, règlements fournisseurs et sorties réelles.</p></div></div><div className="summary-line"><span>Total Entrée</span><strong className="amount-in">{money(cashMovements.filter(m=>m.direction==="Entrée").reduce((s,m)=>s+m.amount,0))}</strong></div><div className="summary-line"><span>Total Sortie</span><strong className="amount-out">{money(cashMovements.filter(m=>m.direction==="Sortie").reduce((s,m)=>s+m.amount,0))}</strong></div><div className="summary-line"><span>Solde net</span><strong className={cashMovements.reduce((s,m)=>s+(m.direction==="Entrée"?m.amount:-m.amount),0)<0?"amount-out":"amount-in"}>{money(cashMovements.reduce((s,m)=>s+(m.direction==="Entrée"?m.amount:-m.amount),0))}</strong></div><div className="summary-divider"/>{visibleCashMovements.length?visibleCashMovements.map((m,i)=><div className="saved-draft" key={m.orderId+"-"+i}><div><strong>{m.reference} · {m.counterparty||m.kind}</strong><span>{m.kind} · {m.method}{m.date?" · "+m.date:""}</span></div><strong className={m.direction==="Entrée"?"amount-in":"amount-out"}>{money(m.amount)}</strong></div>):<div className="empty-inline">Aucun mouvement confirmé dans la caisse.</div>}<div className="purchase-pagination"><span>Page {Math.min(cashPage,cashPageCount)} / {cashPageCount} · {cashMovements.length} opération(s) · 20 par page</span><div><button className="add-btn" disabled={cashPage<=1} onClick={()=>setCashPage(page=>Math.max(1,page-1))}>Précédent</button><button className="add-btn" disabled={cashPage>=cashPageCount} onClick={()=>setCashPage(page=>Math.min(cashPageCount,page+1))}>Suivant</button></div></div></div></>:<><CaissePaymentPanel orders={workshop.orders} onRecordPayment={recordSelectedPayment}/><div className="panel outstanding-list-panel"><div className="panel-heading"><div><h3>Soldes clients à régler</h3><p>Commandes livrées dont le montant encaissé confirmé reste inférieur au total.</p></div><div className="draft-actions"><span className="draft-count">{workshop.orders.filter(o=>o.status==="delivered"&&remainingConfirmed(o)>0.009).length} commande(s)</span><button className="add-btn print-hide" onClick={()=>window.print()} disabled={!workshop.orders.some(o=>o.status==="delivered"&&remainingConfirmed(o)>0.009)}>Imprimer la liste</button></div></div>{workshop.orders.filter(o=>o.status==="delivered"&&remainingConfirmed(o)>0.009).length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{["Commande","Client","Date","Total TTC","Payé","Reste à régler"].map(x=><th key={x} style={{textAlign:["Commande","Client","Date"].includes(x)?"left":"right",padding:10}}>{x}</th>)}</tr></thead><tbody>{workshop.orders.filter(o=>o.status==="delivered"&&remainingConfirmed(o)>0.009).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(o=><tr key={o.id} style={{borderTop:"1px solid #e7ecee"}}><td style={{padding:10,fontWeight:700}}>{o.number}</td><td style={{padding:10}}>{o.customer}</td><td style={{padding:10}}>{o.createdAt.slice(0,10)}</td><td style={{padding:10,textAlign:"right"}}>{money(o.totalTTC)}</td><td style={{padding:10,textAlign:"right"}}>{money(o.payments.filter(p=>p.status==="confirmed").reduce((s,p)=>s+p.amount,0))}</td><td style={{padding:10,textAlign:"right",fontWeight:700,color:"#b84d45"}}>{money(remainingConfirmed(o))}</td></tr>)}</tbody></table></div>:<div className="empty-inline">Tous les soldes clients sont réglés.</div>}</div></>}</>:section==="Facture indépendante"?<IndependentInvoicePanel invoices={workshop.independentInvoices||[]} onSave={saveIndependentInvoice}/>:section==="Journalier"?<JournalierPanel movements={ledger.cashMovements} scheduledMovements={scheduledChequeMovements} expenses={workshop.expenses||[]} employees={workshop.employees||[]} payrollWeeks={workshop.payrollWeeks||[]}/>:section==="Chèque et effet"?<ChequesEffetsPanel orders={workshop.orders} invoices={workshop.supplierInvoices} onUpdateOrder={updateOrderRecord} onUpdateInvoice={updateSupplierInvoice}/>:section==="Personnel"?<PersonnelPanel employees={workshop.employees||[]} weeks={workshop.payrollWeeks||[]} onChange={(employees,weeks)=>saveWorkshop({...workshop,employees,payrollWeeks:weeks})}/>:section==="Dépense"?<ExpensesPanel expenses={workshop.expenses||[]} onAdd={addExpense}/>:section==="Stock"?<StockPanel purchases={workshop.accessoryPurchases} stock={ledger.stock} onAdd={addAccessoryPurchase} accessoryCatalog={ACCESSORY_CATALOG}/>:section==="Clients & fournisseurs"?<CustomersPanel customers={ledger.customers} orders={workshop.orders} customerRecords={workshop.customers||[]} onSettleAvoir={settleAvoir} onUpdateCustomer={updateCustomerRecord} invoices={workshop.supplierInvoices} onUpdateSupplierInvoice={updateSupplierInvoice}/>:section==="Achat"?<PurchasesPanel invoices={workshop.supplierInvoices} onAdd={addSupplierInvoice} onUpdate={updateSupplierInvoice} glassCatalog={GLASS_CATALOG} accessoryCatalog={ACCESSORY_CATALOG}/>:<div className="panel placeholder"><div className="placeholder-icon"><Settings size={22}/></div><h3>Section planifiée</h3></div>}</div>}
 {section==="Calcul"&&<button className="backup-fab" onClick={downloadBackup} title="Télécharger une copie de toutes les données de l’atelier au format JSON">Sauvegarder</button>}</section>{deliveryConfirmationDraft&&<div className="app-dialog-overlay" role="presentation" onClick={()=>{if(!deliverySaving)setDeliveryConfirmationDraft(null);}}><section className="app-dialog delivery-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delivery-confirm-title" onClick={e=>e.stopPropagation()}>
  <div className="app-dialog-icon success">✓</div><h3 id="delivery-confirm-title">Confirmer le devis · {deliveryConfirmationDraft.number}</h3>
  <p>Vérifiez le client et saisissez le règlement initial. Le devis sera confirmé sans retourner à la page Calcul.</p>
  {!deliveryConfirmationDraft.customer.trim()&&<div className="field delivery-customer-field"><span>Nom du client *</span><div className="delivery-customer-search"><input className="text-input" autoFocus value={deliveryCustomer} onFocus={()=>setDeliveryCustomerSuggestionsOpen(true)} onChange={e=>{setDeliveryCustomer(e.target.value);setDeliveryCustomerSuggestionsOpen(true);}} placeholder="Rechercher ou saisir un nom de client"/></div>{deliveryCustomerSuggestionsOpen&&<div className="customer-suggestions delivery-customer-suggestions">{customerNames.filter(name=>!deliveryCustomer.trim()||name.toLocaleLowerCase("fr").includes(deliveryCustomer.trim().toLocaleLowerCase("fr"))).slice(0,8).map(name=><button type="button" key={name} onMouseDown={e=>e.preventDefault()} onClick={()=>{setDeliveryCustomer(name);setDeliveryCustomerSuggestionsOpen(false);}}>{name}</button>)}{deliveryCustomer.trim()&&!customerNames.some(name=>customerKey(name)===customerKey(deliveryCustomer))&&<div className="customer-new-option">Nouveau client : <strong>{deliveryCustomer.trim()}</strong> (sera ajouté à la confirmation)</div>}{!customerNames.length&&!deliveryCustomer.trim()&&<div className="customer-new-option">Aucun client enregistré pour le moment.</div>}</div>}</div>}
  <div className="delivery-confirm-total"><span>Total TTC</span><strong>{money(deliveryConfirmationDraft.total)}</strong></div>
  <div className="delivery-confirm-fields">
   <label className="field"><span>Montant payé (DH)</span><input className="text-input" type="number" min="0" max={deliveryConfirmationDraft.total} step="0.01" value={deliveryPaidAmount} onChange={e=>setDeliveryPaidAmount(e.target.value)} placeholder="0"/></label>
   <label className="field"><span>Mode de paiement</span><select className="text-input" value={deliveryPaymentMethod} onChange={e=>setDeliveryPaymentMethod(e.target.value as typeof deliveryPaymentMethod)}><option>Espèces</option><option>Virement</option><option>Chèque</option><option>Effet</option></select></label>
   {(deliveryPaymentMethod==="Chèque"||deliveryPaymentMethod==="Effet")&&Number(deliveryPaidAmount)>0&&<><label className="field"><span>Numéro du {deliveryPaymentMethod==="Chèque"?"chèque":"effet"}</span><input className="text-input" value={deliveryChequeReference} onChange={e=>setDeliveryChequeReference(e.target.value)} placeholder="Référence obligatoire"/></label><label className="field"><span>Date d’échéance</span><input className="text-input" type="date" value={deliveryChequeDueDate} onChange={e=>setDeliveryChequeDueDate(e.target.value)}/></label></>}
  </div>
  <div className="delivery-confirm-total"><span>Reste à régler</span><strong>{money(Math.max(0,deliveryConfirmationDraft.total-(Number(deliveryPaidAmount)||0)))}</strong></div>
  <div className="app-dialog-actions"><button className="add-btn" disabled={deliverySaving} onClick={()=>setDeliveryConfirmationDraft(null)}>Annuler</button><button className="add-btn app-dialog-primary" disabled={deliverySaving||(!deliveryConfirmationDraft.customer.trim()&&!deliveryCustomer.trim())||(deliveryPaidAmount.trim()!==""&&(!Number.isFinite(Number(deliveryPaidAmount))||Number(deliveryPaidAmount)<0||Number(deliveryPaidAmount)>deliveryConfirmationDraft.total+0.009))||((deliveryPaymentMethod==="Chèque"||deliveryPaymentMethod==="Effet")&&Number(deliveryPaidAmount)>0&&(!deliveryChequeReference.trim()||!deliveryChequeDueDate))} onClick={confirmDeliveryFromList}>{deliverySaving?"Enregistrement…":"Confirmer la commande"}</button></div>
 </section></div>}{paymentMethodDialog&&<div className="app-dialog-overlay" role="presentation" onClick={()=>{paymentMethodResolver.current?.(null);paymentMethodResolver.current=null;setPaymentMethodDialog(null);}}><section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-method-title" onClick={e=>e.stopPropagation()}><div className="app-dialog-icon info">i</div><h3 id="payment-method-title">Modifier le mode de paiement</h3><p>Mode de paiement actuel : <strong>{paymentMethodDialog.current}</strong>. Conservez ce mode ou choisissez-en un autre.</p><label className="field"><span>Nouveau mode de paiement</span><select className="text-input" autoFocus value={paymentMethodDialog.value} onChange={e=>setPaymentMethodDialog(current=>current?{...current,value:e.target.value}:current)}><option value="" disabled>Choisir un mode de paiement</option><option value="Espèces">Espèces</option><option value="Virement">Virement</option><option value="Chèque">Chèque</option></select></label><div className="app-dialog-actions"><button className="add-btn" onClick={()=>{paymentMethodResolver.current?.(null);paymentMethodResolver.current=null;setPaymentMethodDialog(null);}}>Annuler</button><button className="add-btn app-dialog-primary" disabled={!paymentMethodDialog.value} onClick={()=>{paymentMethodResolver.current?.(paymentMethodDialog.value);paymentMethodResolver.current=null;setPaymentMethodDialog(null);}}>Valider</button></div></section></div>}{confirmation&&<div className="app-dialog-overlay" role="presentation" onClick={()=>{confirmationResolver.current?.(false);confirmationResolver.current=null;setConfirmation(null);}}><section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={e=>e.stopPropagation()}><div className={"app-dialog-icon "+confirmation.kind}>{confirmation.kind==="success"?"✓":confirmation.kind==="error"?"!":confirmation.kind==="warning"?"!":confirmation.danger?"!":"i"}</div><h3 id="confirm-title">{confirmation.title}</h3><p>{confirmation.message}</p><div className="app-dialog-actions">{confirmation.kind==="confirm"&&<button className="add-btn" onClick={()=>{confirmationResolver.current?.(false);confirmationResolver.current=null;setConfirmation(null);}}>Annuler</button>}<button className={"add-btn app-dialog-primary "+(confirmation.danger?"danger":"")} onClick={()=>{confirmationResolver.current?.(true);confirmationResolver.current=null;setConfirmation(null);}}>{confirmation.confirmLabel}</button></div></section></div>}</main>;
}
function printDraft(d:Pick<Draft,"number"|"customer"|"glass"|"services"|"accessories"|"total">,kind:"Devis"|"BP"|"BL"|"Facture",customerICE?:string){
 const w=window.open("","_blank","width=900,height=700");
 if(!w){alert("Autorisez les fenêtres contextuelles pour ouvrir l'impression.");return;}
 const esc=(s:string)=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));
 const date=new Date().toLocaleDateString("fr-FR");
 const formatM=(mm:number)=>(mm/1000).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2});
 const formatArea=(m2:number)=>m2.toLocaleString("fr-FR",{minimumFractionDigits:3,maximumFractionDigits:3});
 const serviceShort=(name:string)=>{const k=name.trim().toLocaleUpperCase("fr");if(k==="RTC TOTAL")return "REC T";if(k.startsWith("RCT "))return "REC "+(k.includes("1 FACE")?"1F":k.includes("2 FACE")?"2F":"3F");if(k==="BISAUTAGE")return "BIS";if(k==="BP")return "BP";if(k.startsWith("VID "))return k;if(k.startsWith("COULLAGE "))return "COU "+k.slice(9);if(k.startsWith("ASSEMBLAGE "))return "ASS "+k.slice(11);return k.slice(0,3);};
 const areas=d.glass.map(g=>areaM2(g.widthMm,g.heightMm,g.quantity));
 const totalArea=areas.reduce((a,b)=>a+b,0);
 const serviceRows=d.services.map(s=>({s,label:(s.groupId?(d.glass.find(g=>g.groupId===s.groupId)?.label||"Vitrage")+" — ":"")+s.name,amount:s.quantity*s.unitPrice}));
 const accessoryRows=d.accessories.map(a=>({a,amount:a.quantity*a.unitPrice}));
 const logo='<img class="logo" src="'+window.location.origin+'/cairo-verre-logo.svg" alt="Cairo Verre">';
 const company='<div class="company"><strong>CAIRO VERRE</strong><span>VITRERIE · MIROITERIE</span><small>72, Lotissement Al Wiam, Rdc - Mediouna<br>ICE : 002843449000049 · RC : 507771</small></div>';
 const styles='*{box-sizing:border-box}body{font:9pt Arial,sans-serif;color:#17324f;margin:0;background:#fff}.page{width:148mm;min-height:205mm;margin:0 auto;padding:5mm 6mm}.head{display:flex;align-items:center;justify-content:space-between;gap:8mm;border-bottom:2px solid #2563a6;padding-bottom:3mm}.brand{display:flex;align-items:center;gap:3mm}.logo{width:17mm;height:17mm;flex:none}.company{display:flex;flex-direction:column;gap:1mm}.company strong{font-size:16pt;letter-spacing:1px;color:#174b80}.company span{font-size:6.5pt;letter-spacing:.7px;color:#367bb7;font-weight:bold}.company small{font-size:7pt;color:#536b82}.doc-title{text-align:right}.doc-title h1{font-size:19pt;margin:0;color:#174b80}.doc-title strong{font-size:11pt}.meta{display:grid;grid-template-columns:1fr 1fr;gap:2mm 4mm;margin:3mm 0;padding:2.5mm;background:#eef5fc;border:1px solid #d6e6f6;border-radius:1mm}.meta div{font-size:8pt}.meta label{display:block;color:#71839a;font-size:6.5pt;margin-bottom:.5mm}.section-title{font-size:8pt;color:#174b80;font-weight:bold;border-bottom:1px solid #b9d2ed;padding-bottom:1mm;margin:3mm 0 1.5mm}.glass-card{border:1px solid #d7e4f1;border-radius:1mm;margin:1.5mm 0;padding:1.5mm;break-inside:avoid}.glass-title{font-weight:bold;color:#174b80;font-size:9pt;margin-bottom:1mm}.table{width:100%;border-collapse:collapse;font-size:7.5pt;margin-top:1mm}.table th{background:#eaf3fc;color:#174b80}.table th,.table td{border:1px solid #cbd9e7;padding:1.4mm;text-align:left}.num{text-align:right!important}.code-list{display:flex;gap:1mm;flex-wrap:wrap;margin-top:1mm}.code{background:#edf5fd;border:1px solid #d0e3f6;color:#174b80;padding:.6mm 1.2mm;border-radius:1mm;font-size:7pt;font-weight:bold}.total-area{margin-top:2mm;text-align:right;padding:1.5mm;background:#eef5fc;border:1px solid #d6e6f6;font-size:8pt}.total-area strong{color:#174b80}.financial{margin:3mm 0 0 auto;width:72mm;border:1px solid #d7e4f1;padding:1.5mm}.financial div{display:flex;justify-content:space-between;padding:1mm;font-size:8pt}.financial .grand{border-top:2px solid #2563a6;color:#174b80;font-size:10pt;font-weight:bold}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:14mm;margin-top:12mm}.signature{border-top:1px solid #71839a;padding-top:2mm;font-size:8pt;min-height:15mm}.blank{border-bottom:1px dotted #9aabc0;display:inline-block;min-width:50mm;height:5mm}.foot{margin-top:4mm;padding-top:1.5mm;border-top:1px solid #d7e4f1;color:#71839a;font-size:6.5pt;text-align:center}@media print{.page{margin:0;min-height:210mm;page-break-after:always}.page:last-child{page-break-after:auto}}';
 let body="";
 if(kind==="BP"){
  const groups=new Map<string,typeof d.glass>();
  d.glass.forEach(g=>{const key=g.groupId||("legacy:"+g.label.trim().toLocaleLowerCase("fr"));groups.set(key,[...(groups.get(key)||[]),g]);});
  let grouped="";
  for(const [key,items] of groups){
   const linked=d.services.filter(s=>s.groupId&&s.groupId===key);
   const first=items[0];
   const serviceCodes=linked.map(s=>serviceShort(s.name));
   const heading=(first.label||"Vitrage")+(serviceCodes.length?" + "+serviceCodes.join(" + "):"");
   const dimensionRows=items.map(g=>'<tr><td>'+formatM(g.heightMm)+'L × '+formatM(g.widthMm)+'H</td><td class="num">'+g.quantity+'</td><td class="num">'+formatArea(areaM2(g.widthMm,g.heightMm,g.quantity))+'</td></tr>').join("");;
   grouped+='<section class="glass-card"><div class="glass-title">'+esc(heading)+'</div><table class="table"><thead><tr><th>Dimensions (m)</th><th class="num">Qté</th><th class="num">Surface (m²)</th></tr></thead><tbody>'+dimensionRows+'</tbody></table></section>';
  }
  const general=d.services.filter(s=>!s.groupId);
  const generalCodes=general.map(s=>serviceShort(s.name));
  const accessories=accessoryRows.length?'<div class="section-title">ACCESSOIRES À PRÉPARER</div><table class="table"><thead><tr><th>Accessoire</th><th class="num">Quantité</th></tr></thead><tbody>'+accessoryRows.map(x=>'<tr><td>'+esc(x.a.label||"Accessoire")+'</td><td class="num">'+x.a.quantity+'</td></tr>').join("")+'</tbody></table>':"";
  body='<div class="page"><header class="bp-head"><div><strong style="font-size:17pt;color:#174b80">BP</strong><span style="margin-left:3mm;font-size:10pt;font-weight:bold">'+esc(d.number)+'</span></div><div style="font-size:8pt;text-align:right">'+date+'<br><strong>'+esc(d.customer||"Non renseigné")+'</strong></div></header><div class="section-title">VITRAGES ET DIMENSIONS À PRÉPARER</div>'+(grouped||'<p>Aucun vitrage à préparer.</p>')+(generalCodes.length?'<div class="section-title">SERVICES GÉNÉRAUX · '+esc(generalCodes.join(" · "))+'</div>':"")+accessories+'<div class="total-area">Surface totale du vitrage : <strong>'+formatArea(totalArea)+' m²</strong></div></div>';
 }else{
  const rows=[
   ...d.glass.map((g,i)=>({label:g.label||"Vitrage",dimension:formatM(g.widthMm)+" × "+formatM(g.heightMm)+" m",quantity:String(g.quantity),unit:"m²",unitPrice:money(g.pricePerM2),amount:areas[i]*g.pricePerM2})),
   ...serviceRows.map(x=>({label:x.label,dimension:"—",quantity:x.s.quantity.toLocaleString("fr-FR",{maximumFractionDigits:3}),unit:x.s.unit,unitPrice:money(x.s.unitPrice),amount:x.amount})),
   ...accessoryRows.map(x=>({label:x.a.label||"Accessoire",dimension:"—",quantity:String(x.a.quantity),unit:"unité",unitPrice:money(x.a.unitPrice),amount:x.amount}))
  ];
  const ht=d.total/1.2;
  const customerIceBlock=kind==="Facture"&&customerICE?.trim()?'<div><label>ICE CLIENT</label><strong>'+esc(customerICE.trim())+'</strong></div>':"";
  const customerMeta='<div class="meta"><div><label>CLIENT</label><strong>'+esc(d.customer||"Non renseigné")+'</strong></div><div><label>DATE</label><strong>'+date+'</strong></div>'+customerIceBlock+'</div>';
  const table='<table class="table"><thead><tr><th>Désignation</th><th>Dimensions (m)</th><th class="num">Qté</th><th class="num">Prix unitaire</th><th class="num">Montant</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(x.label)+'</td><td>'+esc(x.dimension)+'</td><td class="num">'+esc(x.quantity)+' '+esc(x.unit)+'</td><td class="num">'+esc(x.unitPrice)+'</td><td class="num">'+money(x.amount)+'</td></tr>').join("")+'</tbody></table>';
  if(kind==="BL"){
   body='<div class="page"><header class="head"><div class="brand">'+logo+company+'</div><div class="doc-title"><h1>BON DE LIVRAISON</h1><strong>'+esc(d.number)+'</strong></div></header>'+customerMeta+'<div class="section-title">DÉTAIL DES ARTICLES LIVRÉS</div>'+table+'<div class="financial"><div><span>Total</span><strong>'+money(d.total)+'</strong></div></div><div class="signatures"><div class="signature">Signature et cachet Cairo Verre</div><div class="signature">Nom, signature et cachet du réceptionnaire</div></div><div class="foot">Cairo Verre · Bon de livraison · '+esc(d.number)+'</div></div>';
  }else{
   body='<div class="page"><header class="head"><div class="brand">'+logo+company+'</div><div class="doc-title"><h1>'+kind.toUpperCase()+'</h1><strong>'+esc(d.number)+'</strong></div></header>'+customerMeta+table+'<div class="financial"><div><span>Total HT</span><strong>'+money(ht)+'</strong></div><div><span>TVA 20%</span><strong>'+money(d.total-ht)+'</strong></div><div class="grand"><span>Total TTC</span><strong>'+money(d.total)+'</strong></div></div></div>';
  }
 }
 const pageStyle=kind==="Facture"?"@page{size:A4 portrait;margin:0}.page{width:198mm;min-height:287mm;padding:10mm 12mm}":"@page{size:A5 portrait;margin:0}";
 const bpStyles=kind==="BP"?'.bp-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2563a6;padding-bottom:3mm;margin-bottom:3mm}.bp-head>div{line-height:1.5}':"";
 w.document.open();
 w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>'+kind+' '+esc(d.number)+'</title><style>'+styles+pageStyle+bpStyles+'</style></head><body>'+body+'</body></html>');
 w.document.close();
 w.focus();
 window.setTimeout(()=>{try{w.print();}catch{alert("La fenêtre d'impression n'a pas pu s'ouvrir. Utilisez Imprimer depuis le navigateur.");}},400);
}
function Field({label,value,onChange,onEnter,inputId}:{label:string;value:number;onChange:(v:number)=>void;onEnter?:()=>void;inputId?:string}){return <label className="field"><span>{label}</span><input id={inputId} type="number" min="0" step="any" value={value} onFocus={e=>e.currentTarget.select()} onChange={e=>onChange(Math.max(0,Number(e.target.value)||0))} onKeyDown={e=>{if(e.key==="Enter"&&onEnter){e.preventDefault();onEnter();}}}/></label>}
