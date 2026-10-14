import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/jobs";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/jobs";
  if (code) {
    const sb = await supabaseServer();
    await sb?.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(safe, url.origin));
}
