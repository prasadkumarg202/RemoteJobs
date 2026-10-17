import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PasswordForm } from "@/components/PasswordForm";
import { currentUser } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "New password", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Reached from the "reset password" email (via /auth/callback, which signs the user in). */
export default async function NewPasswordPage() {
  if (!(await currentUser())) redirect("/login");
  const { t } = await getDict();
  return (
    <div className="mx-auto max-w-md px-4 pt-10">
      <h1 className="t-h1">{t.newPassword}</h1>
      <div className="mt-6"><PasswordForm /></div>
    </div>
  );
}
