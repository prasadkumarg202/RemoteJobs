// Minimal, dependency-free RSS 2.0 / Atom parser (enough for job feeds).

import { decodeEntities } from "./text.ts";

export interface FeedItem {
  /** Child element text keyed by lower-cased tag name (namespaces kept, e.g. "job_listing:company"). */
  f: Record<string, string | string[]>;
  /** Attributes of child elements keyed by tag (e.g. attrs["media:content"].url). */
  attrs: Record<string, Record<string, string>>;
}

function unwrap(s: string): string {
  const cdata = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? "");
  return out;
}

export function parseFeed(xml: string): FeedItem[] {
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new Error("Not an RSS/Atom feed");
  const items: FeedItem[] = [];
  const blockRe = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let b: RegExpExecArray | null;
  while ((b = blockRe.exec(xml))) {
    const inner = b[2];
    const item: Record<string, string | string[]> = {};
    const attrs: Record<string, Record<string, string>> = {};
    const elRe = /<([\w:.-]+)(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/\1>)/g;
    let e: RegExpExecArray | null;
    while ((e = elRe.exec(inner))) {
      const tag = e[1].toLowerCase();
      const value = e[3] !== undefined ? unwrap(e[3]).trim() : "";
      if (e[2]) attrs[tag] = parseAttrs(e[2]);
      if (tag === "link" && !value && attrs[tag]?.href) {
        item.link = attrs[tag].href;
        continue;
      }
      const prev = item[tag];
      if (prev === undefined) item[tag] = value;
      else item[tag] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    }
    items.push({ f: item, attrs });
  }
  return items;
}

export function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

export function all(v: string | string[] | undefined): string[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
