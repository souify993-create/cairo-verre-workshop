"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://sppcvihdyhplndhoanyu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wH_O3feVcMruLBSrHDlsGA__uTu8qfv";

let browserClient: SupabaseClient | null = null;

/** Publishable key is intentionally public; all workshop data is protected by RLS. */
export function createSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}
