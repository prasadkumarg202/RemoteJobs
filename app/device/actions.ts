"use server";
import { cookies, headers } from "next/headers";
import { DEVICE_COOKIE, deviceHash, deviceLabel, isDeviceId, PASS_COOKIE, statusFromRpc, decide, type Gate } from "@/lib/access/core";
import { supabaseServer } from "@/lib/supabase/server";

export interface DeviceResult { gate: Gate | "error"; message?: string; deviceId?: string; deviceLabel?: string | null; canMoveAt?: string | null; accessUntil?: string | null }

async function remember(deviceId: string) {
  const store = await cookies();
  // ~400 days (browser maximum). The same id is also kept in localStorage to survive cookie clearing.
  store.set(DEVICE_COOKIE, deviceId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 400 * 86400 });
  store.delete(PASS_COOKIE);
}

function result(r: Record<string, unknown>): DeviceResult {
  return {
    gate: decide(statusFromRpc(r)),
    deviceLabel: (r.device_label as string) ?? null,
    canMoveAt: (r.can_move_device_at as string) ?? null,
    accessUntil: (r.access_until as string) ?? null,
  };
}

/** Called right after OTP sign-in (and by /device): registers this browser as the account's device the first time. */
export async function bindDevice(clientDeviceId: string): Promise<DeviceResult> {
  // Prefer the id already in this browser's cookie (localStorage may have been cleared, or vice versa).
  const cookieId = (await cookies()).get(DEVICE_COOKIE)?.value;
  const deviceId = isDeviceId(cookieId) ? cookieId : clientDeviceId;
  if (!isDeviceId(deviceId)) return { gate: "error", message: "Invalid device id" };
  const sb = await supabaseServer();
  if (!sb) return { gate: "allow" }; // demo mode
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { gate: "login" };
  const ua = (await headers()).get("user-agent");
  const { data, error } = await sb.rpc("bind_device", { p_device_hash: await deviceHash(deviceId), p_label: deviceLabel(ua) });
  if (error) return { gate: "error", message: error.message };
  await remember(deviceId);
  return { ...result(data as Record<string, unknown>), deviceId };
}

/** Moves the account to this browser (allowed once per cooldown period). The old device loses access. */
export async function moveDevice(deviceId: string): Promise<DeviceResult> {
  if (!isDeviceId(deviceId)) return { gate: "error", message: "Invalid device id" };
  const sb = await supabaseServer();
  if (!sb) return { gate: "allow" };
  const ua = (await headers()).get("user-agent");
  const { data, error } = await sb.rpc("move_device", { p_device_hash: await deviceHash(deviceId), p_label: deviceLabel(ua) });
  if (error) return { gate: "error", message: error.message.replace(/^.*device change allowed after/i, "You can move to a new device after") };
  await remember(deviceId);
  // Sign out every other session of this account.
  await sb.auth.signOut({ scope: "others" }).catch(() => undefined);
  return { ...result(data as Record<string, unknown>), deviceId };
}

export async function signOutHere() {
  const sb = await supabaseServer();
  await sb?.auth.signOut({ scope: "local" });
  (await cookies()).delete(PASS_COOKIE);
}
