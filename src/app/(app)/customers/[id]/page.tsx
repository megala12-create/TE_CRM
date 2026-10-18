import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { getVisibleFields } from "@/server/custom-fields";
import { invoiceScope, loadCustomer } from "@/server/scope";
import { Badge, Card, DefinitionList, LinkButton, StatCard } from "@/components/ui";
import { customFieldItems } from "@/components/custom-field-inputs";
import { can } from "@/lib/permissions";
import { formatINR, formatPaise, toPaise } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/format";

export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("customers.view", "customers.view_own");
  const customer = await loadCustomer(user, Number((await params).id));
  const [fields, owner] = await Promise.all([
    getVisibleFields("customers", user),
    customer.ownerId ? db.query.users.findFirst({ where: eq(schema.users.id, customer.ownerId), columns: { name: true } }) : null,
  ]);
  const showMoney = can(user, "invoices.view") || can(user, "invoices.view_own");
  const today = todayISO();
  const [money] = showMoney
    ? await db
        .select({
          outstanding: sql<string>`coalesce(sum(${schema.invoices.total} - ${schema.invoices.amountPaid}) filter (where ${schema.invoices.status} = 'issued'), 0)`,
          overdue: sql<string>`coalesce(sum(${schema.invoices.total} - ${schema.invoices.amountPaid}) filter (where ${schema.invoices.status} = 'issued' and ${schema.invoices.dueDate} < ${today}), 0)`,
          paid: sql<string>`coalesce(sum(${schema.invoices.amountPaid}) filter (where ${schema.invoices.status} = 'issued'), 0)`,
        })
        .from(schema.invoices)
        .where(and(eq(schema.invoices.customerId, customer.id), invoiceScope(user)))
    : [];
  const overLimit = toPaise(customer.creditLimit) > 0 && money && toPaise(money.outstanding) > toPaise(customer.creditLimit);

  return (
    <div className="space-y-5">
      {money ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Outstanding" value={formatINR(money.outstanding)} tone="amber" hint={overLimit ? "Above credit limit" : undefined} />
          <StatCard label="Overdue" value={formatINR(money.overdue)} tone="red" />
          <StatCard label="Received" value={formatINR(money.paid)} tone="green" />
        </div>
      ) : null}
      <Card
        title="Profile"
        actions={can(user, "customers.edit") ? <LinkButton variant="secondary" href={`/customers/${customer.id}/edit`}>Edit</LinkButton> : null}
      >
        <DefinitionList
          items={[
            { label: "Company", value: customer.company },
            { label: "GSTIN", value: customer.gstin && <span className="font-mono">{customer.gstin}</span> },
            { label: "Phone", value: customer.phone },
            { label: "Email", value: customer.email && <a href={`mailto:${customer.email}`} className="link">{customer.email}</a> },
            { label: "Address", value: [customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(", ") },
            { label: "PAN", value: customer.pan },
            { label: "Website", value: customer.website },
            { label: "Groups", value: customer.groups.length ? <div className="flex flex-wrap gap-1">{customer.groups.map((g) => <Link key={g} href={`/customers?group=${encodeURIComponent(g)}`}><Badge>{g}</Badge></Link>)}</div> : null },
            { label: "Account owner", value: owner?.name },
            { label: "Payment terms", value: `${customer.paymentTermsDays} days` },
            { label: "Credit limit", value: toPaise(customer.creditLimit) > 0 ? formatPaise(toPaise(customer.creditLimit)) : "No limit" },
            { label: "Customer since", value: formatDate(customer.createdAt) },
          ]}
        />
      </Card>
      {fields.length ? (
        <Card title="Additional details">
          <DefinitionList items={customFieldItems(fields, customer.custom)} />
        </Card>
      ) : null}
    </div>
  );
}
