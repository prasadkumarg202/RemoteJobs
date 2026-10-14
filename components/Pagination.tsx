import Link from "next/link";
import { paramsToQueryString } from "@/lib/jobs/filters";

export function Pagination({ path, params, page, total, pageSize, labels }: { labels: { previous: string; next: string }; path: string; params: Record<string, string | string[] | undefined>; page: number; total: number; pageSize: number }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const href = (p: number) => `${path}${paramsToQueryString(params, { page: p > 1 ? String(p) : null })}`;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3">
      {page > 1 ? <Link href={href(page - 1)} className="min-h-12 rounded-full border border-line-strong bg-surface px-5 py-3 font-medium">{labels.previous}</Link> : <span />}
      <span className="t-small text-ink-faint">{page} / {pages}</span>
      {page < pages ? <Link href={href(page + 1)} className="min-h-12 rounded-full bg-ink px-5 py-3 font-medium text-paper">{labels.next}</Link> : <span />}
    </nav>
  );
}
