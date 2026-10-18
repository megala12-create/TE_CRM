import Link from "next/link";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { invoiceScope } from "@/server/scope";
import type { CurrentUser } from "@/server/auth";
import { Card } from "@/components/ui";
import { ColumnChart } from "@/components/column-chart";
import { addDays } from "@/lib/format";
import { toPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export type PaymentPeriod = "weekly" | "monthly" | "yearly";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Ranges for "this" vs "last" period, plus how to bucket a date into a category index. */
function periodSetup(period: PaymentPeriod, today: string) {
  const [y, m] = today.split("-").map(Number) as [number, number];
  if (period === "yearly") {
    return {
      labels: ["This year", "Last year"],
      categories: MONTHS,
      cur: { from: `${y}-01-01`, to: `${y}-12-31` },
      prev: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
      bucket: (d: string) => Number(d.slice(5, 7)) - 1,
    };
  }
  if (period === "monthly") {
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    const end = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return {
      labels: ["This month", "Last month"],
      categories: Array.from({ length: 31 }, (_, i) => String(i + 1)),
      cur: { from: `${y}-${String(m).padStart(2, "0")}-01`, to: `${y}-${String(m).padStart(2, "0")}-${end(y, m)}` },
      prev: { from: `${py}-${String(pm).padStart(2, "0")}-01`, to: `${py}-${String(pm).padStart(2, "0")}-${end(py, pm)}` },
      bucket: (d: string) => Number(d.slice(8, 10)) - 1,
    };
  }
  // Weeks start on Monday
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -dow);
  return {
    labels: ["This week payments", "Last week payments"],
    categories: DAYS,
    cur: { from: monday, to: addDays(monday, 6) },
    prev: { from: addDays(monday, -7), to: addDays(monday, -1) },
    bucket: (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7,
  };
}

export async function PaymentRecords({ user, period, today, hrefFor }: { user: CurrentUser; period: PaymentPeriod; today: string; hrefFor: (p: PaymentPeriod) => string }) {
  const setup = periodSetup(period, today);
  const p = schema.payments;
  const sum = (range: { from: string; to: string }) =>
    db
      .select({ d: sql<string>`${p.date}::text`, amount: sql<string>`sum(${p.amount})` })
      .from(p)
      .innerJoin(schema.invoices, eq(schema.invoices.id, p.invoiceId))
      .where(and(gte(p.date, range.from), lte(p.date, range.to), invoiceScope(user)))
      .groupBy(p.date);
  const [cur, prev] = await Promise.all([sum(setup.cur), sum(setup.prev)]);
  const toSeries = (rows: { d: string; amount: string }[]) => {
    const values = setup.categories.map(() => 0);
    for (const r of rows) {
      const i = setup.bucket(r.d);
      if (i >= 0 && i < values.length) values[i]! += toPaise(r.amount) / 100;
    }
    return values;
  };

  return (
    <Card
      title="Payment records"
      actions={
        <div className="flex items-center gap-3 text-sm">
          <Link href="/reports/sales?report=payments" className="link">Full report</Link>
          <div className="flex overflow-hidden rounded-md border border-slate-200">
            {(["weekly", "monthly", "yearly"] as const).map((k) => (
              <Link key={k} href={hrefFor(k)} scroll={false} className={cn("px-2.5 py-1 capitalize", k === period ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50")}>
                {k}
              </Link>
            ))}
          </div>
        </div>
      }
    >
      <div className="p-4">
        <ColumnChart
          ariaLabel={`Payments received: ${setup.labels[0]} compared with ${setup.labels[1]}`}
          categories={setup.categories}
          series={[
            { name: setup.labels[0]!, values: toSeries(cur) },
            { name: setup.labels[1]!, values: toSeries(prev) },
          ]}
        />
      </div>
    </Card>
  );
}
