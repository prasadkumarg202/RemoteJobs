"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { importDeviceSaved } from "@/app/jobs/actions";
import { deviceSaved } from "@/lib/client/device-store";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Phone OTP (primary, for Indian mobile users) or email magic link — both via Supabase Auth. */
export function LoginForm({ next = "/jobs" }: { next?: string }) {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"enter" | "verify" | "sent">("enter");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!sb) return <p className="rounded-2xl bg-turmeric-soft p-4 text-turmeric-ink">Sign-in needs Supabase. Add your project keys to .env.local.</p>;

  const e164 = () => { const d = phone.replace(/\D/g, ""); return d.length === 10 ? `+91${d}` : `+${d}`; };
  const afterLogin = async () => { await importDeviceSaved(deviceSaved.all()).catch(() => undefined); router.replace(next); router.refresh(); };

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await sb.auth.signInWithOtp({ phone: e164() });
    setBusy(false);
    if (error) setMsg(error.message); else setStep("verify");
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await sb.auth.verifyOtp({ phone: e164(), token: otp, type: "sms" });
    setBusy(false);
    if (error) setMsg("That code didn’t work. Check the 6 digits or request a new code."); else afterLogin();
  };
  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    setBusy(false);
    if (error) setMsg(error.message); else setStep("sent");
  };

  const input = "min-h-14 w-full rounded-2xl border border-line-strong bg-surface px-4 text-lg focus:border-ink focus:outline-none";
  const primary = "min-h-14 w-full rounded-full bg-ink font-semibold text-paper disabled:opacity-60";
  return (
    <div className="grid gap-4">
      <div role="tablist" className="grid grid-cols-2 rounded-full border border-line bg-surface p-1">
        {(["phone", "email"] as const).map((m) => (
          <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => { setMode(m); setStep("enter"); setMsg(null); }}
            className={`min-h-11 rounded-full font-medium ${mode === m ? "bg-ink text-paper" : "text-ink-soft"}`}>{m === "phone" ? "Mobile number" : "Email"}</button>
        ))}
      </div>
      {mode === "phone" && step === "enter" && (
        <form onSubmit={sendOtp} className="grid gap-3">
          <label className="grid gap-1.5"><span className="t-small font-medium">Mobile number</span>
            <input className={input} type="tel" inputMode="numeric" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={10} /></label>
          <button className={primary} disabled={busy}>Send OTP</button>
        </form>
      )}
      {mode === "phone" && step === "verify" && (
        <form onSubmit={verify} className="grid gap-3">
          <label className="grid gap-1.5"><span className="t-small font-medium">6-digit code sent to {e164()}</span>
            <input className={`${input} tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} required /></label>
          <button className={primary} disabled={busy || otp.length < 6}>Verify and sign in</button>
          <button type="button" className="t-small underline" onClick={() => setStep("enter")}>Change number</button>
        </form>
      )}
      {mode === "email" && step !== "sent" && (
        <form onSubmit={sendLink} className="grid gap-3">
          <label className="grid gap-1.5"><span className="t-small font-medium">Email</span>
            <input className={input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <button className={primary} disabled={busy}>Email me a sign-in link</button>
        </form>
      )}
      {mode === "email" && step === "sent" && <p className="rounded-2xl bg-leaf-soft p-4 text-leaf">Check {email} for a sign-in link.</p>}
      {msg && <p role="alert" className="rounded-xl bg-warn-soft p-3 t-small text-warn">{msg}</p>}
    </div>
  );
}
