"use client";
import { useEffect } from "react";
import { track, type JobEvent } from "@/lib/client/track";

/** Fires one analytics event when mounted (e.g. job_view, search). */
export function Track({ event, jobId, query, section, filters }: { event: JobEvent; jobId?: string; query?: string; section?: string; filters?: Record<string, unknown> }) {
  const key = JSON.stringify([event, jobId, query, section, filters]);
  useEffect(() => {
    track(event, { job_id: jobId, query, section, filters });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
