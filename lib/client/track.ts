"use client";
// Privacy-minimal analytics: event type + job id + coarse context. No IP, UA or PII is sent.
export type JobEvent = "job_view" | "apply_click" | "save_job" | "share_job" | "report_job" | "search" | "filter_used" | "hide_job";

export function track(event: JobEvent, data: { job_id?: string; query?: string; section?: string; filters?: Record<string, unknown> } = {}) {
  try {
    const body = JSON.stringify({ event, ...data });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    else fetch("/api/events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
  } catch {
    /* analytics must never break the page */
  }
}
