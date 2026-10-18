import Link from "next/link";
import Form from "next/form";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function buildHref(base: string, params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export function SearchBox({
  action,
  defaultValue,
  placeholder = "Search…",
  hidden = {},
}: {
  action: string;
  defaultValue: string;
  placeholder?: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <Form action={action} className="relative w-full max-w-xs">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input name="q" type="search" defaultValue={defaultValue} placeholder={placeholder} aria-label="Search" className="input pl-9" />
    </Form>
  );
}

export function Pagination({
  base,
  page,
  pageSize,
  total,
  params,
}: {
  base: string;
  page: number;
  pageSize: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = (p: number) => buildHref(base, { ...params, page: p === 1 ? undefined : p });
  // 1 … 4 5 [6] 7 8 … 28
  const nums = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-slate-500">
      <span>
        Showing {from} to {to} of {total} entries
      </span>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <PageLink href={link(page - 1)} disabled={page <= 1}>
          Previous
        </PageLink>
        {nums.map((n, i) => (
          <span key={n} className="flex items-center gap-1">
            {i > 0 && n - nums[i - 1]! > 1 ? <span className="px-1">…</span> : null}
            {n === page ? (
              <span aria-current="page" className="rounded-md bg-brand-600 px-3 py-1 font-medium text-white">{n}</span>
            ) : (
              <Link href={link(n)} className="rounded-md px-3 py-1 hover:bg-slate-100 hover:text-slate-800">{n}</Link>
            )}
          </span>
        ))}
        <PageLink href={link(page + 1)} disabled={page >= pages}>
          Next
        </PageLink>
      </nav>
    </div>
  );
}

/** Reads the `size` query param (10/25/50/100). */
export function pageSizeParam(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return [10, 25, 50, 100].includes(n) ? n : 25;
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="rounded-md px-3 py-1 text-slate-300">{children}</span>;
  return (
    <Link href={href} className="rounded-md px-3 py-1 hover:bg-slate-100 hover:text-slate-800">
      {children}
    </Link>
  );
}

export function FilterTabs({
  base,
  current,
  tabs,
  params,
}: {
  base: string;
  current: string;
  tabs: { value: string; label: string; count?: number }[];
  params: Record<string, string | undefined>;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={buildHref(base, { ...params, status: t.value || undefined, page: undefined })}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium",
            current === t.value ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {t.label}
          {t.count !== undefined ? <span className="ml-1.5 opacity-75">{t.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}
