"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { IconBookmark, IconBriefcase, IconHome, IconSpark, IconUser } from "./icons";

export function BottomNav() {
  const { t } = useI18n();
  const path = usePathname();
  const items = [
    { href: "/", label: t.home, Icon: IconHome, active: path === "/" },
    { href: "/jobs", label: t.jobs, Icon: IconBriefcase, active: path.startsWith("/jobs") && !path.startsWith("/jobs/ai") && !path.startsWith("/jobs/saved") },
    { href: "/jobs/ai", label: t.aiJobs, Icon: IconSpark, active: path.startsWith("/jobs/ai") },
    { href: "/jobs/saved", label: t.saved, Icon: IconBookmark, active: path.startsWith("/jobs/saved") },
    { href: "/profile", label: t.profile, Icon: IconUser, active: path.startsWith("/profile") || path.startsWith("/login") },
  ];
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ href, label, Icon, active }) => (
          <li key={href}>
            <Link href={href} aria-current={active ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-0.5 t-tiny t-condensed ${active ? "text-ink font-semibold" : "text-ink-faint"}`}>
              <Icon className={`h-6 w-6 ${active ? "text-ink" : ""}`} />
              <span className="leading-none">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
