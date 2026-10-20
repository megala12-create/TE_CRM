"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** Perfex-style table toolbar: page size · Export · refresh … search. Keeps other query params. */
export function ListToolbar({ exportHref, extra, searchPlaceholder = "Search…" }: { exportHref?: string; extra?: ReactNode; searchPlaceholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const go = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page");
    start(() => router.push(`${pathname}${sp.size ? `?${sp}` : ""}`));
  };

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3", pending && "opacity-70")}>
      <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-slate-300 bg-white text-sm shadow-xs">
          <select
            aria-label="Rows per page"
            value={params.get("size") ?? "25"}
            onChange={(e) => go({ size: e.target.value === "25" ? null : e.target.value })}
            className="border-r border-slate-300 bg-transparent px-2 py-1.5"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
            <option value="all">All</option>
          </select>
          {exportHref ? (
            <Link href={exportHref} prefetch={false} className="border-r border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50">
              Export
            </Link>
          ) : null}
          <button type="button" onClick={() => start(() => router.refresh())} className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-50" aria-label="Refresh" title="Refresh">
            <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
          </button>
        </div>
        {extra}
      </div>
      <form
        className="relative w-full max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() });
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input name="q" type="search" defaultValue={params.get("q") ?? ""} placeholder={searchPlaceholder} aria-label="Search" className="input pl-9" />
      </form>
    </div>
  );
}

/** A select in the toolbar that sets one query param (e.g. status filter). */
export function ToolbarSelect({ name, label, options }: { name: string; label: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, start] = useTransition();
  return (
    <select
      aria-label={label}
      value={params.get(name) ?? ""}
      onChange={(e) => {
        const sp = new URLSearchParams(params.toString());
        if (e.target.value) sp.set(name, e.target.value);
        else sp.delete(name);
        sp.delete("page");
        start(() => router.push(`${pathname}${sp.size ? `?${sp}` : ""}`));
      }}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-xs"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
