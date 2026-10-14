"use client";
import { createContext, useContext } from "react";
import { DICTS, type Dict, type Lang } from "@/lib/i18n";

const Ctx = createContext<{ lang: Lang; t: Dict }>({ lang: "en", t: DICTS.en });

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={{ lang, t: DICTS[lang] }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
