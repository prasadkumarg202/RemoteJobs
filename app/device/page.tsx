import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeviceGate } from "@/components/DeviceGate";
import { currentUser } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/env";

export const metadata: Metadata = { title: "Your device", robots: { index: false } };
export const dynamic = "force-dynamic";

const safe = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/jobs");

export default async function DevicePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safe((await searchParams).next);
  if (DEMO_MODE) redirect(next);
  if (!(await currentUser())) redirect(`/login?next=${encodeURIComponent(next)}`);
  return (
    <div className="mx-auto max-w-lg px-4 pt-10">
      <DeviceGate next={next} />
    </div>
  );
}
