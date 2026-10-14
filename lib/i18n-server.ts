import "server-only";
import { cookies } from "next/headers";
import { asLang, DICTS, LANG_COOKIE, type Lang } from "@/lib/i18n";

export async function getLang(): Promise<Lang> {
  return asLang((await cookies()).get(LANG_COOKIE)?.value);
}

export async function getDict() {
  const lang = await getLang();
  return { lang, t: DICTS[lang] };
}
