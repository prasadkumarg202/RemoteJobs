"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LANG_COOKIE } from "@/lib/i18n";
import { useI18n } from "./I18nProvider";

export function LangToggle() {
  const { lang } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (l: "en" | "te") => {
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  };
  return (
    <div role="group" aria-label="Language / భాష" className={`flex rounded-full border border-line bg-surface p-0.5 t-tiny ${pending ? "opacity-60" : ""}`}>
      {(["en", "te"] as const).map((l) => (
        <button key={l} type="button" onClick={() => set(l)} aria-pressed={lang === l}
          className={`min-h-9 rounded-full px-3 ${lang === l ? "bg-ink text-paper" : "text-ink-soft"}`}>
          {l === "en" ? "English" : "తెలుగు"}
        </button>
      ))}
    </div>
  );
}
