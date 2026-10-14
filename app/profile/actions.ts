"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function signOut() {
  const sb = await supabaseServer();
  await sb?.auth.signOut();
  redirect("/jobs");
}

export async function markNotificationsRead() {
  const sb = await supabaseServer();
  const user = sb ? (await sb.auth.getUser()).data.user : null;
  if (!user) return;
  await sb!.from("job_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
}
