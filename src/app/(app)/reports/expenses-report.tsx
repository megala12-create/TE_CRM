import Link from "next/link";
import Form from "next/form";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { Download } from "lucide-react";
import { db, schema } from "@/db";
import { expenseScope } from "@/server/scope";
import type { CurrentUser } from "@/server/auth";
import { Card, EmptyState, LinkButton } from "@/components/ui";
import { ColumnChart } from "@/components/column-chart";
import { formatPaise, toPaise } from "@/lib/money";
import { buildHref } from "@/components/list-tools";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Reports → Expenses: category × month matrix for a year, plus billable / not-billable charts. */
export async function ExpensesReport({ user, year, excludeBillable }: { user: CurrentUser; year: number; excludeBillable: boolean }) {
  const e = schema.expenses;
  const inYear = and(gte(e.date, `${year}-01-01`), lte(e.date, `${year}-12-31`), expenseScope(user));
  const [cells, categories, byBillable, years] = await Promise.all([
    db
      .select({
        categoryId: e.categoryId,
        month: sql<number>`extract(month from ${e.date})::int`,
        amount: sql<string>`sum(${e.amount})`,
        tax: sql<string>`sum(${e.taxAmount})`,
      })
      .from(e)
      .where(and(inYear, excludeBillable ? eq(e.billable, false) : undefined))
      .groupBy(e.categoryId, sql`extract(month from ${e.date})`),
    db.select({ id: schema.expenseCategories.id, name: schema.expenseCategories.name }).from(schema.expenseCategories).orderBy(schema.expenseCategories.name),
    db
      .select({ categoryId: e.categoryId, billable: e.billable, total: sql<string>`sum(${e.total})` })
      .from(e)
      .where(inYear)
      .groupBy(e.categoryId, e.billable),
    db.selectDistinct({ y: sql<number>`extract(year from ${e.date})::int` }).from(e).where(expenseScope(user)),
  ]);

  const cell = (catId: number, m: number) => cells.find((c) => c.categoryId === catId && c.month === m);
  const monthNet = (m: number) => cells.filter((c) => c.month === m).reduce((s, c) => s + toPaise(c.amount), 0);
  const monthTax = (m: number) => cells.filter((c) => c.month === m).reduce((s, c) => s + toPaise(c.tax), 0);
  const catYear = (catId: number) => cells.filter((c) => c.categoryId === catId).reduce((s, c) => s + toPaise(c.amount), 0);
  const yearNet = cells.reduce((s, c) => s + toPaise(c.amount), 0);
  const yearTax = cells.reduce((s, c) => s + toPaise(c.tax), 0);
  const yearOptions = [...new Set([year, new Date().getFullYear(), ...years.map((y) => y.y)])].sort((a, b) => b - a);
  const chartValues = (billable: boolean) =>
    categories.map((c) => toPaise(byBillable.find((b) => b.categoryId === c.id && b.billable === billable)?.total) / 100);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Form action="/reports/expenses" className="flex flex-wrap items-center gap-3">
          <select name="year" defaultValue={year} className="input w-auto" aria-label="Year">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="exclude_billable" value="1" defaultChecked={excludeBillable} className="size-4 accent-brand-600" />
            Exclude billable expenses
          </label>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Apply</button>
        </Form>
        <div className="flex gap-2">
          <LinkButton variant="secondary" href={buildHref("/api/export/expenses", {})} prefetch={false}><Download className="size-4" /> Export</LinkButton>
          <LinkButton href={`/expenses?year=${year}`} className="bg-emerald-600 hover:bg-emerald-700">Detailed report</LinkButton>
        </div>
      </div>
      <h1 className="sr-only">Expenses report {year}</h1>

      <Card>
        {categories.length === 0 ? <EmptyState title="No expense categories yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="th">Category</th>
                  {MONTHS.map((m) => <th key={m} className="th text-right">{m}</th>)}
                  <th className="th text-right">Year ({year})</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap font-medium text-slate-800">
                      <Link href={`/expenses?year=${year}&category=${c.id}`} className="hover:underline">{c.name}</Link>
                    </td>
                    {MONTHS.map((_, i) => <td key={i} className="td whitespace-nowrap text-right tabular-nums">{formatPaise(toPaise(cell(c.id, i + 1)?.amount))}</td>)}
                    <td className="td whitespace-nowrap text-right font-medium tabular-nums">{formatPaise(catYear(c.id))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-semibold">
                <tr>
                  <td className="td">Net amount (subtotal)</td>
                  {MONTHS.map((_, i) => <td key={i} className="td whitespace-nowrap text-right tabular-nums">{formatPaise(monthNet(i + 1))}</td>)}
                  <td className="td whitespace-nowrap text-right tabular-nums">{formatPaise(yearNet)}</td>
                </tr>
                <tr>
                  <td className="td">Total tax</td>
                  {MONTHS.map((_, i) => <td key={i} className="td whitespace-nowrap text-right tabular-nums">{formatPaise(monthTax(i + 1))}</td>)}
                  <td className="td whitespace-nowrap text-right tabular-nums">{formatPaise(yearTax)}</td>
                </tr>
                <tr>
                  <td className="td">Total</td>
                  {MONTHS.map((_, i) => <td key={i} className="td whitespace-nowrap text-right tabular-nums">{formatPaise(monthNet(i + 1) + monthTax(i + 1))}</td>)}
                  <td className="td whitespace-nowrap text-right tabular-nums">{formatPaise(yearNet + yearTax)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Not billable expenses by categories">
          <div className="p-4">
            <ColumnChart ariaLabel={`Not billable expenses by category, ${year}`} categories={categories.map((c) => c.name)} series={[{ name: "Not billable", values: chartValues(false) }]} rotateLabels />
          </div>
        </Card>
        <Card title="Billable expenses by categories">
          <div className="p-4">
            <ColumnChart ariaLabel={`Billable expenses by category, ${year}`} categories={categories.map((c) => c.name)} series={[{ name: "Billable", values: chartValues(true) }]} rotateLabels />
          </div>
        </Card>
      </div>
    </>
  );
}
