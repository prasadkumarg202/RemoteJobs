"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelAutoRenew, confirmCheckout, startCheckout } from "@/app/subscribe/actions";
import { fmt } from "@/lib/i18n";
import type { Plan } from "@/lib/access/server";
import { useI18n } from "./I18nProvider";

type RazorpayCtor = new (o: Record<string, unknown>) => { open: () => void; on: (e: string, f: () => void) => void };

function loadCheckout(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Razorpay failed to load")));
    s.onerror = () => reject(new Error("Razorpay failed to load"));
    document.body.appendChild(s);
  });
}

export function SubscribePlans({ plans, next, canCancel }: { plans: Plan[]; next: string; canCancel: boolean }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const best = plans.reduce<Plan | null>((b, p) => (!b || p.price_inr / p.interval_months < b.price_inr / b.interval_months ? p : b), null);

  const buy = async (plan: Plan) => {
    setBusy(plan.id); setMsg(null);
    const r = await startCheckout(plan.id);
    if (!r.ok) { setBusy(null); setMsg({ ok: false, text: r.message === "not_configured" ? t.paymentNotReady : r.message ?? t.paymentFailed }); return; }
    try {
      const Razorpay = await loadCheckout();
      const rz = new Razorpay({
        key: r.keyId, subscription_id: r.subscriptionId, name: "Mana Kosamu", description: `Jobs — ${r.planName}`,
        prefill: r.contact || r.email ? { ...(r.contact ? { contact: r.contact } : {}), ...(r.email ? { email: r.email } : {}) } : undefined, theme: { color: "#1c2566" },
        handler: async (resp: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
          const c = await confirmCheckout(resp);
          if (c.ok) { setMsg({ ok: true, text: t.paymentSuccess }); router.replace(next); router.refresh(); }
          else setMsg({ ok: false, text: c.message ?? t.paymentFailed });
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      rz.on("payment.failed", () => setMsg({ ok: false, text: t.paymentFailed }));
      rz.open();
    } catch (e) {
      setBusy(null); setMsg({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <div className="grid gap-4">
      <ul className="grid gap-3 sm:grid-cols-3">
        {plans.map((p) => {
          const monthly = Math.round(p.price_inr / p.interval_months);
          const highlight = best?.id === p.id && plans.length > 1;
          return (
            <li key={p.id} className={`flex flex-col rounded-2xl border bg-surface p-5 ${highlight ? "border-ink ring-2 ring-ink/15" : "border-line"}`}>
              <p className="font-semibold">{lang === "te" && p.name_te ? p.name_te : p.name}</p>
              <p className="mt-2 text-3xl font-bold" style={{ fontStretch: "110%" }}>₹{p.price_inr.toLocaleString("en-IN")}</p>
              <p className="t-small text-ink-soft">{p.interval_months === 1 ? t.billedMonthly : `₹${monthly}${t.perMonth} · ${fmt(t.billedEvery, { n: p.interval_months })}`}</p>
              <button onClick={() => buy(p)} disabled={!!busy || !p.razorpay_plan_id}
                className={`mt-4 min-h-12 rounded-full font-semibold disabled:opacity-50 ${highlight ? "bg-ink text-paper" : "border border-ink"}`}>
                {busy === p.id ? "…" : t.subscribeCta}
              </button>
            </li>
          );
        })}
      </ul>
      {plans.length > 0 && plans.every((p) => !p.razorpay_plan_id) && <p className="rounded-xl bg-turmeric-soft p-3 t-small text-turmeric-ink">{t.paymentNotReady}</p>}
      {msg && <p role="status" className={`rounded-xl p-3 t-small ${msg.ok ? "bg-leaf-soft text-leaf" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}
      {canCancel && (
        <button className="justify-self-start t-small text-ink-soft underline underline-offset-4" disabled={!!busy}
          onClick={async () => { const r = await cancelAutoRenew(); setMsg({ ok: r.ok, text: r.ok ? "OK" : r.message ?? "Error" }); router.refresh(); }}>
          {t.cancelSubscription}
        </button>
      )}
    </div>
  );
}
