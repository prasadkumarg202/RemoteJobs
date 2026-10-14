import Link from "next/link";
import type { Dict } from "@/lib/i18n";

export type SectionKey = "all" | "local" | "remote" | "ai" | "freelance" | "wfh" | "government";

export function SectionTabs({ current, t, counts }: { current: SectionKey; t: Dict; counts?: Record<string, number> }) {
  const tabs: Array<{ key: SectionKey; href: string; label: string; icon: string }> = [
    { key: "local", href: "/jobs/local", label: t.localJobs, icon: "📍" },
    { key: "remote", href: "/jobs/remote", label: t.remoteJobs, icon: "🌎" },
    { key: "ai", href: "/jobs/ai", label: t.aiJobsLong, icon: "🤖" },
    { key: "freelance", href: "/jobs/freelance", label: t.freelance, icon: "⚡" },
    { key: "wfh", href: "/jobs/work-from-home", label: t.wfh, icon: "🏠" },
    { key: "government", href: "/jobs/government", label: t.government, icon: "🏛" },
  ];
  return (
    <nav aria-label={t.jobs} className="scroll-x -mx-4 px-4">
      <ul className="flex gap-2">
        {tabs.map((tab) => {
          const on = tab.key === current;
          const n = counts?.[tab.key];
          return (
            <li key={tab.key} className="shrink-0">
              <Link href={tab.href} aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 t-small font-medium ${on ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:border-ink-faint"}`}>
                <span aria-hidden>{tab.icon}</span>{tab.label}
                {typeof n === "number" && <span className={`t-tiny ${on ? "text-paper/70" : "text-ink-faint"}`}>{n}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
