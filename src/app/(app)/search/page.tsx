import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth";
import { customerScope, invoiceScope } from "@/server/scope";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { can } from "@/lib/permissions";
import { formatINR } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/format";
import { INVOICE_STATE_LABEL, INVOICE_STATE_TONE, invoiceState } from "@/lib/invoice-status";
import { strParam } from "@/lib/utils";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const q = strParam((await searchParams).q).slice(0, 100);
  const like = `%${q}%`;
  const canCustomers = can(user, "customers.view") || can(user, "customers.view_own");
  const canInvoices = can(user, "invoices.view") || can(user, "invoices.view_own");

  const [customers, contacts, invoices] = q.length < 2 ? [[], [], []] : await Promise.all([
    canCustomers
      ? db.select({ id: schema.customers.id, company: schema.customers.company, gstin: schema.customers.gstin, city: schema.customers.city })
          .from(schema.customers)
          .where(and(customerScope(user), or(ilike(schema.customers.company, like), ilike(schema.customers.gstin, like), ilike(schema.customers.phone, like), ilike(schema.customers.email, like), sql`${schema.customers.custom}::text ilike ${like}`)))
          .limit(20)
      : [],
    canCustomers
      ? db.select({ id: schema.contacts.id, name: schema.contacts.name, phone: schema.contacts.phone, customerId: schema.customers.id, company: schema.customers.company })
          .from(schema.contacts)
          .innerJoin(schema.customers, eq(schema.customers.id, schema.contacts.customerId))
          .where(and(customerScope(user), or(ilike(schema.contacts.name, like), ilike(schema.contacts.phone, like), ilike(schema.contacts.email, like), ilike(schema.contacts.whatsapp, like))))
          .limit(20)
      : [],
    canInvoices
      ? db.select({ id: schema.invoices.id, number: schema.invoices.number, status: schema.invoices.status, date: schema.invoices.date, dueDate: schema.invoices.dueDate, total: schema.invoices.total, amountPaid: schema.invoices.amountPaid, company: schema.customers.company })
          .from(schema.invoices)
          .innerJoin(schema.customers, eq(schema.customers.id, schema.invoices.customerId))
          .where(and(invoiceScope(user), or(ilike(schema.invoices.number, like), ilike(schema.customers.company, like))))
          .orderBy(desc(schema.invoices.date))
          .limit(20)
      : [],
  ]);
  const today = todayISO();
  const nothing = customers.length + contacts.length + invoices.length === 0;

  return (
    <>
      <PageHeader title={q ? `Results for “${q}”` : "Search"} />
      {q.length < 2 ? (
        <Card><EmptyState title="Type at least 2 characters in the search bar" /></Card>
      ) : nothing ? (
        <Card><EmptyState title="Nothing found" /></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {customers.length ? (
            <Card title={`Customers (${customers.length})`}>
              <ul className="divide-y divide-slate-100">
                {customers.map((c) => (
                  <li key={c.id} className="px-4 py-2.5">
                    <Link href={`/customers/${c.id}`} className="link">{c.company}</Link>
                    <div className="text-xs text-slate-500">{[c.gstin, c.city].filter(Boolean).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {contacts.length ? (
            <Card title={`Contacts (${contacts.length})`}>
              <ul className="divide-y divide-slate-100">
                {contacts.map((c) => (
                  <li key={c.id} className="px-4 py-2.5">
                    <Link href={`/customers/${c.customerId}/contacts`} className="link">{c.name}</Link>
                    <div className="text-xs text-slate-500">{[c.company, c.phone].filter(Boolean).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {invoices.length ? (
            <Card title={`Invoices (${invoices.length})`}>
              <ul className="divide-y divide-slate-100">
                {invoices.map((inv) => {
                  const st = invoiceState(inv, today);
                  return (
                    <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div>
                        <Link href={`/invoices/${inv.id}`} className="link">{inv.number ?? `Draft #${inv.id}`}</Link>
                        <div className="text-xs text-slate-500">{inv.company} · {formatDate(inv.date)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium tabular-nums">{formatINR(inv.total)}</div>
                        <Badge tone={INVOICE_STATE_TONE[st]}>{INVOICE_STATE_LABEL[st]}</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
