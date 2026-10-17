import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AFFILIATE_CATALOG, envLinks, PLACEMENTS, type Placement } from "@/lib/affiliates/catalog";
import { getAllAffiliateRows } from "@/lib/affiliates/data";
import { DEMO_MODE } from "@/lib/env";
import { isAdmin, supabaseServer } from "@/lib/supabase/server";
import { saveAffiliate } from "../actions";

export const metadata: Metadata = { title: "Affiliate partners", robots: { index: false } };
export const dynamic = "force-dynamic";

const PLACEMENT_LABEL: Record<Placement, string> = {
  remote: "Remote pages", ai: "AI pages", freelance: "Freelance page", wfh: "Work from home", job: "Job detail sidebar", post: "Post-a-job page",
};

type Clicks = Record<string, { total: number; by_placement: Record<string, number> }>;

export default async function AffiliatesAdminPage() {
  if (!DEMO_MODE && !(await isAdmin())) notFound();
  const rows = await getAllAffiliateRows();
  const env = envLinks(process.env);
  const sb = await supabaseServer();
  const clicks: Clicks = sb ? (((await sb.rpc("admin_affiliate_clicks", { p_days: 30 })).data as Clicks | null) ?? {}) : {};

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6">
      <Link href="/admin/jobs" className="t-small text-ink-soft underline underline-offset-4">← Jobs admin</Link>
      <h1 className="t-h1 mt-2">Affiliate partners</h1>
      <div className="mt-3 max-w-[70ch] t-small text-ink-soft">
        <p>1. Join the partner’s programme with the sign-up link. 2. Once approved, copy your personal tracking link from their dashboard. 3. Paste it here and tick <b>Show on site</b>.</p>
        <p className="mt-2">Partners appear as a “Sponsored” block with a commission disclosure (required by ASCI in India). Links go through <code>/out/&lt;partner&gt;</code> so clicks are counted. Nothing is shown for a partner until it has a link.</p>
        {DEMO_MODE && <p className="mt-2 rounded-lg bg-turmeric-soft p-3 text-turmeric-ink">Demo mode: saving is off. You can still test with environment variables such as <code>AFFILIATE_URL_FIVERR=https://…</code>.</p>}
      </div>

      <ul className="mt-6 grid gap-4">
        {AFFILIATE_CATALOG.map((p) => {
          const row = rows[p.slug];
          const fromEnv = !row?.url && env[p.slug]?.url;
          const live = (row?.enabled && row.url) || fromEnv;
          const current = (row?.placements as Placement[] | null) ?? p.placements;
          const c = clicks[p.slug];
          return (
            <li key={p.slug} className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="t-h3">{p.name} <span className={`ml-2 rounded-full px-2 py-0.5 t-tiny align-middle ${live ? "bg-leaf-soft text-leaf" : "bg-closed-soft text-ink-soft"}`}>{live ? (fromEnv ? "Live (env)" : "Live") : "Hidden"}</span></p>
                  <p className="mt-1 t-small text-ink-soft">{p.program.pays}</p>
                  <p className="mt-1 t-tiny text-ink-faint">Network: {p.program.network} · <a href={p.program.signup} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Join programme ↗</a></p>
                </div>
                <p className="t-small text-ink-soft">{c ? `${c.total} clicks / 30 days` : "0 clicks / 30 days"}</p>
              </div>
              <form action={saveAffiliate} className="mt-4 grid gap-3">
                <input type="hidden" name="slug" value={p.slug} />
                <label className="grid gap-1 t-small">
                  <span className="font-medium">Your tracking link</span>
                  <input name="url" type="url" inputMode="url" placeholder="https://…" defaultValue={row?.url ?? ""} pattern="https://.*" disabled={DEMO_MODE}
                    className="min-h-11 rounded-lg border border-line-strong bg-paper px-3" />
                </label>
                <fieldset className="flex flex-wrap gap-x-4 gap-y-2 t-small">
                  <legend className="mb-1 font-medium">Show on</legend>
                  {PLACEMENTS.map((pl) => (
                    <label key={pl} className="inline-flex min-h-10 items-center gap-2">
                      <input type="checkbox" name="placements" value={pl} defaultChecked={current.includes(pl)} disabled={DEMO_MODE} /> {PLACEMENT_LABEL[pl]}
                    </label>
                  ))}
                </fieldset>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex min-h-10 items-center gap-2 t-small font-medium">
                    <input type="checkbox" name="enabled" defaultChecked={!!row?.enabled} disabled={DEMO_MODE} /> Show on site
                  </label>
                  <input name="note" placeholder="Note (e.g. approved 14 Oct, Impact ID)" defaultValue={row?.note ?? ""} disabled={DEMO_MODE}
                    className="min-h-10 flex-1 rounded-lg border border-line bg-paper px-3 t-small" />
                  <button disabled={DEMO_MODE} className="min-h-11 rounded-full bg-ink px-5 font-medium text-paper disabled:opacity-40">Save</button>
                </div>
                {c && Object.keys(c.by_placement).length > 0 && (
                  <p className="t-tiny text-ink-faint">By placement: {Object.entries(c.by_placement).map(([k, v]) => `${PLACEMENT_LABEL[k as Placement] ?? k} ${v}`).join(", ")}</p>
                )}
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
