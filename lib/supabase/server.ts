import "server-only";
import { createServerClient } from "@supabase/ssr";
import { compatFetch } from "@engine/compat-fetch.ts";
import { cookies } from "next/headers";
import { DEMO_MODE, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/** Per-request client acting as the signed-in user (RLS applies). */
export async function supabaseServer() {
  if (DEMO_MODE) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: compatFetch },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are refreshed by middleware instead.
        }
      },
    },
  });
}

export async function currentUser() {
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

export async function currentProfile() {
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data } = await sb.from("profiles").select("id, role, display_name, phone, preferred_language").eq("id", auth.user.id).maybeSingle();
  return data ? { ...data, email: auth.user.email ?? null } : { id: auth.user.id, role: "user", display_name: null, phone: auth.user.phone ?? null, preferred_language: "en", email: auth.user.email ?? null };
}

export async function isAdmin() {
  const p = await currentProfile();
  return !!p && (p.role === "admin" || p.role === "moderator");
}
