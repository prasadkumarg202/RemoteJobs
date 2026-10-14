import "server-only";
import { createClient } from "@supabase/supabase-js";
import { DEMO_MODE, SUPABASE_URL } from "@/lib/env";

/** Service-role client. Server only — bypasses RLS. Never import from a client component. */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (DEMO_MODE || !key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
