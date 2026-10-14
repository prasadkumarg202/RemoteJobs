"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { setHidden } from "@/app/jobs/actions";
import { deviceHidden } from "@/lib/client/device-store";
import { track } from "@/lib/client/track";
import { useI18n } from "./I18nProvider";
import { IconClose, IconEyeOff, IconFlag, IconLink, IconShare, IconWhatsapp } from "./icons";
import { SaveButton } from "./SaveButton";

export function JobActions({ jobId, title, company, url, initialSaved }: { jobId: string; title: string; company: string; url: string; initialSaved: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [hidden, setHiddenState] = useState(false);
  const [, start] = useTransition();
  const reportRef = useRef<HTMLDialogElement>(null);
  const shareText = `${title} — ${company}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${url}`)}`;

  const nativeShare = async () => {
    track("share_job", { job_id: jobId, filters: { channel: "native" } });
    if (navigator.share) {
      try { await navigator.share({ title: shareText, url }); } catch { /* dismissed */ }
    } else copy();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
    track("share_job", { job_id: jobId, filters: { channel: "copy" } });
  };
  const hide = (on: boolean) => start(async () => {
    const res = await setHidden(jobId, on).catch(() => ({ ok: false as const }));
    if (!res.ok) (on ? deviceHidden.add(jobId) : deviceHidden.remove(jobId));
    setHiddenState(on);
    if (on) track("hide_job", { job_id: jobId });
  });

  const btn = "inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-medium";
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <SaveButton jobId={jobId} initialSaved={initialSaved} variant="button" />
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => track("share_job", { job_id: jobId, filters: { channel: "whatsapp" } })}
          className={`${btn} border-[#25D366] text-[#128C4B]`}><IconWhatsapp /> {t.whatsappShare}</a>
        <button type="button" onClick={nativeShare} className={btn}><IconShare /> {t.share}</button>
        <button type="button" onClick={copy} className={btn} aria-live="polite"><IconLink /> {copied ? t.linkCopied : t.copyLink}</button>
      </div>
      <div className="mt-3 flex gap-4 t-small text-ink-soft">
        <button type="button" onClick={() => reportRef.current?.showModal()} className="inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:underline"><IconFlag className="h-4 w-4" /> {t.report}</button>
        <button type="button" onClick={() => hide(true)} className="inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:underline"><IconEyeOff className="h-4 w-4" /> {t.hide}</button>
      </div>
      {hidden && (
        <p role="status" className="mt-2 flex items-center gap-3 rounded-xl bg-closed-soft px-4 py-3 t-small">
          {t.hidden}
          <button type="button" onClick={() => hide(false)} className="font-semibold underline">{t.undo}</button>
          <button type="button" onClick={() => router.back()} className="ml-auto font-semibold">{t.close}</button>
        </p>
      )}
      <ReportDialog dialogRef={reportRef} jobId={jobId} />
    </div>
  );
}

function ReportDialog({ dialogRef, jobId }: { dialogRef: React.RefObject<HTMLDialogElement | null>; jobId: string }) {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const reasons: Array<[string, string]> = [
    ["suspicious", t.reasonSuspicious], ["expired", t.reasonExpired], ["wrong_info", t.reasonWrong],
    ["duplicate", t.reasonDuplicate], ["offensive", t.reasonOffensive], ["other", t.reasonOther],
  ];
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/jobs/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job_id: jobId, reason: fd.get("reason"), details: fd.get("details") }) });
    setBusy(false);
    if (res.ok) { setSent(true); track("report_job", { job_id: jobId }); }
  };
  return (
    <dialog ref={dialogRef} aria-label={t.reportTitle} className="m-auto w-[min(92vw,460px)] rounded-2xl bg-surface p-0 text-ink backdrop:bg-ink/40">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="t-h3">{t.reportTitle}</h2>
        <button type="button" onClick={() => dialogRef.current?.close()} aria-label={t.close} className="grid h-11 w-11 place-items-center"><IconClose /></button>
      </div>
      {sent ? (
        <p className="p-5" role="status">{t.reportSent}</p>
      ) : (
        <form onSubmit={submit} className="grid gap-2 p-5">
          {reasons.map(([v, label], i) => (
            <label key={v} className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3">
              <input type="radio" name="reason" value={v} defaultChecked={i === 0} className="h-5 w-5 accent-[var(--color-ink)]" /> {label}
            </label>
          ))}
          <textarea name="details" maxLength={1000} rows={3} className="mt-1 rounded-xl border border-line p-3" aria-label={t.reasonOther} />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className="min-h-12 flex-1 rounded-full border border-line-strong">{t.cancel}</button>
            <button type="submit" disabled={busy} className="min-h-12 flex-1 rounded-full bg-ink font-semibold text-paper">{t.sendReport}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
