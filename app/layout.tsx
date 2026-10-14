import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { I18nProvider } from "@/components/I18nProvider";
import { SITE_URL } from "@/lib/env";
import { getLang } from "@/lib/i18n-server";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Jobs — Mana Kosamu", template: "%s — Mana Kosamu" },
  description: "Local, remote, AI and freelance jobs for Telugu job seekers, with India eligibility checked on every remote job.",
  applicationName: "Mana Kosamu",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#181d3d" }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang === "te" ? "te" : "en-IN"}>
      <body className="min-h-dvh antialiased">
        <I18nProvider lang={lang}>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-surface focus:p-3">Skip to content</a>
          <Header />
          <main id="main" className="pb-nav">{children}</main>
          <BottomNav />
        </I18nProvider>
      </body>
    </html>
  );
}
