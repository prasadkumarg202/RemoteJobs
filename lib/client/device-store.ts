"use client";
// Per-device lists for signed-out users (saved / hidden jobs). Wrapped in try/catch:
// storage can be unavailable in private mode.
const read = (k: string): string[] => {
  try { return JSON.parse(localStorage.getItem(k) ?? "[]"); } catch { return []; }
};
const write = (k: string, v: string[]) => {
  try { localStorage.setItem(k, JSON.stringify(v.slice(-500))); window.dispatchEvent(new Event("mk-store")); } catch { /* ignore */ }
};
export const deviceSaved = {
  all: () => read("mk_saved"),
  has: (id: string) => read("mk_saved").includes(id),
  toggle: (id: string) => { const s = read("mk_saved"); const on = !s.includes(id); write("mk_saved", on ? [...s, id] : s.filter((x) => x !== id)); return on; },
};
export const deviceHidden = {
  all: () => read("mk_hidden"),
  add: (id: string) => write("mk_hidden", [...new Set([...read("mk_hidden"), id])]),
  remove: (id: string) => write("mk_hidden", read("mk_hidden").filter((x) => x !== id)),
};
