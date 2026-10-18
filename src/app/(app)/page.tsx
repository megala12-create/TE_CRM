import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { FileText } from "lucide-react";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { invoiceScope, quotationScope } from "@/server/scope";
import { Card, EmptyState, ProgressBar, type Tone } from "@/components/ui";
import { InvoiceTable } from "@/components/invoice-table";
import { buildHref } from "@/components/list-tools";
import { can } from "@/lib/permissions";
import { formatINR } from "@/lib/money";
import { todayISO } from "@/lib/format";
import { cn, intParam, strParam } from "@/lib/utils";
import { PaymentRecords, type PaymentPeriod } from "./payment-records";

export const metadata = { title: "Dashboard" };

type Row = { label: string; count: number; tone: Tone; href?: string };

/** One overview column: "N Label …… pct%" with a thin bar, like the previous CRM. */
function Overview({ title, rows, total, note }: { title: string; rows: Row[]; total: number; note?: string }) {
  const textTone: Record<Tone, string> = { slate: "text-slate-600", green: "text-emerald-700", amber: "text-amber-700", red: "text-red-600", blue: "text-brand-700" };
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FileText className="size-4 text-slate-400" aria-hidden /> {title}</h2>
      {rows.map((r) => {
        const pct = total ? (r.count / total) * 100 : 0;
        const body = (
          <>
            <div className="flex justify-between text-sm">
              <span className={textTone[r.tone]}>
                <span className="font-semibold tabular-nums">{r.count}</span> {r.label}
              </span>
              <span className="text-xs tabular-nums text-slate-400">{pct.toFixed(2)}%</span>
            </div>
            <ProgressBar value={pct} tone={r.tone} />
          </>
        );
        return r.href ? (
          <Link key={r.label} href={r.href} className="block space-y-1 rounded px-1 py-0.5 hover:bg-slate-50">{body}</Link>
        ) : (
          <div key={r.label} className="space-y-1 px-1 py-0.5">{body}</div>
        );
      })}
      {note ? <p className="text-xs text-slate-400">{note}</p> : null}
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ year?: string; payments?: string }> }) {
  const user = await requirePermission("dashboard.view");
  const sp = await searchParams;
  const today = todayISO();
  const year = intParam(sp.year, Number(today.slice(0, 4)));
  const period = (["weekly", "monthly", "yearly"].includes(strParam(sp.payments)) ? strParam(sp.payments) : "weekly") as PaymentPeriod;
  const showInvoices = can(user, "invoices.view") || can(user, "invoices.view_own");
  const showQuotations = can(user, "quotations.view") || can(user, "quotations.view_own");
  const i = schema.invoices;
  const inYear = sql`extract(year from ${i.date}) = ${year}`;

  const [inv, years, quo, recent] = await Promise.all([
    showInvoices
      ? db
          .select({
            all: sql<number>`count(*) filter (where ${i.status} <> 'cancelled')::int`,
            draft: sql<number>`count(*) filter (where ${i.status} = 'draft')::int`,
            notSent: sql<number>`count(*) filter (where ${i.status} = 'issued' and ${i.sentAt} is null)::int`,
            unpaid: sql<number>`count(*) filter (where ${i.status} = 'issued' and ${i.amountPaid} = 0 and ${i.total} > 0 and ${i.dueDate} >= ${today})::int`,
            partially: sql<number>`count(*) filter (where ${i.status} = 'issued' and ${i.amountPaid} > 0 and ${i.amountPaid} < ${i.total} and ${i.dueDate} >= ${today})::int`,
            overdue: sql<number>`count(*) filter (where ${i.status} = 'issued' and ${i.amountPaid} < ${i.total} and ${i.dueDate} < ${today})::int`,
            paid: sql<number>`count(*) filter (where ${i.status} = 'issued' and ${i.amountPaid} >= ${i.total})::int`,
            outstanding: sql<string>`coalesce(sum(${i.total} - ${i.amountPaid}) filter (where ${i.status} = 'issued'), 0)`,
            pastDue: sql<string>`coalesce(sum(${i.total} - ${i.amountPaid}) filter (where ${i.status} = 'issued' and ${i.dueDate} < ${today}), 0)`,
            paidAmt: sql<string>`coalesce(sum(${i.amountPaid}) filter (where ${i.status} = 'issued'), 0)`,
          })
          .from(i)
          .where(and(invoiceScope(user), inYear))
          .then((r) => r[0]!)
      : undefined,
    showInvoices ? db.selectDistinct({ y: sql<number>`extract(year from ${i.date})::int` }).from(i).where(invoiceScope(user)) : [],
    showQuotations
      ? db
          .select({ status: schema.quotations.status, n: sql<number>`count(*)::int` })
          .from(schema.quotations)
          .where(and(quotationScope(user), sql`extract(year from ${schema.quotations.date}) = ${year}`))
          .groupBy(schema.quotations.status)
      : [],
    showInvoices
      ? db
          .select({
            id: i.id, number: i.number, status: i.status, date: i.date, dueDate: i.dueDate, total: i.total, amountPaid: i.amountPaid,
            cgst: i.cgst, sgst: i.sgst, igst: i.igst, custom: i.custom, customerId: i.customerId, customerName: schema.customers.company,
          })
          .from(i)
          .innerJoin(schema.customers, eq(schema.customers.id, i.customerId))
          .where(invoiceScope(user))
          .orderBy(desc(i.updatedAt))
          .limit(8)
      : [],
  ]);

  const qCount = (s: string) => quo.find((r) => r.status === s)?.n ?? 0;
  const qTotal = quo.reduce((a, r) => a + r.n, 0);
  const yearOptions = [...new Set([year, Number(today.slice(0, 4)), ...years.map((y) => y.y)])].sort((a, b) => b - a);
  const href = (patch: Record<string, string | number | undefined>) =>
    buildHref("/", { year: year === Number(today.slice(0, 4)) ? undefined : year, payments: period === "weekly" ? undefined : period, ...patch });

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Dashboard</h1>
      {inv ? (
        <section className="card">
          <div className="grid gap-8 p-5 lg:grid-cols-3">
            <Overview
              title="Invoice overview"
              total={inv.all}
              rows={[
                { label: "Draft", count: inv.draft, tone: "slate", href: "/invoices?status=draft" },
                { label: "Not sent", count: inv.notSent, tone: "slate" },
                { label: "Unpaid", count: inv.unpaid, tone: "red", href: "/invoices?status=unpaid" },
                { label: "Partially paid", count: inv.partially, tone: "amber", href: "/invoices?status=partially_paid" },
                { label: "Overdue", count: inv.overdue, tone: "amber", href: "/invoices?status=overdue" },
                { label: "Paid", count: inv.paid, tone: "green", href: "/invoices?status=paid" },
              ]}
            />
            <Overview
              title="Estimate overview"
              total={0}
              note="Estimates module is coming next."
              rows={["Draft", "Not sent", "Sent", "Expired", "Declined", "Accepted"].map((l) => ({ label: l, count: 0, tone: "slate" as Tone }))}
            />
            {showQuotations ? (
              <Overview
                title="Quotation overview"
                total={qTotal}
                rows={[
                  { label: "Draft", count: qCount("draft"), tone: "slate", href: "/quotations?status=draft" },
                  { label: "Sent", count: qCount("sent"), tone: "blue", href: "/quotations?status=sent" },
                  { label: "Open", count: qCount("open"), tone: "blue", href: "/quotations?status=open" },
                  { label: "Revised", count: qCount("revised"), tone: "amber", href: "/quotations?status=revised" },
                  { label: "Declined", count: qCount("declined"), tone: "red", href: "/quotations?status=declined" },
                  { label: "Accepted", count: qCount("accepted"), tone: "green", href: "/quotations?status=accepted" },
                  { label: "Mark as accepted & SO", count: 0, tone: "green" },
                ]}
              />
            ) : null}
          </div>
          <div className="border-t border-slate-200 p-5">
            <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm" aria-label="Year">
              {yearOptions.map((y) => (
                <Link key={y} href={href({ year: y === Number(today.slice(0, 4)) ? undefined : y })} scroll={false}
                  className={cn("rounded-md px-2.5 py-1", y === year ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
                  {y}
                </Link>
              ))}
            </nav>
            <div className="grid gap-3 sm:grid-cols-3">
              <Link href="/invoices?status=unpaid" className="rounded-md border border-slate-200 px-4 py-3 hover:shadow-sm">
                <div className="text-sm font-medium text-amber-700">Outstanding invoices</div>
                <div className="text-lg font-semibold text-slate-900">{formatINR(inv.outstanding)}</div>
              </Link>
              <Link href="/invoices?status=overdue" className="rounded-md border border-slate-200 px-4 py-3 hover:shadow-sm">
                <div className="text-sm font-medium text-slate-600">Past due invoices</div>
                <div className="text-lg font-semibold text-slate-900">{formatINR(inv.pastDue)}</div>
              </Link>
              <Link href="/invoices?status=paid" className="rounded-md border border-slate-200 px-4 py-3 hover:shadow-sm">
                <div className="text-sm font-medium text-emerald-700">Paid invoices</div>
                <div className="text-lg font-semibold text-slate-900">{formatINR(inv.paidAmt)}</div>
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {can(user, "payments.view") && showInvoices ? (
        <PaymentRecords user={user} period={period} today={today} hrefFor={(p) => href({ payments: p === "weekly" ? undefined : p })} />
      ) : null}

      {showInvoices ? (
        <Card title="Recent invoices" actions={<Link href="/invoices" className="link text-sm">View all</Link>}>
          {recent.length ? <InvoiceTable rows={recent} today={today} show={(k) => ["date", "due"].includes(k)} /> : <EmptyState title="No invoices yet" />}
        </Card>
      ) : null}

      {!showInvoices ? (
        <Card><EmptyState title={`Welcome, ${user.name.split(" ")[0]}`}>Use the menu on the left to get started.</EmptyState></Card>
      ) : null}
    </div>
  );
}
