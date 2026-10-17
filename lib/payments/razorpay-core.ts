// Razorpay Subscriptions — pure helpers (signature checks, webhook → row mapping). Node only.
// Docs: https://razorpay.com/docs/payments/subscriptions/integration-guide/
//       https://razorpay.com/docs/webhooks/subscriptions/
import { createHmac, timingSafeEqual } from "node:crypto";

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a, "utf8"), y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Checkout success: hmac_sha256(razorpay_payment_id + "|" + subscription_id) with the key secret.
 *  Always pass the subscription id stored on OUR server, not the one echoed by the browser. */
export function verifyPaymentSignature(paymentId: string, storedSubscriptionId: string, signature: string, keySecret: string): boolean {
  if (!paymentId || !storedSubscriptionId || !signature || !keySecret) return false;
  const expected = createHmac("sha256", keySecret).update(`${paymentId}|${storedSubscriptionId}`).digest("hex");
  return safeEqual(expected, signature);
}

/** Webhooks: X-Razorpay-Signature = hmac_sha256(raw request body) with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string): boolean {
  if (!signature || !webhookSecret) return false;
  return safeEqual(createHmac("sha256", webhookSecret).update(rawBody).digest("hex"), signature);
}

export interface RzpSubscription {
  id: string; plan_id?: string; status?: string; current_start?: number | null; current_end?: number | null;
  ended_at?: number | null; short_url?: string | null; notes?: Record<string, string> | unknown[]; paid_count?: number;
}

const iso = (unix?: number | null) => (unix ? new Date(unix * 1000).toISOString() : null);

/** Columns to write into public.subscriptions for a Razorpay subscription entity. */
export function rowFromEntity(e: RzpSubscription) {
  return {
    status: e.status ?? "created",
    current_start: iso(e.current_start),
    current_end: iso(e.current_end),
    short_url: e.short_url ?? null,
  };
}

/** Never move an access period backwards when webhooks arrive out of order. */
export function laterEnd(existing: string | null | undefined, incoming: string | null | undefined): string | null {
  if (!existing) return incoming ?? null;
  if (!incoming) return existing;
  return Date.parse(incoming) > Date.parse(existing) ? incoming : existing;
}

export const userIdFromNotes = (notes: RzpSubscription["notes"]): string | null => {
  const v = notes && !Array.isArray(notes) ? (notes as Record<string, string>).user_id : null;
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
};

/** Provisional end of the first period if Razorpay hasn't reported current_end yet. */
export function provisionalEnd(from: Date, months: number): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}
