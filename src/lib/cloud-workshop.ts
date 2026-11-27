import type { SupabaseClient } from "@supabase/supabase-js";
import type { Draft } from "@/lib/storage";
import type { WorkshopStore } from "@/lib/workshop-storage";

export type CloudWorkshopPayload = WorkshopStore & { drafts: Draft[] };
export type CloudWorkshopSnapshot = { payload: CloudWorkshopPayload; revision: number };

export function normalizeCloudWorkshopPayload(value: Partial<CloudWorkshopPayload> | null | undefined): CloudWorkshopPayload {
  return {
    version: 1,
    orders: Array.isArray(value?.orders) ? value.orders : [],
    accessoryPurchases: Array.isArray(value?.accessoryPurchases) ? value.accessoryPurchases : [],
    supplierInvoices: Array.isArray(value?.supplierInvoices) ? value.supplierInvoices : [],
    expenses: Array.isArray(value?.expenses) ? value.expenses : [],
    employees: Array.isArray(value?.employees) ? value.employees : [],
    payrollWeeks: Array.isArray(value?.payrollWeeks) ? value.payrollWeeks : [],
    customers: Array.isArray(value?.customers) ? value.customers : [],
    independentInvoices: Array.isArray(value?.independentInvoices) ? value.independentInvoices : [],
    drafts: Array.isArray(value?.drafts) ? value.drafts : [],
  };
}

export function emptyCloudWorkshopPayload(): CloudWorkshopPayload {
  return {
    version: 1,
    orders: [],
    accessoryPurchases: [],
    supplierInvoices: [],
    expenses: [],
    employees: [],
    payrollWeeks: [],
    customers: [],
    independentInvoices: [],
    drafts: [],
  };
}

export async function loadCloudWorkshop(
  supabase: SupabaseClient,
): Promise<CloudWorkshopSnapshot | null> {
  const { data, error } = await supabase
    .from("workshop_state")
    .select("payload, revision")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    payload: normalizeCloudWorkshopPayload(data.payload as Partial<CloudWorkshopPayload>),
    revision: Number(data.revision),
  };
}

export async function saveCloudWorkshop(
  supabase: SupabaseClient,
  payload: CloudWorkshopPayload,
  expectedRevision: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("save_workshop_state", {
    p_payload: payload,
    p_expected_revision: expectedRevision,
  }).single();
  if (error) throw error;
  return Number((data as { revision: number }).revision);
}

export async function saveCloudWorkshopMerge(
  supabase: SupabaseClient,
  basePayload: CloudWorkshopPayload,
  payload: CloudWorkshopPayload,
): Promise<CloudWorkshopSnapshot> {
  const { data, error } = await supabase.rpc("save_workshop_state_merge", {
    p_base_payload: basePayload,
    p_payload: payload,
  }).single();
  if (error) throw error;
  const saved = data as { revision: number; payload: CloudWorkshopPayload };
  return {
    payload: saved.payload,
    revision: Number(saved.revision),
  };
}
