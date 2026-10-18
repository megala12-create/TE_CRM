"use client";

import { useRef, useState, useTransition } from "react";
import { Columns3 } from "lucide-react";

export type ColumnOption = { key: string; label: string };

/** Lets each user pick which columns a list shows. Saved per user on the server. */
export function ColumnChooser({
  columns,
  selected,
  save,
}: {
  columns: ColumnOption[];
  selected: string[];
  save: (keys: string[], offered: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50">
        <Columns3 className="size-4" aria-hidden /> Columns
      </summary>
      <form
        className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          const keys = new FormData(e.currentTarget).getAll("col").map(String);
          start(async () => {
            await save(keys, columns.map((c) => c.key));
            setOpen(false);
          });
        }}
      >
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {columns.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="col" value={c.key} defaultChecked={selected.includes(c.key)} className="size-4 accent-brand-600" />
              {c.label}
            </label>
          ))}
        </div>
        <button type="submit" disabled={pending} className="mt-3 w-full rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
          {pending ? "Saving…" : "Apply"}
        </button>
      </form>
    </details>
  );
}
