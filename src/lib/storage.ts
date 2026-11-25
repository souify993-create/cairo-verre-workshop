import type { AccessoryLine, GlassLine, ServiceLine } from "./calculations";

export type Draft = {
  id: string;
  number: string;
  customer: string;
  createdAt: string;
  glass: GlassLine[];
  services: ServiceLine[];
  accessories: AccessoryLine[];
  total: number;
};

type DraftStore = { version: 1; drafts: Draft[] };
export const DRAFT_STORAGE_KEY = "cairo-verre-drafts";
const STORE_VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finiteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const validText = (value: unknown): value is string => typeof value === "string";

function validDraft(value: unknown): value is Draft {
  if (!isRecord(value)) return false;
  if (!validText(value.id) || !validText(value.number) || !validText(value.customer) ||
      !validText(value.createdAt) || !finiteNonNegative(value.total)) return false;
  if (!Array.isArray(value.glass) || !Array.isArray(value.services) || !Array.isArray(value.accessories)) return false;
  const glassOk = value.glass.every((line) => isRecord(line) && validText(line.label) &&
    finiteNonNegative(line.widthMm) && finiteNonNegative(line.heightMm) &&
    finiteNonNegative(line.quantity) && finiteNonNegative(line.pricePerM2));
  const servicesOk = value.services.every((line) => isRecord(line) && validText(line.name) &&
    (line.unit === "ml" || line.unit === "m²") && finiteNonNegative(line.quantity) &&
    finiteNonNegative(line.unitPrice));
  const accessoriesOk = value.accessories.every((line) => isRecord(line) && validText(line.label) &&
    finiteNonNegative(line.quantity) && finiteNonNegative(line.unitPrice));
  return glassOk && servicesOk && accessoriesOk;
}

export function decodeDraftStore(raw: string | null): Draft[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    // Version 1 envelope is used going forward. Accept the previous raw array once
    // so existing customer drafts are not discarded during this upgrade.
    if (Array.isArray(parsed)) return parsed.filter(validDraft);
    if (!isRecord(parsed) || parsed.version !== STORE_VERSION || !Array.isArray(parsed.drafts)) return [];
    return parsed.drafts.filter(validDraft);
  } catch {
    return [];
  }
}

export function encodeDraftStore(drafts: Draft[]): string {
  const safeDrafts = drafts.filter(validDraft);
  const store: DraftStore = { version: STORE_VERSION, drafts: safeDrafts };
  return JSON.stringify(store);
}

export function readDrafts(): Draft[] {
  if (typeof window === "undefined") return [];
  try {
    return decodeDraftStore(window.localStorage.getItem(DRAFT_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeDrafts(drafts: Draft[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, encodeDraftStore(drafts));
    return true;
  } catch {
    return false;
  }
}
