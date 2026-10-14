"use client";
import { useRouter } from "next/navigation";
import { useI18n } from "./I18nProvider";

export const CITIES = ["Hyderabad", "Visakhapatnam", "Vijayawada", "Guntur", "Tirupati", "Warangal", "Nellore", "Kakinada", "Rajahmundry", "Bengaluru", "Chennai"];

export function CityPicker({ city }: { city: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-2 t-small text-ink-soft">
      <span>{t.yourCity}</span>
      <select value={city ?? ""} onChange={(e) => {
        document.cookie = `mk_city=${encodeURIComponent(e.target.value)}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }} className="min-h-11 rounded-full border border-line-strong bg-surface px-3 text-ink">
        <option value="">{t.allCities}</option>
        {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}
