"use client";
import { createBrowserClient } from "@supabase/ssr";
import { DEMO_MODE, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | null = null;
export function supabaseBrowser() {
  if (DEMO_MODE) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
