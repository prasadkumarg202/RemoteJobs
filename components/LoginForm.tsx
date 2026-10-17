"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { bindDevice } from "@/app/device/actions";
import { importDeviceSaved } from "@/app/jobs/actions";
import { fmt } from "@/lib/i18n";
import { getDeviceId, setDeviceId } from "@/lib/client/device-id";
import { deviceSaved } from "@/lib/client/device-store";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useI18n } from "./I18nProvider";

type OTPCredentialLike = Credential & { code: string };
const RESEND_SECONDS = 30;

/**
 * Mobile-number OTP sign-in (Supabase Auth). The code is read from the SMS automatically:
 *  - Android Chrome: WebOTP API (the SMS must end with "@<your domain> #<code>", see docs/SUBSCRIPTIONS.md)
 *  - iPhone Safari: autocomplete="one-time-code" offers the code above the keyboard
 * The form submits itself once 6 digits are in. After sign-in this browser is bound as the account's device.
 */
export function LoginForm({ next = "/jobs", emailLogin = false }: { next?: string; emailLogin?: boolean }) {
  const sb = supabaseBrowser();
  const router = useRouter();
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"enter" | "verify">("enter");
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [emailMode, setEmailMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const verifying = useRef(false);

  const e164 = () => { const d = phone.replace(/\D/g, ""); return d.length === 10 ? `+91${d}` : `+${d}`; };

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const verify = async (code: string) => {
    if (!sb || verifying.current || code.length !== 6) return;
    verifying.current = true; setBusy(true); setMsg(null);
    const { error } = await sb.auth.verifyOtp({ phone: e164(), token: code, type: "sms" });
    if (error) { setBusy(false); verifying.current = false; setMsg(t.otpInvalid); return; }
    await afterSignIn();
  };

  /** Registers this browser as the account's device, then goes on (or to /device, /subscribe). */
  const afterSignIn = async () => {
    const r = await bindDevice(getDeviceId()).catch(() => ({ gate: "error" as const, message: "Network error", deviceId: undefined }));
    if (r.deviceId) setDeviceId(r.deviceId);
    await importDeviceSaved(deviceSaved.all()).catch(() => undefined);
    const q = `?next=${encodeURIComponent(next)}`;
    const dest = r.gate === "blocked" ? `/device${q}&blocked=1` : r.gate === "subscribe" ? `/subscribe${q}` : r.gate === "error" ? `/device${q}` : next;
    router.replace(dest);
    router.refresh();
  };

  // WebOTP: wait for the SMS while the code screen is open.
  useEffect(() => {
    if (step !== "verify" || typeof window === "undefined" || !("OTPCredential" in window)) return;
    const ac = new AbortController();
    (navigator.credentials.get({ otp: { transport: ["sms"] }, signal: ac.signal } as CredentialRequestOptions) as Promise<OTPCredentialLike | null>)
      .then((cred) => { if (cred?.code) { setOtp(cred.code); void verify(cred.code); } })
      .catch(() => undefined);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!sb) return <p className="rounded-2xl bg-turmeric-soft p-4 text-turmeric-ink">Sign-in needs Supabase. Add your project keys to .env.local.</p>;

  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await sb.auth.signInWithOtp({ phone: e164(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setMsg(error.message); else { setStep("verify"); setOtp(""); setWait(RESEND_SECONDS); }
  };


  const emailSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null); setInfo(null);
    const addr = email.trim().toLowerCase();
    if (emailMode === "signup") {
      const { data, error } = await sb.auth.signUp({ email: addr, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
      if (error) { setBusy(false); setMsg(error.message); return; }
      // With "confirm email" on, there is no session yet: the user clicks the link in the email first.
      if (!data.session) { setBusy(false); setInfo(fmt(t.emailConfirmSent, { email: addr })); return; }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email: addr, password });
      if (error) { setBusy(false); setMsg(/confirm/i.test(error.message) ? t.emailNotConfirmed : t.emailWrongPassword); return; }
    }
    await afterSignIn();
  };

  const resetPassword = async () => {
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { setMsg(t.emailEnterFirst); return; }
    setBusy(true); setMsg(null);
    const { error } = await sb.auth.resetPasswordForEmail(addr, { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/account/password")}` });
    setBusy(false);
    if (error) setMsg(error.message); else setInfo(fmt(t.emailResetSent, { email: addr }));
  };

  const input = "min-h-14 w-full rounded-2xl border border-line-strong bg-surface px-4 text-lg focus:border-ink focus:outline-none";
  const primary = "min-h-14 w-full rounded-full bg-ink font-semibold text-paper disabled:opacity-60";
  const tab = (m: "phone" | "email", label: string) => (
    <button type="button" role="tab" aria-selected={method === m} onClick={() => { setMethod(m); setMsg(null); setInfo(null); }}
      className={`min-h-11 flex-1 rounded-full t-small font-medium ${method === m ? "bg-ink text-paper" : "text-ink-soft"}`}>{label}</button>
  );
  return (
    <div className="grid gap-4">
      {emailLogin && (
        <div role="tablist" aria-label={t.signInWith} className="flex gap-1 rounded-full border border-line bg-surface p-1">
          {tab("phone", t.signInMobile)}{tab("email", t.signInEmail)}
        </div>
      )}
      {method === "email" && emailLogin && (
        <form onSubmit={emailSubmit} className="grid gap-3">
          <label className="grid gap-1.5"><span className="t-small font-medium">{t.emailAddress}</span>
            <input className={input} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} /></label>
          <label className="grid gap-1.5"><span className="t-small font-medium">{t.password}</span>
            <input className={input} type="password" autoComplete={emailMode === "signup" ? "new-password" : "current-password"} value={password}
              onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={72} />
            {emailMode === "signup" && <span className="t-tiny text-ink-faint">{t.passwordHint}</span>}</label>
          <button className={primary} disabled={busy || !email || password.length < 8}>{emailMode === "signup" ? t.createAccount : t.signIn}</button>
          <div className="flex flex-wrap items-center justify-between gap-2 t-small">
            <button type="button" className="underline underline-offset-4" onClick={() => { setEmailMode(emailMode === "signup" ? "signin" : "signup"); setMsg(null); setInfo(null); }}>
              {emailMode === "signup" ? t.haveAccount : t.newHere}</button>
            {emailMode === "signin" && <button type="button" className="underline underline-offset-4" onClick={resetPassword} disabled={busy}>{t.forgotPassword}</button>}
          </div>
          <p className="t-tiny text-ink-faint">{t.emailTestingNote}</p>
        </form>
      )}
      {method === "phone" && step === "enter" && (
        <form onSubmit={sendOtp} className="grid gap-3">
          <label className="grid gap-1.5"><span className="t-small font-medium">{t.mobileNumber}</span>
            <span className="flex items-center gap-2">
              <span className="grid min-h-14 place-items-center rounded-2xl border border-line bg-paper px-3 text-lg text-ink-soft">+91</span>
              <input className={input} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, "").slice(0, 12))} required pattern="[6-9][0-9 ]{9,11}" />
            </span></label>
          <button className={primary} disabled={busy || phone.replace(/\D/g, "").length !== 10}>{t.sendOtp}</button>
        </form>
      )}
      {method === "phone" && step === "verify" && (
        <form onSubmit={(e) => { e.preventDefault(); void verify(otp); }} className="grid gap-3">
          <label className="grid gap-1.5"><span className="t-small font-medium">{fmt(t.otpSentTo, { phone: e164() })}</span>
            <input className={`${input} text-center tracking-[0.5em]`} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
              value={otp} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setOtp(v); if (v.length === 6) void verify(v); }} required /></label>
          <p className="t-tiny text-ink-faint">{t.otpAutoHint}</p>
          <button className={primary} disabled={busy || otp.length < 6}>{t.verifySignIn}</button>
          <div className="flex items-center justify-between t-small">
            <button type="button" className="underline underline-offset-4" onClick={() => { setStep("enter"); setMsg(null); }}>{t.changeNumber}</button>
            {wait > 0 ? <span className="text-ink-faint">{fmt(t.resendIn, { s: wait })}</span>
              : <button type="button" className="underline underline-offset-4" onClick={() => sendOtp()} disabled={busy}>{t.resendOtp}</button>}
          </div>
        </form>
      )}
      {info && <p role="status" className="rounded-xl bg-leaf-soft p-3 t-small text-leaf">{info}</p>}
      {msg && <p role="alert" className="rounded-xl bg-warn-soft p-3 t-small text-warn">{msg}</p>}
    </div>
  );
}
