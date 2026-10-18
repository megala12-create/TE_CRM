"use client";

import { useState, type ReactNode } from "react";
import Form from "next/form";
import Link from "next/link";
import { KeyRound, LogOut, Menu, Search } from "lucide-react";
import { Sidebar } from "./sidebar";
import type { NavItem } from "@/lib/navigation";
import { initials } from "@/lib/format";

export function AppFrame({
  nav,
  user,
  logout,
  children,
}: {
  nav: NavItem[];
  user: { name: string; email: string; roleName: string | null };
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <Sidebar items={nav} open={open} onNavigate={() => setOpen(false)} />
      {open ? (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      ) : null}
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <Form action="/search" className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              name="q"
              type="search"
              placeholder="Search customers, invoices, GSTIN, phone…"
              aria-label="Search"
              className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </Form>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-slate-800">{user.name}</div>
              <div className="text-xs text-slate-500">{user.roleName ?? "No role"}</div>
            </div>
            <div className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white" aria-hidden>
              {initials(user.name)}
            </div>
            <Link href="/account/password" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Change password" aria-label="Change password">
              <KeyRound className="size-4" />
            </Link>
            <form action={logout}>
              <button type="submit" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Log out" aria-label="Log out">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
