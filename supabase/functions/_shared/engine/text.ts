// Text helpers: HTML stripping, normalization, hashing and similarity.

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: "…", bull: "•", middot: "·",
  euro: "€", pound: "£", rupee: "₹", copy: "©", reg: "®", trade: "™",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Convert HTML to readable plain text, keeping paragraph and list breaks. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let s = String(html);
  // Some feeds double-encode HTML (&lt;p&gt;)
  if (!/<[a-z]/i.test(s) && /&lt;[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style|iframe|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|section|article|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncateWords(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\-–—\s]+$/, "") + "…";
}

export function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

const TITLE_NOISE = [
  /\((?:100%\s*)?remote[^)]*\)/gi,
  /\[(?:100%\s*)?remote[^\]]*\]/gi,
  /\s[-–—|]\s*(?:100%\s*)?(?:fully\s+)?remote\b.*$/i,
  /\b(?:100%\s*)?fully remote\b/gi,
  /\b(?:urgent(?:ly)?|hiring|immediate joiner|apply now|new)\b[:!]?/gi,
  /\s[-–—|]\s*(?:usa?|uk|eu|emea|apac|latam|india|worldwide|anywhere|global)\b.*$/i,
];

const TITLE_ABBREV: Array<[RegExp, string]> = [
  [/\bsr\b\.?/g, "senior"],
  [/\bjr\b\.?/g, "junior"],
  [/\beng\b\.?/g, "engineer"],
  [/\bdev\b/g, "developer"],
  [/\bmgr\b\.?/g, "manager"],
  [/\bfull[\s-]?stack\b/g, "fullstack"],
  [/\bfront[\s-]?end\b/g, "frontend"],
  [/\bback[\s-]?end\b/g, "backend"],
  [/\bml\b/g, "machine learning"],
  [/\bai\b/g, "ai"],
];

export function normalizeTitle(title: string): string {
  let t = stripDiacritics(decodeEntities(title));
  for (const re of TITLE_NOISE) t = t.replace(re, " ");
  t = t.toLowerCase();
  for (const [re, rep] of TITLE_ABBREV) t = t.replace(re, rep);
  return t.replace(/[^a-z0-9+#. ]+/g, " ").replace(/\s+/g, " ").trim();
}

const COMPANY_SUFFIX =
  /\b(inc|incorporated|llc|l\.l\.c|ltd|limited|pvt|private|plc|gmbh|ag|sa|sas|bv|b\.v|corp|corporation|co|company|pty|oy|ab|srl|s\.r\.l|technologies|technology|tech|labs|group|holdings|software|solutions|hq)\b\.?/g;

export function normalizeCompany(name: string | null | undefined): string {
  if (!name) return "";
  let c = stripDiacritics(decodeEntities(name)).toLowerCase();
  c = c.replace(/\.(com|io|ai|co|app|dev|net|org|in)\b/g, "");
  c = c.replace(/&/g, " and ").replace(COMPANY_SUFFIX, " ");
  return c.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function slugify(s: string, max = 60): string {
  const slug = stripDiacritics(s)
    .toLowerCase()
    .replace(/[+]/g, " plus ")
    .replace(/#/g, " sharp ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, max).replace(/-+$/g, "") || "job";
}

const TRACKING_PARAMS = /^(utm_|ref$|ref_|source$|src$|fbclid$|gclid$|mc_|_hs|trk$|campaign$|via$)/i;

/** Normalize a URL so the same listing linked from two places compares equal. */
export function canonicalizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    u.protocol = "https:";
    const keep = new URLSearchParams();
    const keys = [...u.searchParams.keys()].sort();
    for (const k of keys) if (!TRACKING_PARAMS.test(k)) keep.set(k, u.searchParams.get(k) ?? "");
    const q = keep.toString();
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `https://${u.hostname}${u.port ? ":" + u.port : ""}${path}${q ? "?" + q : ""}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function isHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Small synchronous non-crypto hash for short ids (FNV-1a 32bit, base36). */
export function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, "0");
}

export function tokenSet(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 1));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Word 3-shingles for content similarity. */
export function shingles(text: string, n = 3, maxWords = 250): Set<string> {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, maxWords);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

export function toIsoDate(v: string | number | Date | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  let d: Date;
  if (v instanceof Date) d = v;
  else if (typeof v === "number") d = new Date(v < 1e12 ? v * 1000 : v); // epoch seconds or ms
  else if (/^\d{9,13}$/.test(v)) d = new Date(Number(v) < 1e12 ? Number(v) * 1000 : Number(v));
  else d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
