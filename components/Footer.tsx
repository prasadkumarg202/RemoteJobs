import Link from "next/link";
import { getDict } from "@/lib/i18n-server";

export async function Footer() {
  const { t } = await getDict();
  return (
    <footer className="mx-auto mt-16 max-w-6xl border-t border-line px-4 py-6 t-small text-ink-soft">
      <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/subscribe" className="hover:text-ink">{t.subscribeTitle}</Link>
        <Link href="/terms" className="hover:text-ink">Terms</Link>
        <Link href="/privacy" className="hover:text-ink">Privacy</Link>
        <Link href="/refunds" className="hover:text-ink">{t.refunds}</Link>
        <Link href="/contact" className="hover:text-ink">{t.contactUs}</Link>
      </nav>
      <p className="mt-2 t-tiny text-ink-faint">© {new Date().getFullYear()} Mana Kosamu</p>
    </footer>
  );
}
