"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { bindDevice, moveDevice, type DeviceResult } from "@/app/device/actions";
import { fmt } from "@/lib/i18n";
import { getDeviceId, setDeviceId } from "@/lib/client/device-id";
import { useI18n } from "./I18nProvider";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export function DeviceGate({ next }: { next: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [r, setR] = useState<DeviceResult | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (res: DeviceResult) => {
    if (res.deviceId) setDeviceId(res.deviceId);
    if (res.gate === "allow") { router.replace(next); router.refresh(); return; }
    if (res.gate === "subscribe") { router.replace(`/subscribe?next=${encodeURIComponent(next)}`); return; }
    if (res.gate === "login") { router.replace(`/login?next=${encodeURIComponent(next)}`); return; }
    setR(res);
  };

  useEffect(() => { bindDevice(getDeviceId()).then(go).catch(() => setR({ gate: "error", message: "Network error. Check your connection and reload." })); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!r) return <p className="text-ink-soft" role="status">{t.checkingDevice}</p>;
  if (r.gate === "error") return <p role="alert" className="rounded-xl bg-warn-soft p-4 text-warn">{r.message}</p>;

  const canMove = !r.canMoveAt || new Date(r.canMoveAt).getTime() <= Date.now();
  return (
    <div className="grid gap-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="t-h2">{t.deviceBlockedTitle}</h2>
      <p className="text-ink-soft">{fmt(t.deviceBlockedBody, { device: r.deviceLabel ?? "another device" })}</p>
      {canMove ? (
        <button disabled={busy} onClick={async () => { setBusy(true); go(await moveDevice(getDeviceId())); setBusy(false); }}
          className="min-h-12 justify-self-start rounded-full bg-ink px-6 font-semibold text-paper disabled:opacity-50">{t.moveToThisDevice}</button>
      ) : (
        <p className="rounded-xl bg-turmeric-soft p-3 t-small text-turmeric-ink">{fmt(t.moveAfter, { date: day(r.canMoveAt!) })} <Link href="/contact" className="underline">{t.contactUs}</Link></p>
      )}
    </div>
  );
}
