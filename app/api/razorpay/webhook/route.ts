import { NextResponse } from "next/server";
import { laterEnd, rowFromEntity, userIdFromNotes, verifyWebhookSignature, type RzpSubscription } from "@/lib/payments/razorpay-core";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Razorpay → Mana Kosamu. Configure in Razorpay Dashboard → Webhooks with the subscription.* events
// and the same secret as RAZORPAY_WEBHOOK_SECRET. Verifies the signature on the RAW body.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"), process.env.RAZORPAY_WEBHOOK_SECRET ?? "")) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 503 });
  let body: { event?: string; payload?: { subscription?: { entity?: RzpSubscription } } };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const event = String(body.event ?? "");
  const entity = body.payload?.subscription?.entity;
  const eventId = req.headers.get("x-razorpay-event-id");

  const { data: logged, error: logErr } = await admin.from("subscription_events")
    .insert({ provider: "razorpay", event_id: eventId, event, provider_subscription_id: entity?.id ?? null, payload: body })
    .select("id").maybeSingle();
  if (logErr) {
    if (/duplicate|unique/i.test(logErr.message)) return NextResponse.json({ ok: true, duplicate: true });
    return NextResponse.json({ error: "log failed" }, { status: 500 });
  }
  if (!event.startsWith("subscription.") || !entity?.id) return NextResponse.json({ ok: true, ignored: true });

  const fields = rowFromEntity(entity);
  const { data: row } = await admin.from("subscriptions").select("id,current_end").eq("provider_subscription_id", entity.id).maybeSingle();
  let error: string | null = null;
  if (row) {
    const { error: e } = await admin.from("subscriptions").update({
      ...fields, current_end: laterEnd(row.current_end, fields.current_end),
      ...(event === "subscription.cancelled" ? { cancel_at_period_end: true } : {}), updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    error = e?.message ?? null;
  } else {
    const userId = userIdFromNotes(entity.notes);
    if (userId) {
      const { data: plan } = await admin.from("subscription_plans").select("id").eq("razorpay_plan_id", entity.plan_id ?? "").maybeSingle();
      const { error: e } = await admin.from("subscriptions").insert({ user_id: userId, plan_id: plan?.id ?? null, provider: "razorpay", provider_subscription_id: entity.id, ...fields });
      error = e?.message ?? null;
    } else error = "unknown subscription and no user_id in notes";
  }
  if (logged) await admin.from("subscription_events").update({ processed: !error, error }).eq("id", logged.id);
  return NextResponse.json({ ok: !error });
}
