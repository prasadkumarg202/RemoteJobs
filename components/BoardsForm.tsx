"use client";
import { useActionState } from "react";
import { saveBoards, type BoardsState } from "@/app/admin/jobs/actions";

export function BoardsForm({ slug, name, lines, allLocations, example, help, disabled }: {
  slug: "greenhouse" | "lever" | "ashby"; name: string; lines: string; allLocations: boolean; example: string; help: string; disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<BoardsState | null, FormData>(saveBoards, null);
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-line bg-surface p-5">
      <input type="hidden" name="slug" value={slug} />
      <h3 className="t-h3">{name} company boards</h3>
      <p className="t-small text-ink-soft">{help}</p>
      <textarea name="boards" rows={6} defaultValue={lines} disabled={disabled} spellCheck={false}
        placeholder={example} className="rounded-lg border border-line-strong bg-paper px-3 py-2 font-mono t-small" />
      <label className="flex items-center gap-2 t-small"><input type="checkbox" name="all_locations" defaultChecked={allLocations} disabled={disabled} /> Keep jobs in every country (default: only India-based or remote jobs)</label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending || disabled} className="min-h-11 rounded-full bg-ink px-5 font-medium text-paper disabled:opacity-40">{pending ? "Saving…" : "Save boards"}</button>
        {state && <span role="status" className={`t-small ${state.ok ? "text-leaf" : "text-warn"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
