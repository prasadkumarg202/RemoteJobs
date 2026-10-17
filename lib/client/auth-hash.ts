/** Reads a session from a URL fragment like "#access_token=…&refresh_token=…&type=signup" (AapStack email links). */
export function sessionFromHash(hash: string): { access_token: string; refresh_token: string; type: string } | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const access_token = p.get("access_token");
  const refresh_token = p.get("refresh_token");
  if (!access_token || !refresh_token || access_token.length > 4000 || refresh_token.length > 1000) return null;
  return { access_token, refresh_token, type: p.get("type") ?? "" };
}

/** Where to go after the link: password reset → new-password page; email confirmed → register this device. */
export function afterHashPath(type: string): string {
  return type === "recovery" ? "/account/password" : "/device?next=%2Fjobs";
}
