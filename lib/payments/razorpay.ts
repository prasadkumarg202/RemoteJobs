import "server-only";
import type { RzpSubscription } from "./razorpay-core";

const API = "https://api.razorpay.com/v1";

export const razorpayConfigured = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

async function rzp<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Razorpay keys are not set");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${(json as { error?: { description?: string } }).error?.description ?? "request failed"}`);
  return json as T;
}

export const createSubscription = (planId: string, totalCount: number, notes: Record<string, string>) =>
  rzp<RzpSubscription>("POST", "/subscriptions", { plan_id: planId, total_count: totalCount, quantity: 1, customer_notify: 1, notes });

export const fetchSubscription = (id: string) => rzp<RzpSubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);

export const cancelSubscription = (id: string, atCycleEnd = true) =>
  rzp<RzpSubscription>("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
