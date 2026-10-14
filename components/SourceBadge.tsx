// Source-specific attribution that goes beyond plain "Source: X" text.
// Adzuna's terms require an "Adzuna" label of at least 116×23 px on every listing, linked to Adzuna.
// Replace the text wordmark with Adzuna's official logo file (from their press page) before going live.
export function SourceBadge({ source }: { source: string }) {
  if (source !== "Adzuna") return null;
  return (
    <a href="https://www.adzuna.in" target="_blank" rel="noopener" aria-label="Jobs by Adzuna"
      className="relative z-10 inline-flex min-h-[23px] min-w-[116px] items-center justify-center rounded border border-line bg-surface px-2 t-tiny font-semibold text-ink">
      Jobs by Adzuna
    </a>
  );
}
