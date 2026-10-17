"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useI18n } from "./I18nProvider";

export function PasswordForm() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!sb) return null;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else { setMsg({ ok: true, text: t.passwordSaved }); setTimeout(() => router.replace("/jobs"), 1200); }
  };
  return (
    <form onSubmit={save} className="grid gap-3">
      <label className="grid gap-1.5"><span className="t-small font-medium">{t.newPassword}</span>
        <input type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={(e) => setPassword(e.target.value)}
          className="min-h-14 w-full rounded-2xl border border-line-strong bg-surface px-4 text-lg focus:border-ink focus:outline-none" />
        <span className="t-tiny text-ink-faint">{t.passwordHint}</span></label>
      <button disabled={busy || password.length < 8} className="min-h-14 w-full rounded-full bg-ink font-semibold text-paper disabled:opacity-60">{t.savePassword}</button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl p-3 t-small ${msg.ok ? "bg-leaf-soft text-leaf" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}
    </form>
  );
}
