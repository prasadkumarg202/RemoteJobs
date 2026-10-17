import "server-only";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const EVENT_TYPES = ["job_view", "apply_click", "save_job", "share_job", "report_job", "search", "filter_used", "hide_job", "affiliate_click"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anonymous random session id (no PII). */
export async function sessionId(): Promise<string> {
  const store = await cookies();
  let sid = store.get("mk_sid")?.value;
  if (!sid || !UUID.test(sid)) {
    sid = crypto.randomUUID();
    try { store.set("mk_sid", sid, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 180, path: "/" }); } catch { /* read-only context */ }
  }
  return sid;
}

export async function recordEvent(e: { event: EventType; job_id?: string | null; query?: string | null; section?: string | null; filters?: Record<string, unknown> | null }) {
  const admin = supabaseAdmin();
  if (!admin) return; // demo mode: no analytics storage
  const sb = await supabaseServer();
  const user = sb ? (await sb.auth.getUser()).data.user : null;
  const filters = e.filters ? Object.fromEntries(Object.entries(e.filters).slice(0, 15).map(([k, v]) => [k.slice(0, 30), String(v).slice(0, 100)])) : null;
  await admin.from("job_events").insert({
    event_type: e.event,
    job_id: e.job_id && UUID.test(e.job_id) ? e.job_id : null,
    user_id: user?.id ?? null,
    session_id: await sessionId(),
    section: e.section?.slice(0, 30) ?? null,
    query: e.query?.trim().toLowerCase().slice(0, 200) || null,
    filters,
  });
}
