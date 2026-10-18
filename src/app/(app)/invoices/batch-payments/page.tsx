import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { invoiceScope } from "@/server/scope";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { PAYMENT_MODES } from "@/lib/invoice-status";
import { formatINR, fromPaise, toPaise } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/format";
import { intParam } from "@/lib/utils";
import { recordBatchPayments } from "../actions";

export const metadata = { title: "Batch payments" };

export default async function BatchPaymentsPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const user = await requirePermission("payments.create");
  const customerId = intParam((await searchParams).customer, 0);
  const i = schema.invoices;
  const open = await db
    .select({
      id: i.id, number: i.number, date: i.date, dueDate: i.dueDate, total: i.total, amountPaid: i.amountPaid,
      customerId: i.customerId, customer: schema.customers.company,
    })
    .from(i)
    .innerJoin(schema.customers, eq(schema.customers.id, i.customerId))
    .where(and(eq(i.status, "issued"), sql`${i.amountPaid} < ${i.total}`, invoiceScope(user), customerId ? eq(i.customerId, customerId) : undefined))
    .orderBy(asc(schema.customers.company), asc(i.dueDate))
    .limit(500);
  const customers = [...new Map(open.map((o) => [o.customerId, o.customer])).entries()];
  const today = todayISO();

  return (
    <>
      <PageHeader
        title="Batch payments"
        subtitle="Record payments for many invoices at once — fill the amount only on the invoices that were paid."
        actions={<Link href="/invoices" className="link text-sm">Back to invoices</Link>}
      />
      <ActionForm action={recordBatchPayments} className="space-y-4">
        <section className="card flex flex-wrap items-end gap-4 p-4">
          <div>
            <label htmlFor="date" className="label">Payment date</label>
            <input id="date" name="date" type="date" defaultValue={today} max={today} required className="input" />
            <FieldError name="date" />
          </div>
          <div>
            <label htmlFor="mode" className="label">Payment mode</label>
            <select id="mode" name="mode" defaultValue="bank" className="input">
              {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <FieldError name="mode" />
          </div>
          <div className="ml-auto text-sm">
            <span className="text-slate-500">Customer: </span>
            <Link href="/invoices/batch-payments" className={customerId ? "link" : "font-semibold"}>All</Link>
            {customers.slice(0, 12).map(([id, name]) => (
              <span key={id}> · <Link href={`/invoices/batch-payments?customer=${id}`} className={id === customerId ? "font-semibold" : "link"}>{name}</Link></span>
            ))}
          </div>
        </section>
        <Card>
          {open.length === 0 ? (
            <EmptyState title="No unpaid invoices" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Invoice #</th>
                    <th className="th">Customer</th>
                    <th className="th">Date</th>
                    <th className="th">Due date</th>
                    <th className="th text-right">Total</th>
                    <th className="th text-right">Balance due</th>
                    <th className="th w-40">Amount received (₹)</th>
                    <th className="th w-44">Reference / UTR</th>
                  </tr>
                </thead>
                <tbody>
                  {open.map((o) => {
                    const balance = toPaise(o.total) - toPaise(o.amountPaid);
                    return (
                      <tr key={o.id}>
                        <td className="td whitespace-nowrap"><Link href={`/invoices/${o.id}`} className="link">{o.number}</Link></td>
                        <td className="td">{o.customer}</td>
                        <td className="td whitespace-nowrap">{formatDate(o.date)}</td>
                        <td className={`td whitespace-nowrap ${o.dueDate < today ? "text-red-600" : ""}`}>{formatDate(o.dueDate)}</td>
                        <td className="td text-right tabular-nums">{formatINR(o.total)}</td>
                        <td className="td text-right font-medium tabular-nums">{formatINR(fromPaise(balance))}</td>
                        <td className="td">
                          <input name={`amount_${o.id}`} type="number" step="0.01" min="0" max={fromPaise(balance)} placeholder={fromPaise(balance)} className="input" aria-label={`Amount for ${o.number}`} />
                          <FieldError name={`amount_${o.id}`} />
                        </td>
                        <td className="td"><input name={`reference_${o.id}`} className="input" aria-label={`Reference for ${o.number}`} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {open.length ? (
          <div className="flex justify-end">
            <SubmitButton>Record payments</SubmitButton>
          </div>
        ) : null}
      </ActionForm>
    </>
  );
}
