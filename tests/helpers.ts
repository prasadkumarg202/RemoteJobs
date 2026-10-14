import { readFileSync } from "node:fs";
import { MemoryJobRepository, type FetchLike } from "@engine";

export const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
export const fixtureJson = <T = unknown>(name: string) => JSON.parse(fixture(name)) as T;

/** The moment the fixtures were generated (keeps expiry maths stable). */
export const FIXTURE_NOW = new Date(fixtureJson<{ updatedAt: number }>("himalayas.json").updatedAt);

export function makeRepo() {
  const repo = new MemoryJobRepository();
  repo.addSource({ slug: "himalayas", name: "Himalayas", api_url: "https://himalayas.app/jobs/api", rss_url: "https://himalayas.app/jobs/rss", config: { max_pages: 2 } });
  repo.addSource({ slug: "jobicy", name: "Jobicy", api_url: "https://jobicy.com/api/v2/remote-jobs", rss_url: "https://jobicy.com/jobs/feed" });
  repo.addSource({ slug: "remoteok", name: "Remote OK", api_url: "https://remoteok.com/api", rss_url: "https://remoteok.com/remote-jobs.rss", full_feed: true });
  repo.addSource({ slug: "startupjobs", name: "Startup Jobs", source_type: "mcp", api_url: "https://api.startup.jobs/mcp" });
  return repo;
}

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;

/** Fake fetch that routes by hostname/path; records calls. */
export function fakeFetch(routes: Record<string, Route>): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push(url.toString());
    for (const [prefix, route] of Object.entries(routes)) {
      if (`${url.hostname}${url.pathname}`.startsWith(prefix)) return route(url, init);
    }
    return new Response("not found", { status: 404 });
  }) as FetchLike & { calls: string[] };
  fn.calls = calls;
  return fn;
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export const sourceFetch = () =>
  fakeFetch({
    "himalayas.app/jobs/api": () => json(fixtureJson("himalayas.json")),
    "jobicy.com/api/v2/remote-jobs": (u) =>
      u.searchParams.get("get") === "industries" ? json(fixtureJson("jobicy-taxonomy-industries.json"))
      : u.searchParams.get("get") === "locations" ? json(fixtureJson("jobicy-taxonomy-locations.json"))
      : json(fixtureJson("jobicy.json")),
    "remoteok.com/api": () => json(fixtureJson("remoteok.json")),
    "remoteok.com/remote-jobs.rss": () => new Response(fixture("remoteok.rss"), { headers: { "content-type": "application/rss+xml" } }),
  });
