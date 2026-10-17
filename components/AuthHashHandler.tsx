"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { afterHashPath, sessionFromHash } from "@/lib/client/auth-hash";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Email confirmation / password-reset links on AapStack come back as "<site>#access_token=…&refresh_token=…"
 * (Supabase uses "?code=" → /auth/callback instead). This stores that session and moves on.
 */
export function AuthHashHandler() {
  const router = useRouter();
  useEffect(() => {
    const s = sessionFromHash(window.location.hash);
    if (!s) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    history.replaceState(null, "", window.location.pathname + window.location.search); // drop tokens from the URL
    void sb.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token }).then(({ error }: { error: unknown }) => {
      router.replace(error ? "/login" : afterHashPath(s.type));
      router.refresh();
    });
  }, [router]);
  return null;
}
