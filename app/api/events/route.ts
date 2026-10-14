import { NextResponse } from "next/server";
import { EVENT_TYPES, recordEvent, type EventType } from "@/lib/jobs/events";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const event = String(body.event ?? "") as EventType;
  if (!EVENT_TYPES.includes(event)) return NextResponse.json({ ok: false }, { status: 400 });
  await recordEvent({
    event,
    job_id: typeof body.job_id === "string" ? body.job_id : null,
    query: typeof body.query === "string" ? body.query : null,
    section: typeof body.section === "string" ? body.section : null,
    filters: body.filters && typeof body.filters === "object" ? (body.filters as Record<string, unknown>) : null,
  }).catch(() => undefined);
  return new NextResponse(null, { status: 204 });
}
