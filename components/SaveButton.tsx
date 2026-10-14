"use client";
import { useEffect, useState, useTransition } from "react";
import { toggleSaveJob } from "@/app/jobs/actions";
import { deviceSaved } from "@/lib/client/device-store";
import { track } from "@/lib/client/track";
import { useI18n } from "./I18nProvider";
import { IconBookmark, IconBookmarkFilled } from "./icons";

export function SaveButton({ jobId, initialSaved = false, variant = "icon" }: { jobId: string; initialSaved?: boolean; variant?: "icon" | "button" }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, start] = useTransition();
  useEffect(() => { if (!initialSaved && deviceSaved.has(jobId)) setSaved(true); }, [jobId, initialSaved]);

  const onClick = () => start(async () => {
    const res = await toggleSaveJob(jobId).catch(() => ({ ok: false as const, reason: "error" as const }));
    // Signed-out (or demo): keep it on this device.
    const on = res.ok ? !!res.on : deviceSaved.toggle(jobId);
    setSaved(on);
    if (on) track("save_job", { job_id: jobId });
  });

  const label = saved ? t.savedLabel : t.save;
  if (variant === "button") {
    return (
      <button type="button" onClick={onClick} disabled={pending} aria-pressed={saved}
        className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-5 font-medium ${saved ? "border-ink bg-ink text-paper" : "border-line-strong bg-surface text-ink"}`}>
        {saved ? <IconBookmarkFilled /> : <IconBookmark />} {label}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={pending} aria-pressed={saved} aria-label={label} title={label}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${saved ? "text-ink" : "text-ink-faint hover:text-ink"}`}>
      {saved ? <IconBookmarkFilled className="h-6 w-6" /> : <IconBookmark className="h-6 w-6" />}
    </button>
  );
}
