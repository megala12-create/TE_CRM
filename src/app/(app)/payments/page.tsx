import { and, desc, gte, ilike, lte, or, sql } from "drizzle-orm";
import { Download } from "lucide-react";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { paymentRowsQuery } from "@/server/payment-queries";
import { Card, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { Pagination, SearchBox, buildHref } from "@/components/list-tools";
import { PaymentTable } from "@/components/payment-table";
import { formatINR } from "@/lib/money";
import { todayISO } from "@/lib/format";
import { intParam, strParam } from "@/lib/utils";

export const metadata = { title: "Payments" };
const PAGE_SIZE = 25;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requirePermission("payments.view");
  const sp = await searchParams;
  const q = strParam(sp.q);
  const page = intParam(sp.page, 1);
  const p = schema.payments;
  const like = `%${q}%`;
  const where = q ? or(ilike(schema.customers.company, like), ilike(p.reference, like), ilike(schema.invoices.number, like)) : undefined;

  const today = todayISO();
  const monthStart = `${today.slice(0, 8)}01`;
  const [rows, [sums]] = await Promise.all([
    paymentRowsQuery().where(where).orderBy(desc(p.date), desc(p.id)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db
      .select({
        month: sql<string>`coalesce(sum(${p.amount}) filter (where ${p.date} >= ${monthStart}), 0)`,
        today: sql<string>`coalesce(sum(${p.amount}) filter (where ${p.date} = ${today}), 0)`,
      })
      .from(p)
      .where(and(gte(p.date, `${Number(today.slice(0, 4)) - 1}-01-01`), lte(p.date, today))),
  ]);

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Record payments from an invoice's page."
        actions={
          <LinkButton variant="secondary" href={buildHref("/api/export/payments", { q: q || undefined })} prefetch={false}>
            <Download className="size-4" /> Export
          </LinkButton>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard label="Received today" value={formatINR(sums?.today)} tone="green" />
        <StatCard label="Received this month" value={formatINR(sums?.month)} tone="blue" />
      </div>
      <Card>
        <div className="flex justify-end border-b border-slate-200 p-3">
          <SearchBox action="/payments" defaultValue={q} placeholder="Customer, invoice #, reference" />
        </div>
        <PaymentTable rows={rows} />
        <Pagination base="/payments" page={page} pageSize={PAGE_SIZE} total={rows[0]?.totalRows ?? 0} params={{ q: q || undefined }} />
      </Card>
    </>
  );
}
