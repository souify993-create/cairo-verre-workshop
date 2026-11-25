import type { AccessoryPurchase, PaymentMethod } from "./ledger";
import type { StoredOrder } from "./workshop";
import type { ExpenseRecord } from "./operations";
import type { Employee, PayrollWeek } from "./payroll";

export type PurchaseLine = { label: string; quantity: number; unitPrice: number; widthMm?: number; heightMm?: number };
export type SupplierInvoice = {
  id: string; supplier: string; invoiceNumber: string; date: string;
  category: "glass" | "accessory"; lines: PurchaseLine[];
  totalHT: number; totalTVA: number; totalTTC: number;
  paidAmount: number; paymentMethod: PaymentMethod | "Non réglé";
  chequeNumber?: string; chequeDate?: string; paidDate?: string;
};
export type WorkshopStore = { version: 1; orders: StoredOrder[]; accessoryPurchases: AccessoryPurchase[]; supplierInvoices: SupplierInvoice[]; expenses: ExpenseRecord[]; employees: Employee[]; payrollWeeks: PayrollWeek[] };
export const WORKSHOP_STORAGE_KEY = "cairo-verre-workshop-data";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const amount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const methods: PaymentMethod[] = ["Espèces", "Virement", "Chèque"];
function validOrder(v: unknown): v is StoredOrder {
 if (!isRecord(v)||!text(v.id)||!text(v.number)||!text(v.customer)||!["draft","delivered","cancelled"].includes(String(v.status))||!amount(v.totalTTC)||!text(v.createdAt)||!text(v.updatedAt)||!Array.isArray(v.accessories)||!Array.isArray(v.payments)||!Array.isArray(v.refunds)||!isRecord(v.lines)||!Array.isArray(v.lines.glass)||!Array.isArray(v.lines.services)||!Array.isArray(v.lines.accessories)) return false;
 const uses=v.accessories.every(x=>isRecord(x)&&text(x.accessoryId)&&text(x.label)&&amount(x.quantity));
 const payments=v.payments.every(x=>isRecord(x)&&text(x.id)&&methods.includes(x.method as PaymentMethod)&&amount(x.amount)&&["pending","confirmed","cancelled"].includes(String(x.status))&&(x.date===undefined||text(x.date)));
 const refunds=v.refunds.every(x=>isRecord(x)&&text(x.id)&&methods.includes(x.method as PaymentMethod)&&amount(x.amount)&&["pending","confirmed"].includes(String(x.status))&&(x.date===undefined||text(x.date)));
 const glass=v.lines.glass.every(x=>isRecord(x)&&text(x.label)&&amount(x.widthMm)&&amount(x.heightMm)&&amount(x.quantity)&&amount(x.pricePerM2));
 const services=v.lines.services.every(x=>isRecord(x)&&text(x.name)&&["ml","m²"].includes(String(x.unit))&&amount(x.quantity)&&amount(x.unitPrice));
 const accessories=v.lines.accessories.every(x=>isRecord(x)&&text(x.label)&&amount(x.quantity)&&amount(x.unitPrice));
 return uses&&payments&&refunds&&glass&&services&&accessories;
}
function validPurchase(v:unknown):v is AccessoryPurchase{return isRecord(v)&&text(v.accessoryId)&&text(v.label)&&amount(v.quantity);}
function validInvoice(v:unknown):v is SupplierInvoice {
 if(!isRecord(v)||!text(v.id)||!text(v.supplier)||!text(v.invoiceNumber)||!text(v.date)||!["glass","accessory"].includes(String(v.category))||!Array.isArray(v.lines)||!amount(v.totalHT)||!amount(v.totalTVA)||!amount(v.totalTTC)||!amount(v.paidAmount)||!["Espèces","Virement","Chèque","Non réglé"].includes(String(v.paymentMethod))||(v.paidDate!==undefined&&!text(v.paidDate)))return false;
 return v.lines.every(x=>isRecord(x)&&text(x.label)&&amount(x.quantity)&&amount(x.unitPrice)&&(x.widthMm===undefined||amount(x.widthMm))&&(x.heightMm===undefined||amount(x.heightMm)));
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
