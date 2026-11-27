import type { SupabaseClient } from "@supabase/supabase-js";
import type { Draft } from "@/lib/storage";
import type { WorkshopStore } from "@/lib/workshop-storage";

export type CloudWorkshopPayload = WorkshopStore & { drafts: Draft[] };
export type CloudWorkshopSnapshot = { payload: CloudWorkshopPayload; revision: number };

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
    payload: data.payload as CloudWorkshopPayload,
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
