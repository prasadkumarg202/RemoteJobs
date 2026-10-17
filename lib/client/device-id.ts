// A random id for this browser, kept in localStorage (and in an httpOnly cookie set by the server).
// It identifies "the device" for the one-device-per-account rule. Clearing site data makes the
// browser look like a new device; the user can then move their account here (once per cooldown).
const KEY = "mk_device_id";

export function getDeviceId(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v && /^[A-Za-z0-9-]{20,64}$/.test(v)) return v;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Keep localStorage in step with the id the server settled on. */
export function setDeviceId(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* storage blocked */ }
}
