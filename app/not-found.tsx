import Link from "next/link";
export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-16">
      <h1 className="t-h1">This job isn’t available</h1>
      <p className="mt-3 text-ink-soft">It may have closed or been removed by the employer.</p>
      <Link href="/jobs" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-paper">Browse jobs</Link>
    </div>
  );
}
