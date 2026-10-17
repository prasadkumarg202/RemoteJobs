"use server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function db() {
  if (!(await isAdmin())) throw new Error("not authorized");
  const a = supabaseAdmin();
  if (!a) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return a;
}
const UUID = /^[0-9a-f-]{36}$/i;

export async function saveAccessSettings(fd: FormData) {
  const a = await db();
  const mode = fd.get("mode") === "open" ? "open" : "subscription";
  const clamp = (v: FormDataEntryValue | null, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  await a.from("app_settings").upsert({ key: "access", value: { mode, trial_days: clamp(fd.get("trial_days"), 60), device_change_cooldown_days: clamp(fd.get("cooldown"), 365), email_login: fd.get("email_login") === "on" }, updated_at: new Date().toISOString() });
  revalidatePath("/admin/subscribers");
}

export async function saveAiSettings(fd: FormData) {
  const a = await db();
  const daily = Math.max(0, Math.min(500, Math.floor(Number(fd.get("daily_questions")) || 0)));
  const sim = Math.max(0.1, Math.min(0.9, Number(fd.get("min_similarity")) || 0.4));
  await a.from("app_settings").upsert({ key: "ai", value: { assistant: fd.get("assistant") === "on", daily_questions: daily, min_similarity: Math.round(sim * 100) / 100 }, updated_at: new Date().toISOString() });
  revalidatePath("/admin/subscribers");
}

export async function savePlan(fd: FormData) {
  const a = await db();
  const id = String(fd.get("id"));
  if (!/^[a-z0-9-]{2,40}$/.test(id)) return;
  const rp = String(fd.get("razorpay_plan_id") ?? "").trim();
  await a.from("subscription_plans").upsert({
    id, name: String(fd.get("name") ?? id).slice(0, 60), name_te: String(fd.get("name_te") ?? "").slice(0, 60) || null,
    price_inr: Math.max(1, Math.floor(Number(fd.get("price_inr")) || 1)), interval_months: Math.max(1, Math.min(24, Math.floor(Number(fd.get("interval_months")) || 1))),
    razorpay_plan_id: /^plan_[A-Za-z0-9]+$/.test(rp) ? rp : null, active: fd.get("active") === "on", sort_order: Math.floor(Number(fd.get("sort_order")) || 0),
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/admin/subscribers");
}

export async function resetDevice(fd: FormData) {
  const a = await db();
  const id = String(fd.get("user_id"));
  if (!UUID.test(id)) return;
  await a.from("user_devices").delete().eq("user_id", id);
  revalidatePath("/admin/subscribers");
}

export async function grantDays(fd: FormData) {
  const a = await db();
  const id = String(fd.get("user_id"));
  const days = Math.floor(Number(fd.get("days")));
  if (!UUID.test(id) || !(days > 0 && days <= 3650)) return;
  const { data: until } = await a.rpc("access_until", { p_user: id });
  const start = until && Date.parse(until as string) > Date.now() ? new Date(until as string) : new Date();
  const end = new Date(start.getTime() + days * 86400000);
  await a.from("subscriptions").insert({ user_id: id, provider: "admin", status: "active", current_start: start.toISOString(), current_end: end.toISOString(), note: String(fd.get("note") ?? "Complimentary").slice(0, 300) });
  revalidatePath("/admin/subscribers");
}

export async function revokeAccess(fd: FormData) {
  const a = await db();
  const id = String(fd.get("user_id"));
  if (!UUID.test(id)) return;
  // Ends trial/admin periods now. Paid Razorpay periods are cancelled in the Razorpay dashboard (refund there if needed).
  await a.from("subscriptions").update({ current_end: new Date().toISOString(), status: "revoked", updated_at: new Date().toISOString() }).eq("user_id", id).in("provider", ["trial", "admin"]).gt("current_end", new Date().toISOString());
  revalidatePath("/admin/subscribers");
}
