"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function CustomerTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="card overflow-hidden" aria-label="Customer sections">
      <ul className="flex gap-0 overflow-x-auto lg:block">
        {tabs.map((t, i) => {
          const active = i === 0 ? pathname === t.href || pathname === `${t.href}/edit` : pathname.startsWith(t.href);
          return (
            <li key={t.href} className="shrink-0 lg:border-b lg:border-slate-100 lg:last:border-0">
              <Link
                href={t.href}
                className={cn(
                  "block px-4 py-2.5 text-sm",
                  active ? "bg-brand-50 font-semibold text-brand-700 lg:border-l-2 lg:border-brand-600" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
