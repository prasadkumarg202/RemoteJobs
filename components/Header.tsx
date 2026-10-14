import Link from "next/link";
import { DEMO_MODE } from "@/lib/env";
import { getDict } from "@/lib/i18n-server";
import { currentProfile } from "@/lib/supabase/server";
import { LangToggle } from "./LangToggle";

export async function Header() {
  const { t } = await getDict();
  const profile = await currentProfile();
  const nav = [
    { href: "/jobs/local", label: t.localJobs },
    { href: "/jobs/remote", label: t.remoteJobs },
    { href: "/jobs/ai", label: t.aiJobsLong },
    { href: "/jobs/freelance", label: t.freelance },
    { href: "/jobs/work-from-home", label: t.wfh },
    { href: "/jobs/government", label: t.government },
  ];
  return (
    <header className="border-b border-line bg-surface">
      {DEMO_MODE && <p className="bg-turmeric-soft px-4 py-1.5 text-center t-tiny text-turmeric-ink">{t.demoBanner}</p>}
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/jobs" className="flex items-baseline gap-2 whitespace-nowrap" aria-label="Mana Kosamu Jobs">
          <span className="text-[1.375rem] font-bold leading-none tracking-tight" style={{ fontStretch: "125%" }}>{t.brand}</span>
          <span className="t-small text-ink-soft t-condensed">{t.jobs}</span>
        </Link>
        <nav aria-label="Jobs" className="ml-6 hidden 2xl:block">
          <ul className="flex gap-1 t-small">
            {nav.map((n) => (
              <li key={n.href}><Link href={n.href} className="whitespace-nowrap rounded-lg px-2.5 py-2 text-ink-soft hover:bg-paper hover:text-ink">{n.label}</Link></li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LangToggle />
          <Link href="/jobs/post" className="hidden min-h-10 items-center whitespace-nowrap rounded-full border border-ink px-4 t-small font-medium sm:flex">{t.postJob}</Link>
          {profile ? (
            <Link href="/profile" className="hidden min-h-10 items-center whitespace-nowrap rounded-full bg-ink px-4 t-small text-paper md:flex">{t.profile}</Link>
          ) : (
            <Link href="/login" className="hidden min-h-10 items-center whitespace-nowrap rounded-full bg-ink px-4 t-small text-paper md:flex">{t.signIn}</Link>
          )}
        </div>
      </div>
    </header>
  );
}
