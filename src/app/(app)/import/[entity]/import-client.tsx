"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import type { ImportState } from "./actions";
import { cn } from "@/lib/utils";

export function ImportClient({
  action,
  back,
  backLabel,
  offerCreateCustomers,
}: {
  action: (prev: ImportState, form: FormData) => Promise<ImportState>;
  back: string;
  backLabel: string;
  offerCreateCustomers: boolean;
}) {
  const [state, run] = useActionState(action, {} as ImportState);
  const [pending, start] = useTransition();
  const [intent, setIntent] = useState<"preview" | "import">("preview");
  const [chosen, setChosen] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (which: "preview" | "import") => {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    data.set("intent", which);
    setIntent(which);
    start(() => run(data));
  };
  // The Import button only applies to the file that was just previewed
  const previewedThis = !state.committed && state.fileName === chosen && (state.ready ?? 0) > 0;
  const problems = [
    ...(state.errors ?? []).map((p) => ({ ...p, kind: "error" as const })),
    ...(state.warnings ?? []).map((p) => ({ ...p, kind: "warning" as const })),
    ...(state.skipped ?? []).map((p) => ({ ...p, kind: "skipped" as const })),
  ].sort((a, b) => a.line - b.line);

  return (
    <div className="space-y-5">
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          submit("preview");
        }}
        className="card flex flex-wrap items-end gap-4 p-5"
      >
        <div className="min-w-72 flex-1">
          <label htmlFor="file" className="label">File (.csv or .xlsx)</label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setChosen(e.target.files?.[0]?.name ?? "")}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
        </div>
        {offerCreateCustomers ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="createCustomers" defaultChecked className="size-4 accent-brand-600" />
            Create missing customers
          </label>
        ) : null}
        <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
          {pending && intent === "preview" ? "Checking…" : "Upload & check"}
        </button>
      </form>

      {state.message ? (
        <div role="status" className={cn("rounded-md px-4 py-3 text-sm", state.committed && state.imported ? "bg-emerald-50 text-emerald-800" : state.ok ? "bg-brand-50 text-brand-800" : "bg-red-50 text-red-700")}>
          <span className="font-medium">{state.message}</span>
          {state.committed && state.imported ? <Link href={back} className="link ml-2">{backLabel}</Link> : null}
          {state.notes?.length ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
              {state.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          ) : null}
          {state.ignored?.length ? <p className="mt-2 text-xs text-slate-600">Columns not used: {state.ignored.join(", ")}</p> : null}
        </div>
      ) : null}

      {problems.length ? (
        <section className="card">
          <header className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
            Rows needing attention <span className="font-normal text-slate-500">({problems.length})</span>
          </header>
          <ul className="max-h-72 divide-y divide-slate-100 overflow-auto text-sm">
            {problems.slice(0, 300).map((p, i) => (
              <li key={i} className="flex gap-3 px-4 py-2">
                <span className="w-16 shrink-0 text-slate-500">Row {p.line}</span>
                <span className={cn("w-20 shrink-0 text-xs font-medium uppercase", p.kind === "error" ? "text-red-600" : p.kind === "warning" ? "text-amber-700" : "text-slate-500")}>{p.kind}</span>
                <span className="text-slate-700">{p.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.preview?.length && !state.committed ? (
        <section className="card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">
              Preview <span className="font-normal text-slate-500">{state.ready! > state.preview.length ? `(first ${state.preview.length} of ${state.ready})` : `(${state.ready})`}</span>
            </h2>
            <button
              type="button"
              onClick={() => submit("import")}
              disabled={pending || !previewedThis}
              title={previewedThis ? undefined : "Upload & check this file first"}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {pending && intent === "import" ? "Importing…" : `Import ${state.ready}`}
            </button>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th w-16">Row</th>
                  {state.previewHead!.map((h) => <th key={h} className="th">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {state.preview.map((r) => (
                  <tr key={r.line}>
                    <td className="td text-slate-500">{r.line}</td>
                    {r.cells.map((c, i) => <td key={i} className="td">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
