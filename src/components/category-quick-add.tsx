"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { quickAddExpenseCategory } from "@/app/(app)/settings/expense-categories/actions";
import { cn } from "@/lib/utils";

/**
 * The "+" shown next to expense-category dropdowns. Opens a small popover to add a category
 * to the master list; calls `onAdded` (to select it) and refreshes the page data.
 */
export function CategoryQuickAdd({
  onAdded,
  className,
  attached = false,
}: {
  onAdded?: (cat: { id: number; name: string }) => void;
  className?: string;
  /** Joined to the right edge of a select (rounded on the right only). */
  attached?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const save = () =>
    start(async () => {
      setError("");
      const res = await quickAddExpenseCategory(name);
      if ("error" in res) return setError(res.error);
      onAdded?.(res);
      setName("");
      setOpen(false);
      router.refresh();
    });

  return (
    <div ref={wrap} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Add expense category"
        title="Add expense category"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center justify-center border border-slate-300 bg-white px-2.5 text-slate-600 shadow-xs hover:bg-slate-50 hover:text-brand-700",
          attached ? "rounded-r-md border-l-0" : "rounded-md py-1.5",
        )}
      >
        <Plus className="size-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <label htmlFor="quick-category" className="label">New expense category</label>
          <div className="flex gap-2">
            <input
              id="quick-category"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
                if (e.key === "Escape") setOpen(false);
              }}
              className="input"
              placeholder="e.g. Canteen"
              autoFocus
            />
            <button type="button" onClick={save} disabled={pending || !name.trim()} className="rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {pending ? "…" : "Add"}
            </button>
          </div>
          {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
          <p className="mt-2 text-xs text-slate-500">Rename, merge or hide categories in Setup → Expense categories.</p>
        </div>
      ) : null}
    </div>
  );
}
