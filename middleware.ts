import { createServerClient } from "@supabase/ssr";
import { compatFetch } from "@engine/compat-fetch.ts";
import { NextResponse, type NextRequest } from "next/server";
import { decide, DEVICE_COOKIE, deviceHash, isDeviceId, needsAccess, PASS_COOKIE, PASS_TTL_MS, signPass, statusFromRpc, verifyPass, type AccessStatus } from "@/lib/access/core";

// 1. Refreshes the Supabase session cookie.
// 2. Guards /admin (sign-in) and paid pages: signed in with mobile OTP, on the account's one
//    registered device, with an active trial or subscription (see lib/access/core.ts).
export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let res = NextResponse.next({ request: req });
  if (!url || !key) return res; // demo mode
  const sb = createServerClient(url, key, {
    global: { fetch: compatFetch },
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await sb.auth.getUser();
  const user = data.user;
  const path = req.nextUrl.pathname;

  const to = (pathname: string, extra: Record<string, string> = {}) => {
    if (path.startsWith("/api/")) return NextResponse.json({ error: pathname.slice(1) }, { status: 401 });
    const u = req.nextUrl.clone();
    u.pathname = pathname;
    u.search = "";
    u.searchParams.set("next", path + req.nextUrl.search);
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
    const r = NextResponse.redirect(u);
    for (const c of res.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  if (path.startsWith("/admin") && !user) return to("/login");
  if ((process.env.ACCESS_MODE ?? "subscription") === "open" || !needsAccess(path)) return res;
  if (!user) return to("/login");

  const did = req.cookies.get(DEVICE_COOKIE)?.value;
  if (!isDeviceId(did)) return to("/device");
  const dh = await deviceHash(did);

  const secret = process.env.ACCESS_COOKIE_SECRET ?? "";
  const pass = await verifyPass(req.cookies.get(PASS_COOKIE)?.value, secret);
  let status: AccessStatus;
  if (pass && pass.u === user.id && pass.d === dh) {
    status = pass.s;
  } else {
    const { data: rpc, error } = await sb.rpc("access_status", { p_device_hash: dh });
    if (error) {
      console.error("access_status failed", error.message);
      return to("/login", { error: "access" });
    }
    status = statusFromRpc(rpc as Record<string, unknown>);
    if (secret) {
      const exp = Math.min(Date.now() + PASS_TTL_MS, status.accessUntil && status.accessUntil > Date.now() ? status.accessUntil : Date.now() + PASS_TTL_MS);
      res.cookies.set(PASS_COOKIE, await signPass({ u: user.id, d: dh, s: status, e: exp }, secret), { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: Math.ceil(PASS_TTL_MS / 1000) });
    }
  }

  switch (decide(status)) {
    case "allow": return res;
    case "login": return to("/login");
    case "device": return to("/device");
    case "blocked": return to("/device", { blocked: "1" });
    case "subscribe": return to("/subscribe");
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp|woff2)$).*)"] };
