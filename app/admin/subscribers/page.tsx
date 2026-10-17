import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO_MODE } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/supabase/server";
import { grantDays, resetDevice, revokeAccess, saveAccessSettings, saveAiSettings, savePlan } from "./actions";

export const metadata: Metadata = { title: "Subscribers", robots: { index: false } };
export const dynamic = "force-dynamic";

type Sub = { user_id: string; provider: string; status: string; current_end: string | null; cancel_at_period_end: boolean; plan_id: string | null; created_at: string };
type Dev = { user_id: string; device_label: string | null; bound_at: string; last_seen_at: string; changed_count: number };
type Prof = { id: string; phone: string | null; email: string | null; display_name: string | null; role: string };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—");
const input = "min-h-10 rounded-lg border border-line-strong bg-paper px-2";

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!DEMO_MODE && !(await isAdmin())) notFound();
  const a = supabaseAdmin();
  const q = ((await searchParams).q ?? "").replace(/[^0-9A-Za-z@._+-]/g, "").slice(0, 80);
  if (!a) return <p className="mx-auto max-w-3xl px-4 pt-8 text-ink-soft">Connect Supabase (with SUPABASE_SERVICE_ROLE_KEY) to manage subscribers.</p>;

  const nowIso = new Date().toISOString();
  const [{ data: setting }, { data: aiRow }, { data: plans }, { data: liveSubs }, { count: devices }] = await Promise.all([
    a.from("app_settings").select("value").eq("key", "access").maybeSingle(),
    a.from("app_settings").select("value").eq("key", "ai").maybeSingle(),
    a.from("subscription_plans").select("*").order("sort_order"),
    a.from("subscriptions").select("user_id,provider").gt("current_end", nowIso).neq("status", "created"),
    a.from("user_devices").select("user_id", { count: "exact", head: true }),
  ]);
  const s = (setting?.value ?? { mode: "subscription", trial_days: 3, device_change_cooldown_days: 30 }) as { mode: string; trial_days: number; device_change_cooldown_days: number; email_login?: boolean };
  const ai = (aiRow?.value ?? {}) as { assistant?: boolean; daily_questions?: number; min_similarity?: number };
  const paying = new Set((liveSubs ?? []).filter((x) => x.provider === "razorpay").map((x) => x.user_id)).size;
  const trials = new Set((liveSubs ?? []).filter((x) => x.provider === "trial").map((x) => x.user_id)).size;
  const envMode = (process.env.ACCESS_MODE ?? "subscription") === "open" ? "open" : "subscription";

  let profQ = a.from("profiles").select("id,phone,email,display_name,role").order("updated_at", { ascending: false }).limit(50);
  const qSafe = q.replace(/[^0-9A-Za-z@._+-]/g, "");
  if (qSafe) profQ = qSafe.includes("@") || /[a-z]/i.test(qSafe) ? profQ.ilike("email", `%${qSafe}%`) : profQ.ilike("phone", `%${qSafe}%`);
  const { data: profs } = await profQ;
  const ids = (profs ?? []).map((p) => p.id);
  const [{ data: subs }, { data: devs }] = ids.length
    ? await Promise.all([
        a.from("subscriptions").select("user_id,provider,status,current_end,cancel_at_period_end,plan_id,created_at").in("user_id", ids).neq("status", "created").order("current_end", { ascending: false, nullsFirst: false }),
        a.from("user_devices").select("user_id,device_label,bound_at,last_seen_at,changed_count").in("user_id", ids),
      ])
    : [{ data: [] as Sub[] }, { data: [] as Dev[] }];
  const latest = new Map<string, Sub>();
  for (const x of (subs ?? []) as Sub[]) if (!latest.has(x.user_id)) latest.set(x.user_id, x);
  const devBy = new Map(((devs ?? []) as Dev[]).map((d) => [d.user_id, d]));

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <Link href="/admin/jobs" className="t-small text-ink-soft underline underline-offset-4">← Jobs admin</Link>
      <h1 className="t-h1 mt-2">Subscribers</h1>
      <section className="mt-4 grid grid-cols-3 gap-3" aria-label="Totals">
        {[["Paying now", paying], ["On free trial", trials], ["Registered devices", devices ?? 0]].map(([k, v]) => (
          <div key={k as string} className="rounded-2xl border border-line bg-surface p-4"><span className="block text-3xl font-semibold">{v as number}</span><span className="t-small text-ink-soft">{k}</span></div>
        ))}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="grid content-start gap-6">
        <form action={saveAccessSettings} className="grid content-start gap-3 rounded-2xl border border-line bg-surface p-5 t-small">
          <h2 className="t-h3">Access settings</h2>
          <label className="grid gap-1">Mode
            <select name="mode" defaultValue={s.mode} className={input}><option value="subscription">Subscription required</option><option value="open">Open (free for everyone)</option></select></label>
          {s.mode !== envMode && <p className="rounded-lg bg-warn-soft p-2 text-warn">The website’s ACCESS_MODE env variable is “{envMode}”. Set both to the same value.</p>}
          <label className="grid gap-1">Free trial (days, 0 = none)<input name="trial_days" type="number" min={0} max={60} defaultValue={s.trial_days} className={input} /></label>
          <label className="grid gap-1">Self-service device change: once every (days)<input name="cooldown" type="number" min={0} max={365} defaultValue={s.device_change_cooldown_days} className={input} /></label>
          <label className="flex items-start gap-2"><input type="checkbox" name="email_login" defaultChecked={s.email_login === true} className="mt-1" />
            <span>Allow email + password sign-in (testing). Same one-device and plan rules. {process.env.EMAIL_LOGIN ? <b>EMAIL_LOGIN={process.env.EMAIL_LOGIN} in the website env overrides this.</b> : null}</span></label>
          <button className="min-h-11 justify-self-start rounded-full bg-ink px-5 font-medium text-paper">Save settings</button>
        </form>
        <form action={saveAiSettings} className="grid content-start gap-3 rounded-2xl border border-line bg-surface p-5 t-small">
          <h2 className="t-h3">AI: smart search &amp; Ask AI</h2>
          <p className="text-ink-soft">
            Smart search: {process.env.VOYAGE_API_KEY || process.env.OPENAI_API_KEY ? "key set ✓" : "off — add VOYAGE_API_KEY (or OPENAI_API_KEY)"} ·
            Ask AI answers: {process.env.ANTHROPIC_API_KEY ? "key set ✓" : "off — add ANTHROPIC_API_KEY"}
          </p>
          <label className="flex items-center gap-2"><input type="checkbox" name="assistant" defaultChecked={ai.assistant !== false} /> Ask AI answers on</label>
          <label className="grid gap-1">Questions per user per day<input name="daily_questions" type="number" min={0} max={500} defaultValue={ai.daily_questions ?? 20} className={input} /></label>
          <label className="grid gap-1">Smart search strictness (0.1 loose – 0.9 strict)<input name="min_similarity" type="number" step="0.05" min={0.1} max={0.9} defaultValue={ai.min_similarity ?? 0.4} className={input} /></label>
          <button className="min-h-11 justify-self-start rounded-full bg-ink px-5 font-medium text-paper">Save AI settings</button>
        </form>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 t-small">
          <h2 className="t-h3">Plans</h2>
          <p className="mt-1 text-ink-soft">Create each plan in Razorpay Dashboard → Subscriptions → Plans (same price and period), then paste its <code>plan_…</code> id here. Plans without an id can’t be bought.</p>
          <ul className="mt-3 grid gap-2">
            {[...(plans ?? []), { id: "", name: "", name_te: "", price_inr: 0, interval_months: 1, razorpay_plan_id: "", active: false, sort_order: 9 }].map((p) => (
              <li key={p.id || "new"}>
                <form action={savePlan} className="flex flex-wrap items-center gap-2">
                  <input name="id" defaultValue={p.id} readOnly={!!p.id} placeholder="new-plan-id" className={`${input} w-28`} />
                  <input name="name" defaultValue={p.name} placeholder="Name" className={`${input} w-28`} />
                  <input name="name_te" defaultValue={p.name_te ?? ""} placeholder="తెలుగు" className={`${input} w-24`} />
                  <label className="flex items-center gap-1">₹<input name="price_inr" type="number" min={1} defaultValue={p.price_inr || ""} className={`${input} w-20`} /></label>
                  <label className="flex items-center gap-1"><input name="interval_months" type="number" min={1} max={24} defaultValue={p.interval_months} className={`${input} w-14`} />mo</label>
                  <input name="razorpay_plan_id" defaultValue={p.razorpay_plan_id ?? ""} placeholder="plan_XXXXXXXX" className={`${input} w-40 font-mono`} />
                  <input type="hidden" name="sort_order" value={p.sort_order} />
                  <label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={p.active} /> Active</label>
                  <button className="min-h-10 rounded-full border border-line-strong px-3">{p.id ? "Save" : "Add"}</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-8">
        <form className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="t-h2">Users</h2>
          <label className="flex items-center gap-2 t-small">Search phone or email<input name="q" defaultValue={q} placeholder="98765… or name@" className={input} /><button className="min-h-10 rounded-full border border-line-strong px-3">Search</button></label>
        </form>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface px-4">
          <table className="w-full min-w-[960px] text-left t-small">
            <thead className="text-ink-faint"><tr><th className="py-3 font-medium">Phone</th><th className="font-medium">Access</th><th className="font-medium">Device</th><th className="font-medium">Actions</th></tr></thead>
            <tbody>
              {((profs ?? []) as Prof[]).map((p) => {
                const sub = latest.get(p.id);
                const dev = devBy.get(p.id);
                const live = sub?.current_end && Date.parse(sub.current_end) > Date.now();
                return (
                  <tr key={p.id} className="border-t border-line align-top">
                    <td className="py-3 pr-3"><p className="font-semibold">{p.phone ? `+${p.phone.replace(/^\+/, "")}` : p.email ?? "—"}</p>{p.phone && p.email && <p className="t-tiny text-ink-soft">{p.email}</p>}<p className="t-tiny text-ink-faint">{p.display_name ?? ""} {p.role !== "user" ? `· ${p.role}` : ""}</p></td>
                    <td className="py-3 pr-3">
                      {sub ? <><span className={`rounded-full px-2 py-0.5 t-tiny ${live ? "bg-leaf-soft text-leaf" : "bg-closed-soft text-ink-soft"}`}>{sub.provider} · {sub.status}</span>
                        <p className="mt-1 t-tiny text-ink-soft">until {when(sub.current_end)}{sub.cancel_at_period_end ? " · auto-renew off" : ""}{sub.plan_id ? ` · ${sub.plan_id}` : ""}</p></> : <span className="text-ink-faint">None</span>}
                    </td>
                    <td className="py-3 pr-3">{dev ? <><p>{dev.device_label ?? "Unknown"}</p><p className="t-tiny text-ink-faint">since {when(dev.bound_at)} · seen {when(dev.last_seen_at)} · moved {dev.changed_count}×</p></> : <span className="text-ink-faint">Not registered</span>}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {dev && <form action={resetDevice}><input type="hidden" name="user_id" value={p.id} /><button className="min-h-10 rounded-full border border-line-strong px-3" title="Their next sign-in registers the new device">Reset device</button></form>}
                        <form action={grantDays} className="flex items-center gap-1"><input type="hidden" name="user_id" value={p.id} /><input name="days" type="number" min={1} max={3650} defaultValue={30} className={`${input} w-16`} /><button className="min-h-10 rounded-full border border-line-strong px-3">Grant days</button></form>
                        {live && sub?.provider !== "razorpay" && <form action={revokeAccess}><input type="hidden" name="user_id" value={p.id} /><button className="min-h-10 rounded-full border border-line-strong px-3 text-warn">End trial/grant</button></form>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
