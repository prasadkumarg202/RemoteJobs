"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { deviceSaved } from "@/lib/client/device-store";
import { useI18n } from "./I18nProvider";

type Mini = { id: string; slug: string; title: string; company_name: string; source_name: string };

export function DeviceSavedList({ exclude }: { exclude: string[] }) {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<Mini[] | null>(null);
  useEffect(() => {
    const load = () => {
      const ids = deviceSaved.all().filter((id) => !exclude.includes(id));
      if (!ids.length) return setJobs([]);
      fetch(`/api/jobs/cards?ids=${ids.join(",")}`).then((r) => r.json()).then((d) => setJobs(d.jobs)).catch(() => setJobs([]));
    };
    load();
    window.addEventListener("mk-store", load);
    return () => window.removeEventListener("mk-store", load);
  }, [exclude]);
  if (!jobs?.length) return null;
  return (
    <section className="mt-8">
      <h2 className="t-h3">{t.savedOnDevice}</h2>
      <ul className="mt-3 grid gap-2">
        {jobs.map((j) => (
          <li key={j.id}>
            <Link href={`/jobs/${j.slug}`} className="block rounded-2xl border border-line bg-surface p-4 hover:border-ink-faint">
              <span className="t-h3 block">{j.title}</span>
              <span className="t-small text-ink-soft">{j.company_name}</span>
              <span className="mt-1 block t-tiny text-ink-faint">{t.source}: {j.source_name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
