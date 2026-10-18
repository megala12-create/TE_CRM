"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { importBankRows, previewBankStatement, type PreviewRow, type PreviewState } from "./actions";
import { formatPaise, toPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CategoryQuickAdd } from "@/components/category-quick-add";

type EditRow = PreviewRow & { include: boolean };

export function BankImport({ categories: initialCategories, canAddCategory }: { categories: { id: number; name: string }[]; canAddCategory: boolean }) {
  const [categories, setCategories] = useState(initialCategories);
  const addCategory = (c: { id: number; name: string }) =>
    setCategories((cs) => (cs.some((x) => x.id === c.id) ? cs : [...cs, c].sort((a, b) => a.name.localeCompare(b.name))));
  const [preview, previewAction, previewing] = useActionState(previewBankStatement, {} as PreviewState);
  const [result, importAction] = useActionState(importBankRows, {} as PreviewState);
  const [importing, startImport] = useTransition();
  const [rows, setRows] = useState<EditRow[]>([]);
  const [bulkCategory, setBulkCategory] = useState("");

  useEffect(() => {
    setRows((preview.rows ?? []).map((r) => ({ ...r, include: !r.duplicate })));
  }, [preview.rows]);
  useEffect(() => {
    if (result.ok) setRows([]);
  }, [result]);

  const update = (key: string, patch: Partial<EditRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.include);
  const missing = chosen.filter((r) => !r.categoryId).length;
  const total = useMemo(() => chosen.reduce((s, r) => s + toPaise(r.amount), 0), [chosen]);

  const submitImport = () => {
    const fd = new FormData();
    fd.set("fileName", preview.fileName ?? "statement.csv");
    fd.set("rows", JSON.stringify(chosen.map(({ line, date, description, reference, amount, mode, categoryId }) => ({ line, date, description, reference, amount, mode, categoryId }))));
    startImport(() => importAction(fd));
  };

  return (
    <div className="space-y-5">
      <form action={previewAction} className="card flex flex-wrap items-end gap-4 p-5">
        <div className="min-w-72 flex-1">
          <label htmlFor="file" className="label">Expenses file (CSV)</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
        </div>
        <button type="submit" disabled={previewing} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
          {previewing ? "Reading…" : "Upload & preview"}
        </button>
      </form>

      {result.message ? (
        <div role="status" className={cn("rounded-md px-4 py-3 text-sm", result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>
          {result.message} {result.ok ? <Link href="/expenses" className="link ml-2">View expenses</Link> : null}
        </div>
      ) : null}
      {preview.message && !result.ok ? (
        <div role="status" className={cn("rounded-md px-4 py-3 text-sm", preview.ok ? "bg-brand-50 text-brand-800" : "bg-red-50 text-red-700")}>
          {preview.message}
          {preview.problems?.length ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
              {preview.problems.map((p) => <li key={p}>{p} — row skipped</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      {rows.length ? (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-600">Set category for all ticked rows without one:</span>
              <span className="inline-flex">
                <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className={cn("input w-auto", canAddCategory && "rounded-r-none")} aria-label="Category for unassigned rows">
                  <option value="">— Choose —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {canAddCategory ? <CategoryQuickAdd attached onAdded={(c) => { addCategory(c); setBulkCategory(String(c.id)); }} /> : null}
              </span>
              <button
                type="button"
                disabled={!bulkCategory}
                onClick={() => setRows((rs) => rs.map((r) => (r.include && !r.categoryId ? { ...r, categoryId: Number(bulkCategory), suggestedFrom: null } : r)))}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
            <div className="text-slate-600">
              <strong className="text-slate-900">{chosen.length}</strong> of {rows.length} ticked · <strong className="tabular-nums text-slate-900">{formatPaise(total)}</strong>
              {missing ? <span className="ml-2 text-red-600">{missing} without a category</span> : null}
            </div>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="th w-10">
                    <input type="checkbox" aria-label="Tick all rows" className="size-4 accent-brand-600" checked={chosen.length === rows.length}
                      onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))} />
                  </th>
                  <th className="th">Sl. No.</th>
                  <th className="th">Value date</th>
                  <th className="th">Description</th>
                  <th className="th">Chq / Ref No.</th>
                  <th className="th text-right">Amount</th>
                  <th className="th min-w-64">Category</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={cn("align-top", !r.include && "opacity-50", r.duplicate && "bg-amber-50")}>
                    <td className="td"><input type="checkbox" aria-label={`Include line ${r.line}`} checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} className="size-4 accent-brand-600" /></td>
                    <td className="td text-slate-500">{r.slNo}</td>
                    <td className="td whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="td">
                      <div className="max-w-md break-words">{r.description}</div>
                      {r.duplicate ? <div className="text-xs font-medium text-amber-700">Already imported (same date, amount and reference)</div> : null}
                    </td>
                    <td className="td font-mono text-xs">{r.reference}</td>
                    <td className="td whitespace-nowrap text-right tabular-nums">{formatPaise(toPaise(r.amount))}</td>
                    <td className="td">
                      <div className="flex">
                        <select value={r.categoryId ?? ""} onChange={(e) => update(r.key, { categoryId: Number(e.target.value) || null, suggestedFrom: null })}
                          className={cn("input", canAddCategory && "rounded-r-none", r.include && !r.categoryId && "border-red-400")} aria-label={`Category for line ${r.line}`}>
                          <option value="">— Category —</option>
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {canAddCategory ? <CategoryQuickAdd attached onAdded={(c) => { addCategory(c); update(r.key, { categoryId: c.id, suggestedFrom: null }); }} /> : null}
                      </div>
                      {r.suggestedFrom ? (
                        <div className="mt-0.5 text-xs text-slate-400">
                          {r.suggestedFrom === "file" ? "From file" : r.suggestedFrom === "history" ? "Same as last time" : "Suggested"}
                        </div>
                      ) : null}
                      {r.unknownCategory && !r.categoryId ? (
                        <div className="mt-0.5 text-xs text-amber-700">“{r.unknownCategory}” is not a category — choose or add one</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 p-3">
            {missing ? <span className="text-sm text-red-600">Choose a category for every ticked row.</span> : null}
            <button type="button" onClick={submitImport} disabled={importing || chosen.length === 0 || missing > 0}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {importing ? "Importing…" : `Import ${chosen.length} expense(s)`}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
