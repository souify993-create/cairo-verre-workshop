import type { AccessoryPurchase, PaymentMethod } from "./ledger";
import type { StoredOrder } from "./workshop";

export type WorkshopStore = { version: 1; orders: StoredOrder[]; accessoryPurchases: AccessoryPurchase[] };
export const WORKSHOP_STORAGE_KEY = "cairo-verre-workshop-data";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const amount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const methods: PaymentMethod[] = ["Espèces", "Virement", "Chèque"];

function validOrder(v: unknown): v is StoredOrder {
  if (!isRecord(v) || !text(v.id) || !text(v.number) || !text(v.customer) ||
      !["draft", "delivered", "cancelled"].includes(String(v.status)) ||
      !amount(v.totalTTC) || !text(v.createdAt) || !text(v.updatedAt) ||
      !Array.isArray(v.accessories) || !Array.isArray(v.payments) || !Array.isArray(v.refunds) ||
      !isRecord(v.lines) || !Array.isArray(v.lines.glass) || !Array.isArray(v.lines.services) ||
      !Array.isArray(v.lines.accessories)) return false;
  const accessoryUses = v.accessories.every(x => isRecord(x) && text(x.accessoryId) &&
    text(x.label) && amount(x.quantity));
  const payments = v.payments.every(x => isRecord(x) && text(x.id) &&
    methods.includes(x.method as PaymentMethod) && amount(x.amount) &&
    ["pending", "confirmed", "cancelled"].includes(String(x.status)));
  const refunds = v.refunds.every(x => isRecord(x) && text(x.id) &&
    methods.includes(x.method as PaymentMethod) && amount(x.amount) &&
    ["pending", "confirmed"].includes(String(x.status)));
  const glass = v.lines.glass.every(x => isRecord(x) && text(x.label) &&
    amount(x.widthMm) && amount(x.heightMm) && amount(x.quantity) && amount(x.pricePerM2));
  const services = v.lines.services.every(x => isRecord(x) && text(x.name) &&
    ["ml", "m²"].includes(String(x.unit)) && amount(x.quantity) && amount(x.unitPrice));
  const accessories = v.lines.accessories.every(x => isRecord(x) && text(x.label) &&
    amount(x.quantity) && amount(x.unitPrice));
  return accessoryUses && payments && refunds && glass && services && accessories;
}

function validPurchase(v: unknown): v is AccessoryPurchase {
  return isRecord(v) && text(v.accessoryId) && text(v.label) && amount(v.quantity);
}

export function decodeWorkshopStore(raw: string | null): WorkshopStore {
  if (!raw) return { version: 1, orders: [], accessoryPurchases: [] };
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 ||
        !Array.isArray(value.orders) || !Array.isArray(value.accessoryPurchases)) {
      return { version: 1, orders: [], accessoryPurchases: [] };
    }
    return {
      version: 1,
      orders: value.orders.filter(validOrder),
      accessoryPurchases: value.accessoryPurchases.filter(validPurchase),
    };
  } catch {
    return { version: 1, orders: [], accessoryPurchases: [] };
  }
}

export function readWorkshopStore(): WorkshopStore {
  if (typeof window === "undefined") return { version: 1, orders: [], accessoryPurchases: [] };
  try { return decodeWorkshopStore(window.localStorage.getItem(WORKSHOP_STORAGE_KEY)); }
  catch { return { version: 1, orders: [], accessoryPurchases: [] }; }
}

export function writeWorkshopStore(store: WorkshopStore): boolean {
  if (typeof window === "undefined") return false;
  try {
    const safe: WorkshopStore = {
      version: 1,
      orders: store.orders.filter(validOrder),
      accessoryPurchases: store.accessoryPurchases.filter(validPurchase),
    };
    window.localStorage.setItem(WORKSHOP_STORAGE_KEY, JSON.stringify(safe));
    return true;
  } catch { return false; }
}
