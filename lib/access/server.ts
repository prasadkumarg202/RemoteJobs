import "server-only";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { DEVICE_COOKIE, deviceHash, emailLoginFrom, isDeviceId, statusFromRpc, type AccessStatus } from "./core";

export const ACCESS_MODE = (process.env.ACCESS_MODE ?? "subscription") === "open" ? "open" : "subscription";

export interface Plan { id: string; name: string; name_te: string | null; price_inr: number; interval_months: number; razorpay_plan_id: string | null }

export interface MyAccess {
  signedIn: boolean;
  status: AccessStatus | null;
  raw: Record<string, unknown> | null;
  phone: string | null;
  subscription: { provider: string; status: string; current_end: string | null; cancel_at_period_end: boolean } | null;
}

export async function getPlans(): Promise<Plan[]> {
  const sb = await supabaseServer();
  if (!sb) return [];
  const { data } = await sb.from("subscription_plans").select("id,name,name_te,price_inr,interval_months,razorpay_plan_id").eq("active", true).order("sort_order");
  return (data ?? []) as Plan[];
}

export async function emailLoginEnabled(): Promise<boolean> {
  const env = process.env.EMAIL_LOGIN;
  if (env === "on" || env === "off") return env === "on";
  return emailLoginFrom(env, (await getAccessSettings()).email_login);
}

export async function getAccessSettings(): Promise<{ mode: string; trial_days: number; device_change_cooldown_days: number; email_login?: boolean }> {
  const sb = await supabaseServer();
  const fallback = { mode: ACCESS_MODE, trial_days: 0, device_change_cooldown_days: 30 };
  if (!sb) return fallback;
  const { data } = await sb.from("app_settings").select("value").eq("key", "access").maybeSingle();
  return { ...fallback, ...((data?.value as object) ?? {}) };
}

export async function getMyAccess(): Promise<MyAccess> {
  const sb = await supabaseServer();
  const empty: MyAccess = { signedIn: false, status: null, raw: null, phone: null, subscription: null };
  if (!sb) return empty;
  const user = (await sb.auth.getUser()).data.user;
  if (!user) return empty;
  const did = (await cookies()).get(DEVICE_COOKIE)?.value;
  const { data } = await sb.rpc("access_status", { p_device_hash: isDeviceId(did) ? await deviceHash(did) : "0".repeat(64) });
  const raw = (data ?? null) as Record<string, unknown> | null;
  const { data: subs } = await sb.from("subscriptions").select("provider,status,current_end,cancel_at_period_end")
    .neq("status", "created").order("current_end", { ascending: false, nullsFirst: false }).limit(1);
  return { signedIn: true, status: statusFromRpc(raw), raw, phone: user.phone ?? null, subscription: subs?.[0] ?? null };
}
