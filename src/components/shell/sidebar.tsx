"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BadgeCheck, BookOpen, Boxes, Calendar, ChartLine, CheckCircle2, ChevronDown, ClipboardList, Cog, Factory,
  FileSignature, FileText, Home, IndianRupee, Layers, MessageCircle, Palette, Phone, Receipt, Repeat, Settings,
  ShoppingCart, TrendingUp, User, Users, Wrench, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation";

const ICONS: Record<string, LucideIcon> = {
  home: Home, palette: Palette, phone: Phone, message: MessageCircle, user: User, receipt: Receipt, users: Users,
  factory: Factory, trend: TrendingUp, cart: ShoppingCart, boxes: Boxes, rupee: IndianRupee, badge: BadgeCheck,
  calendar: Calendar, wrench: Wrench, repeat: Repeat, file: FileText, contract: FileSignature,
  clipboard: ClipboardList, check: CheckCircle2, book: BookOpen, cog: Cog, chart: ChartLine, layers: Layers,
  settings: Settings,
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ items, open, onNavigate }: { items: NavItem[]; open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<string | null>(
    () => items.find((i) => i.children?.some((c) => isActive(pathname, c.href)))?.label ?? null,
  );

  return (
    <aside
      className={cn(
        "no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-nav text-nav-text transition-transform lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <Link href="/" className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5" onClick={onNavigate}>
        <Image src="/logo.png" alt="" width={36} height={36} className="rounded bg-white p-0.5" priority />
        <span className="text-[15px] font-semibold leading-tight tracking-wide text-white">
          TIRUPPUR
          <br />
          EMBOSSING
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-2 py-3 text-sm" aria-label="Main">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const Icon = ICONS[item.icon] ?? FileText;
            const active = isActive(pathname, item.href) || !!item.children?.some((c) => isActive(pathname, c.href));
            if (item.children?.length) {
              const isOpen = expanded === item.label;
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : item.label)}
                    aria-expanded={isOpen}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-nav-hover hover:text-white",
                      active && "text-white",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    <ChevronDown className={cn("size-4 transition-transform", isOpen ? "rotate-0" : "-rotate-90")} aria-hidden />
                  </button>
                  {isOpen ? (
                    <ul className="mt-0.5 space-y-0.5 pl-9">
                      {item.children.map((c) => (
                        <li key={c.href}>
                          <Link
                            href={c.href}
                            onClick={onNavigate}
                            className={cn(
                              "flex items-center justify-between rounded-md px-3 py-1.5 hover:bg-nav-hover hover:text-white",
                              isActive(pathname, c.href) && "bg-brand-600 text-white hover:bg-brand-600",
                            )}
                          >
                            {c.label}
                            {c.planned ? <PlannedDot /> : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            }
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-nav-hover hover:text-white",
                    active && "bg-brand-600 text-white hover:bg-brand-600",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.planned ? <PlannedDot /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

function PlannedDot() {
  return <span className="size-1.5 rounded-full bg-amber-400/70" title="Planned module" aria-label="Planned" />;
}
