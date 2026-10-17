"use server";
import { cookies } from "next/headers";
import { DEVICE_COOKIE, deviceHash, isDeviceId, PASS_COOKIE, statusFromRpc } from "@/lib/access/core";
import { cancelSubscription, createSubscription, fetchSubscription, razorpayConfigured } from "@/lib/payments/razorpay";
import { provisionalEnd, rowFromEntity, verifyPaymentSignature } from "@/lib/payments/razorpay-core";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export interface CheckoutStart { ok: boolean; message?: string; keyId?: string; subscriptionId?: string; planName?: string; contact?: string | null; email?: string | null }

async function signedInOnThisDevice() {
  const sb = await supabaseServer();
  if (!sb) return null;
  const user = (await sb.auth.getUser()).data.user;
  if (!user) return null;
  const did = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!isDeviceId(did)) return null;
  const { data } = await sb.rpc("access_status", { p_device_hash: await deviceHash(did) });
  const st = statusFromRpc(data as Record<string, unknown>);
  return st.device === "match" || st.admin ? { sb, user } : null;
}

export async function startCheckout(planId: string): Promise<CheckoutStart> {
  if (!razorpayConfigured()) return { ok: false, message: "not_configured" };
  const me = await signedInOnThisDevice();
  if (!me) return { ok: false, message: "Sign in on your registered device first." };
  const admin = supabaseAdmin();
  if (!admin) return { ok: false, message: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  const { data: plan } = await admin.from("subscription_plans").select("id,name,razorpay_plan_id,total_count,active").eq("id", planId).maybeSingle();
  if (!plan?.active || !plan.razorpay_plan_id) return { ok: false, message: "This plan isn’t available." };
  try {
    const sub = await createSubscription(plan.razorpay_plan_id, plan.total_count, { user_id: me.user.id, plan: plan.id });
    const { error } = await admin.from("subscriptions").insert({
      user_id: me.user.id, plan_id: plan.id, provider: "razorpay", provider_subscription_id: sub.id, ...rowFromEntity(sub), status: sub.status ?? "created",
    });
    if (error) return { ok: false, message: "Couldn’t start the payment. Try again." };
    return { ok: true, keyId: process.env.RAZORPAY_KEY_ID, subscriptionId: sub.id, planName: plan.name, contact: me.user.phone ? `+${me.user.phone.replace(/^\+/, "")}` : null, email: me.user.email || null };
  } catch (e) {
    console.error("startCheckout", e);
    return { ok: false, message: "Payment service is busy. Try again in a minute." };
  }
}

export async function confirmCheckout(p: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }): Promise<{ ok: boolean; message?: string }> {
  const sb = await supabaseServer();
  const admin = supabaseAdmin();
  const user = sb ? (await sb.auth.getUser()).data.user : null;
  if (!user || !admin) return { ok: false, message: "Sign in again." };
  // Look up the subscription WE created for this user — never trust the id from the browser alone.
  const { data: row } = await admin.from("subscriptions").select("id,provider_subscription_id,current_end,plan_id,subscription_plans(interval_months)")
    .eq("user_id", user.id).eq("provider", "razorpay").eq("provider_subscription_id", p.razorpay_subscription_id).maybeSingle();
  if (!row) return { ok: false, message: "Unknown subscription." };
  if (!verifyPaymentSignature(p.razorpay_payment_id, row.provider_subscription_id!, p.razorpay_signature, process.env.RAZORPAY_KEY_SECRET ?? "")) {
    return { ok: false, message: "Payment could not be verified." };
  }
  const months = (row.subscription_plans as unknown as { interval_months: number } | null)?.interval_months ?? 1;
  let patch: Record<string, unknown> = { status: "active", current_start: new Date().toISOString(), current_end: provisionalEnd(new Date(), months) };
  try {
    const sub = await fetchSubscription(row.provider_subscription_id!);
    const r = rowFromEntity(sub);
    if (r.current_end) patch = { ...r, status: r.status === "created" ? "authenticated" : r.status };
  } catch { /* keep provisional period; the webhook will correct it */ }
  await admin.from("subscriptions").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row.id);
  (await cookies()).delete(PASS_COOKIE);
  return { ok: true };
}

export async function cancelAutoRenew(): Promise<{ ok: boolean; message?: string }> {
  const sb = await supabaseServer();
  const admin = supabaseAdmin();
  const user = sb ? (await sb.auth.getUser()).data.user : null;
  if (!user || !admin) return { ok: false, message: "Sign in again." };
  const { data: rows } = await admin.from("subscriptions").select("id,provider_subscription_id,status").eq("user_id", user.id).eq("provider", "razorpay")
    .in("status", ["active", "authenticated", "pending"]).order("created_at", { ascending: false }).limit(1);
  const row = rows?.[0];
  if (!row) return { ok: false, message: "No active subscription." };
  try {
    await cancelSubscription(row.provider_subscription_id!, true);
    await admin.from("subscriptions").update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
