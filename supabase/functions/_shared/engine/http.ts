// Polite HTTP client: identifies itself, honours 429/Retry-After, retries 5xx with
// backoff, supports conditional requests (ETag / Last-Modified) and timeouts.

export class SourceHttpError extends Error {
  constructor(message: string, public status: number, public url: string) {
    super(message);
  }
}
export class RateLimitedError extends SourceHttpError {}

export interface HttpResponse {
  status: number;
  body: string;
  headers: Headers;
  notModified: boolean;
}

export interface HttpOptions {
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  etag?: string | null;
  lastModified?: string | null;
  timeoutMs?: number;
  retries?: number;
  /** Max seconds we are willing to wait for a Retry-After. Longer → give up until next run. */
  maxRetryAfterSec?: number;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const USER_AGENT = "ManaKosamuJobsBot/1.0 (+https://manakosamu.com/about/job-sources)";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpClient {
  constructor(private fetchImpl: FetchLike = fetch, private userAgent = USER_AGENT) {}

  async request(url: string, opts: HttpOptions = {}): Promise<HttpResponse> {
    const retries = opts.retries ?? 2;
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= retries) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25000);
      try {
        const headers: Record<string, string> = {
          "User-Agent": this.userAgent,
          Accept: "application/json, application/rss+xml, application/xml;q=0.9, */*;q=0.5",
          ...(opts.headers ?? {}),
        };
        if (opts.etag) headers["If-None-Match"] = opts.etag;
        if (opts.lastModified) headers["If-Modified-Since"] = opts.lastModified;
        const res = await this.fetchImpl(url, { method: opts.method ?? "GET", headers, body: opts.body, signal: ctrl.signal });
        if (res.status === 304) return { status: 304, body: "", headers: res.headers, notModified: true };
        if (res.status === 429) {
          const ra = Number(res.headers.get("retry-after") ?? "60");
          if (attempt < retries && ra <= (opts.maxRetryAfterSec ?? 20)) {
            await sleep(ra * 1000);
            attempt++;
            continue;
          }
          throw new RateLimitedError(`Rate limited by source (retry after ${ra}s)`, 429, url);
        }
        if (res.status >= 500 && attempt < retries) {
          await sleep(1000 * 2 ** attempt);
          attempt++;
          continue;
        }
        const body = await res.text();
        if (!res.ok) throw new SourceHttpError(`HTTP ${res.status} from ${new URL(url).hostname}`, res.status, url);
        return { status: res.status, body, headers: res.headers, notModified: false };
      } catch (e) {
        lastErr = e;
        if (e instanceof SourceHttpError) throw e;
        if (attempt >= retries) break;
        await sleep(1000 * 2 ** attempt);
        attempt++;
      } finally {
        clearTimeout(timer);
      }
    }
    const msg = lastErr instanceof Error ? (lastErr.name === "AbortError" ? "request timed out" : lastErr.message) : String(lastErr);
    throw new SourceHttpError(`Network error: ${msg}`, 0, url);
  }

  async json<T = unknown>(url: string, opts: HttpOptions = {}): Promise<{ data: T | null; res: HttpResponse }> {
    const res = await this.request(url, { ...opts, headers: { Accept: "application/json", ...(opts.headers ?? {}) } });
    if (res.notModified) return { data: null, res };
    try {
      return { data: JSON.parse(res.body) as T, res };
    } catch {
      throw new SourceHttpError(`Invalid JSON from ${new URL(url).hostname}`, res.status, url);
    }
  }
}
