// Access rules shared by middleware (edge), server actions and tests. No Node-only APIs.
//
// A signed-in user may read jobs when:
//   mode = "open"                          → everyone (free public site), or
//   admin/moderator                        → always, from any device, or
//   this browser is the account's device   → and they have a trial/subscription that hasn't ended.
// The decision is cached for a few minutes in a signed, httpOnly "access pass" cookie so the
// database isn't asked on every page view.

export type AccessMode = "subscription" | "open";
export type DeviceState = "none" | "match" | "other";
export type Gate = "allow" | "login" | "device" | "blocked" | "subscribe";

export interface AccessStatus {
  signedIn: boolean;
  mode: AccessMode;
  admin: boolean;
  device: DeviceState;
  /** Epoch ms, or null when there is no trial/subscription. */
  accessUntil: number | null;
}

export const DEVICE_COOKIE = "mk_did";
export const PASS_COOKIE = "mk_pass";
export const PASS_TTL_MS = 10 * 60 * 1000;

export function decide(s: AccessStatus, now = Date.now()): Gate {
  if (s.mode === "open") return "allow";
  if (!s.signedIn) return "login";
  if (s.admin) return "allow";
  if (s.device === "none") return "device";
  if (s.device === "other") return "blocked";
  if (!s.accessUntil || s.accessUntil <= now) return "subscribe";
  return "allow";
}

/**
 * Which paths are paid content. Employers can still post jobs (login only, checked by the page),
 * and the landing page, login, subscribe, device, legal pages and payment webhooks stay public.
 */
export function needsAccess(path: string): boolean {
  if (path === "/jobs/post" || path.startsWith("/jobs/post/")) return false;
  return /^\/(jobs|go|profile)(\/|$)/.test(path) || path.startsWith("/api/jobs/");
}

/** Normalises the RPC result of public.access_status(). */
export function statusFromRpc(r: Record<string, unknown> | null | undefined): AccessStatus {
  const until = r?.access_until ? Date.parse(String(r.access_until)) : NaN;
  return {
    signedIn: r?.signed_in === true,
    mode: r?.mode === "open" ? "open" : "subscription",
    admin: r?.admin === true,
    device: r?.device === "match" ? "match" : r?.device === "other" ? "other" : "none",
    accessUntil: Number.isFinite(until) ? until : null,
  };
}

// ---------------------------------------------------------------- crypto (Web Crypto, edge-safe)

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The device id never leaves the browser in clear: the database stores this hash. */
export const deviceHash = (deviceId: string) => sha256Hex(`mk-device:${deviceId}`);

export const isDeviceId = (v: string | undefined | null): v is string => !!v && /^[A-Za-z0-9-]{20,64}$/.test(v);

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export interface AccessPass { u: string; d: string; s: AccessStatus; e: number }

export async function signPass(p: AccessPass, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(p)));
  return `${body}.${b64url(await hmac(secret, body))}`;
}

export async function verifyPass(token: string | undefined, secret: string, now = Date.now()): Promise<AccessPass | null> {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(await hmac(secret, body));
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as AccessPass;
    return typeof p.e === "number" && p.e > now ? p : null;
  } catch {
    return null;
  }
}

/** "Chrome on Android" — shown to the user and admins so they recognise their device. */
export function deviceLabel(ua: string | null | undefined): string {
  const u = ua ?? "";
  const os = /Android/i.test(u) ? "Android" : /iPhone|iPad|iOS/i.test(u) ? "iPhone/iPad" : /Windows/i.test(u) ? "Windows" : /Mac OS X|Macintosh/i.test(u) ? "Mac" : /Linux/i.test(u) ? "Linux" : "Unknown OS";
  const br = /EdgA?\//.test(u) ? "Edge" : /SamsungBrowser/.test(u) ? "Samsung Internet" : /OPR\/|Opera/.test(u) ? "Opera" : /Firefox|FxiOS/.test(u) ? "Firefox" : /CriOS|Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}

/** Email + password sign-in (testing option): EMAIL_LOGIN=on|off in env wins; otherwise the admin setting. */
export function emailLoginFrom(env: string | undefined, setting: unknown): boolean {
  if (env === "on") return true;
  if (env === "off") return false;
  return setting === true;
}
