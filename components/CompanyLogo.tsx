"use client";
import { useState } from "react";
import { initials } from "@/lib/jobs/format";

export function CompanyLogo({ src, name, size = 44 }: { src: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!src || failed) {
    return (
      <span style={box} aria-hidden className="grid shrink-0 place-items-center rounded-xl border border-line bg-paper font-semibold text-ink-soft t-condensed">
        {initials(name)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" style={box} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="shrink-0 rounded-xl border border-line bg-surface object-contain" />;
}
