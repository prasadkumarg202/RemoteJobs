import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";
import { getDict } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { t } = await getDict();
  const next = (await searchParams).next;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/jobs";
  return (
    <div className="mx-auto max-w-md px-4 pt-10">
      <h1 className="t-h1">{t.signIn}</h1>
      <p className="mt-2 text-ink-soft">{t.signInToSave}</p>
      <div className="mt-6"><LoginForm next={safeNext} /></div>
    </div>
  );
}
