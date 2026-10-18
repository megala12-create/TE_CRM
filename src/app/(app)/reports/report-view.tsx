import Link from "next/link";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { invoiceScope, expenseScope } from "@/server/scope";
import type { CurrentUser } from "@/server/auth";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { PeriodPicker } from "@/components/period-picker";
import { formatPaise, toPaise } from "@/lib/money";
import { periodText, resolvePeriod } from "@/lib/periods";
import { cn } from "@/lib/utils";

export type ReportKind = "sales" | "expenses" | "income-expense";

const TITLES: Record<ReportKind, string> = {
  sales: "Sales report",
  expenses: "Expenses report",
  "income-expense": "Expenses vs income",
};

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

export async function ReportView({ kind, user, sp, today }: { kind: ReportKind; user: CurrentUser; sp: Record<string, string>; today: string }) {
  const range = resolvePeriod(sp.period || "this_year", today, sp.from, sp.to);
  const i = schema.invoices;
  const e = schema.expenses;
  const month = (col: unknown) => sql<string>`to_char(${col}, 'YYYY-MM')`;

  const [sales, received, expenses, byCategory] = await Promise.all([
    db
      .select({ m: month(i.date), taxable: sql<string>`sum(${i.subtotal} - ${i.discount})`, tax: sql<string>`sum(${i.cgst} + ${i.sgst} + ${i.igst})`, total: sql<string>`sum(${i.total})`, n: sql<number>`count(*)::int` })
      .from(i)
      .where(and(eq(i.status, "issued"), gte(i.date, range.from), lte(i.date, range.to), invoiceScope(user)))
      .groupBy(month(i.date)),
    db
      .select({ m: month(schema.payments.date), amount: sql<string>`sum(${schema.payments.amount})` })
      .from(schema.payments)
      .innerJoin(i, eq(i.id, schema.payments.invoiceId))
      .where(and(gte(schema.payments.date, range.from), lte(schema.payments.date, range.to), invoiceScope(user)))
      .groupBy(month(schema.payments.date)),
    db
      .select({ m: month(e.date), amount: sql<string>`sum(${e.total})`, tax: sql<string>`sum(${e.taxAmount})` })
      .from(e)
      .where(and(gte(e.date, range.from), lte(e.date, range.to), expenseScope(user)))
      .groupBy(month(e.date)),
    db
      .select({ name: schema.expenseCategories.name, amount: sql<string>`sum(${e.total})` })
      .from(e)
      .innerJoin(schema.expenseCategories, eq(schema.expenseCategories.id, e.categoryId))
      .where(and(gte(e.date, range.from), lte(e.date, range.to), expenseScope(user)))
      .groupBy(schema.expenseCategories.name)
      .orderBy(sql`sum(${e.total}) desc`),
  ]);

  const months = [...new Set([...sales.map((r) => r.m), ...received.map((r) => r.m), ...expenses.map((r) => r.m)])].sort();
  const pick = <T extends { m: string }>(rows: T[], m: string) => rows.find((r) => r.m === m);
  const sum = (vals: (string | undefined)[]) => vals.reduce((a, v) => a + toPaise(v), 0);
  const totalSales = sum(sales.map((r) => r.total));
  const totalTax = sum(sales.map((r) => r.tax));
  const totalReceived = sum(received.map((r) => r.amount));
  const totalExpenses = sum(expenses.map((r) => r.amount));
  const totalSalesTaxable = sum(sales.map((r) => r.taxable));
  const totalExpenseTax = sum(expenses.map((r) => r.tax));

  return (
    <>
      <PageHeader title={TITLES[kind]} subtitle={periodText(range, (d) => d.split("-").reverse().join("-"))} />
      <div className="mb-4 flex flex-wrap gap-1">
        {(Object.keys(TITLES) as ReportKind[]).map((k) => (
          <Link key={k} href={`/reports/${k}`} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", k === kind ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
            {TITLES[k]}
          </Link>
        ))}
      </div>
      <div className="card mb-5 p-4">
        <PeriodPicker action={`/reports/${kind}`} period={range.period} from={range.from} to={range.to} />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kind !== "expenses" ? <StatCard label="Sales (incl. GST)" value={formatPaise(totalSales)} tone="green" /> : null}
        {kind === "sales" ? <StatCard label="Output GST" value={formatPaise(totalTax)} tone="blue" /> : null}
        {kind !== "expenses" ? <StatCard label="Received" value={formatPaise(totalReceived)} tone="blue" /> : null}
        {kind !== "sales" ? <StatCard label="Expenses" value={formatPaise(totalExpenses)} tone="amber" /> : null}
        {kind === "expenses" ? <StatCard label="GST paid on expenses" value={formatPaise(totalExpenseTax)} tone="blue" /> : null}
        {kind === "income-expense" ? (
          <StatCard label="Net (sales excl. GST − expenses excl. GST)" value={formatPaise(totalSalesTaxable - (totalExpenses - totalExpenseTax))} tone={totalSalesTaxable >= totalExpenses - totalExpenseTax ? "green" : "red"} />
        ) : null}
      </div>

      <div className={cn("grid gap-5", kind === "expenses" && "xl:grid-cols-[1fr_360px]")}>
        <Card title="By month">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Month</th>
                  {kind !== "expenses" ? (
                    <>
                      <th className="th text-right">Invoices</th>
                      <th className="th text-right">Taxable</th>
                      <th className="th text-right">GST</th>
                      <th className="th text-right">Sales</th>
                      <th className="th text-right">Received</th>
                    </>
                  ) : null}
                  {kind !== "sales" ? <th className="th text-right">Expenses</th> : null}
                  {kind === "income-expense" ? <th className="th text-right">Net</th> : null}
                </tr>
              </thead>
              <tbody>
                {months.length === 0 ? (
                  <tr><td className="td text-center text-slate-500" colSpan={8}>No data for this period.</td></tr>
                ) : (
                  months.map((m) => {
                    const s = pick(sales, m);
                    const r = pick(received, m);
                    const x = pick(expenses, m);
                    const net = toPaise(s?.taxable) - (toPaise(x?.amount) - toPaise(x?.tax));
                    return (
                      <tr key={m}>
                        <td className="td font-medium">{monthLabel(m)}</td>
                        {kind !== "expenses" ? (
                          <>
                            <td className="td text-right tabular-nums">{s?.n ?? 0}</td>
                            <td className="td text-right tabular-nums">{formatPaise(toPaise(s?.taxable))}</td>
                            <td className="td text-right tabular-nums">{formatPaise(toPaise(s?.tax))}</td>
                            <td className="td text-right tabular-nums">{formatPaise(toPaise(s?.total))}</td>
                            <td className="td text-right tabular-nums">{formatPaise(toPaise(r?.amount))}</td>
                          </>
                        ) : null}
                        {kind !== "sales" ? <td className="td text-right tabular-nums">{formatPaise(toPaise(x?.amount))}</td> : null}
                        {kind === "income-expense" ? (
                          <td className={cn("td text-right font-medium tabular-nums", net < 0 ? "text-red-600" : "text-emerald-700")}>{formatPaise(net)}</td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
        {kind === "expenses" ? (
          <Card title="By category">
            <ul className="divide-y divide-slate-100">
              {byCategory.map((c) => (
                <li key={c.name} className="flex justify-between px-4 py-2.5 text-sm">
                  <span>{c.name}</span>
                  <span className="tabular-nums font-medium">{formatPaise(toPaise(c.amount))}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
