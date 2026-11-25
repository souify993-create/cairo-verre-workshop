import type { AccessoryPurchase, PaymentMethod } from "./ledger";
import type { StoredOrder } from "./workshop";
import type { ExpenseRecord } from "./operations";
import type { Employee, PayrollWeek } from "./payroll";

export type PurchaseLine = { label: string; quantity: number; unitPrice: number; widthMm?: number; heightMm?: number };
export type SupplierPayment = { id: string; date: string; amount: number; method: PaymentMethod; status?: "pending" | "confirmed" | "cancelled"; reference?: string; dueDate?: string };
export type SupplierInvoice = {
  id: string; supplier: string; invoiceNumber: string; date: string;
  category: "glass" | "accessory"; lines: PurchaseLine[];
  totalHT: number; totalTVA: number; totalTTC: number;
  paidAmount: number; paymentMethod: PaymentMethod | "Non réglé";
  chequeNumber?: string; chequeDate?: string; paidDate?: string; payments?: SupplierPayment[];
};
export type WorkshopStore = { version: 1; orders: StoredOrder[]; accessoryPurchases: AccessoryPurchase[]; supplierInvoices: SupplierInvoice[]; expenses: ExpenseRecord[]; employees: Employee[]; payrollWeeks: PayrollWeek[] };
export const WORKSHOP_STORAGE_KEY = "cairo-verre-workshop-data";
export const supplierInvoicePaid = (invoice: SupplierInvoice): number => invoice.paidAmount + (invoice.payments || []).filter(payment => payment.status === "confirmed" || payment.status === "pending" || (!payment.status && payment.method !== "Chèque" && payment.method !== "Effet")).reduce((sum, payment) => sum + payment.amount, 0);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const amount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const methods: PaymentMethod[] = ["Espèces", "Virement", "Chèque", "Effet"];
function validOrder(v: unknown): v is StoredOrder {
 if (!isRecord(v)||!text(v.id)||!text(v.number)||!text(v.customer)||!["draft","delivered","cancelled"].includes(String(v.status))||!amount(v.totalTTC)||!text(v.createdAt)||!text(v.updatedAt)||!Array.isArray(v.accessories)||!Array.isArray(v.payments)||!Array.isArray(v.refunds)||(v.avoirs!==undefined&&!Array.isArray(v.avoirs))||!isRecord(v.lines)||!Array.isArray(v.lines.glass)||!Array.isArray(v.lines.services)||!Array.isArray(v.lines.accessories)) return false;
 const uses=v.accessories.every(x=>isRecord(x)&&text(x.accessoryId)&&text(x.label)&&amount(x.quantity));
 const payments=v.payments.every(x=>isRecord(x)&&text(x.id)&&methods.includes(x.method as PaymentMethod)&&amount(x.amount)&&["pending","confirmed","cancelled"].includes(String(x.status))&&(x.date===undefined||text(x.date))&&(x.dueDate===undefined||/^\\d{4}-\\d{2}-\\d{2}$/.test(String(x.dueDate)))&&(x.reference===undefined||text(x.reference)));
 const refunds=v.refunds.every(x=>isRecord(x)&&text(x.id)&&methods.includes(x.method as PaymentMethod)&&amount(x.amount)&&["pending","confirmed"].includes(String(x.status))&&(x.date===undefined||text(x.date)));
 const avoirs=(v.avoirs===undefined?true:(v.avoirs as unknown[]).every(x=>isRecord(x)&&text(x.id)&&amount(x.amount)&&text(x.date)&&["pending","settled"].includes(String(x.status))));
 const glass=v.lines.glass.every(x=>isRecord(x)&&text(x.label)&&amount(x.widthMm)&&amount(x.heightMm)&&amount(x.quantity)&&amount(x.pricePerM2));
 const services=v.lines.services.every(x=>isRecord(x)&&text(x.name)&&["ml","m²"].includes(String(x.unit))&&amount(x.quantity)&&amount(x.unitPrice));
 const accessories=v.lines.accessories.every(x=>isRecord(x)&&text(x.label)&&amount(x.quantity)&&amount(x.unitPrice));
 return uses&&payments&&refunds&&avoirs&&glass&&services&&accessories;
}
function validPurchase(v:unknown):v is AccessoryPurchase{return isRecord(v)&&text(v.accessoryId)&&text(v.label)&&amount(v.quantity);}
function validInvoice(v:unknown):v is SupplierInvoice {
 if(!isRecord(v)||!text(v.id)||!text(v.supplier)||!v.supplier.trim()||!text(v.invoiceNumber)||!v.invoiceNumber.trim()||!text(v.date)||!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||!["glass","accessory"].includes(String(v.category))||!Array.isArray(v.lines)||v.lines.length===0||!amount(v.totalHT)||!amount(v.totalTVA)||!amount(v.totalTTC)||!amount(v.paidAmount)||v.paidAmount>v.totalTTC||!["Espèces","Virement","Chèque","Effet","Non réglé"].includes(String(v.paymentMethod))||(v.paidAmount>0&&v.paymentMethod==="Non réglé")||(v.paidDate!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(String(v.paidDate)))||(v.payments!==undefined&&(!Array.isArray(v.payments)||!v.payments.every(p=>isRecord(p)&&text(p.id)&&text(p.date)&&/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&amount(p.amount)&&p.amount>0&&methods.includes(p.method as PaymentMethod)&&(p.status===undefined||["pending","confirmed","cancelled"].includes(String(p.status)))&&(p.dueDate===undefined||/^\\d{4}-\\d{2}-\\d{2}$/.test(String(p.dueDate)))&&(p.reference===undefined||text(p.reference))))))return false;
 if(v.paidAmount+(Array.isArray(v.payments)?v.payments.reduce((s,p)=>s+(isRecord(p)&&p.status!=="cancelled"&&amount(p.amount)?p.amount:0),0):0)>v.totalTTC)return false;
 return v.lines.every(x=>isRecord(x)&&text(x.label)&&x.label.trim().length>0&&amount(x.quantity)&&x.quantity>0&&amount(x.unitPrice)&&(x.widthMm===undefined||amount(x.widthMm))&&(x.heightMm===undefined||amount(x.heightMm)));
}
const validExpense=(v:unknown):v is ExpenseRecord=>isRecord(v)&&text(v.id)&&text(v.name)&&["Loyer","Eau","Électricité","Maintenance","Carburant","Autres"].includes(String(v.category))&&amount(v.amount)&&["Jour","Semaine","Mois","Année"].includes(String(v.frequency))&&methods.includes(v.paymentMethod as PaymentMethod)&&text(v.startDate)&&(v.endDate===undefined||text(v.endDate));
const validEmployee=(v:unknown):v is Employee=>isRecord(v)&&text(v.id)&&text(v.name)&&amount(v.weeklySalary)&&typeof v.active==="boolean";
const validPayrollWeek=(v:unknown):v is PayrollWeek=>isRecord(v)&&text(v.id)&&text(v.employeeId)&&text(v.weekStart)&&Array.isArray(v.attendance)&&Array.isArray(v.advances)&&Array.isArray(v.salaryPayments)&&v.attendance.every(x=>isRecord(x)&&text(x.date)&&amount(x.hours)&&x.hours<=9)&&v.advances.every(x=>isRecord(x)&&text(x.id)&&text(x.date)&&amount(x.amount)&&methods.includes(x.method as PaymentMethod))&&v.salaryPayments.every(x=>isRecord(x)&&text(x.id)&&text(x.date)&&amount(x.amount)&&methods.includes(x.method as PaymentMethod));
const empty=():WorkshopStore=>({version:1,orders:[],accessoryPurchases:[],supplierInvoices:[],expenses:[],employees:[],payrollWeeks:[]});
export function decodeWorkshopStore(raw:string|null):WorkshopStore{
 if(!raw)return empty();try{const v:unknown=JSON.parse(raw);if(!isRecord(v)||v.version!==1||!Array.isArray(v.orders)||!Array.isArray(v.accessoryPurchases))return empty();return {version:1,orders:v.orders.filter(validOrder),accessoryPurchases:v.accessoryPurchases.filter(validPurchase),supplierInvoices:Array.isArray(v.supplierInvoices)?v.supplierInvoices.filter(validInvoice):[],expenses:Array.isArray(v.expenses)?v.expenses.filter(validExpense):[],employees:Array.isArray(v.employees)?v.employees.filter(validEmployee):[],payrollWeeks:Array.isArray(v.payrollWeeks)?v.payrollWeeks.filter(validPayrollWeek):[]};}catch{return empty();}
}
export function readWorkshopStore():WorkshopStore{if(typeof window==="undefined")return empty();try{return decodeWorkshopStore(window.localStorage.getItem(WORKSHOP_STORAGE_KEY));}catch{return empty();}}
export function writeWorkshopStore(store:WorkshopStore):boolean{if(typeof window==="undefined")return false;try{const safe:WorkshopStore={version:1,orders:store.orders.filter(validOrder),accessoryPurchases:store.accessoryPurchases.filter(validPurchase),supplierInvoices:(store.supplierInvoices||[]).filter(validInvoice),expenses:(store.expenses||[]).filter(validExpense),employees:(store.employees||[]).filter(validEmployee),payrollWeeks:(store.payrollWeeks||[]).filter(validPayrollWeek)};window.localStorage.setItem(WORKSHOP_STORAGE_KEY,JSON.stringify(safe));return true;}catch{return false;}}
