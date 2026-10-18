import { and, desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { invoiceScope, loadCustomer } from "@/server/scope";
import { Card, LinkButton } from "@/components/ui";
import { InvoiceTable } from "@/components/invoice-table";
import { can } from "@/lib/permissions";
import { todayISO } from "@/lib/format";

export default async function CustomerInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("invoices.view", "invoices.view_own");
  const customer = await loadCustomer(user, Number((await params).id));
  const i = schema.invoices;
  const rows = await db
    .select({
      id: i.id, number: i.number, status: i.status, date: i.date, dueDate: i.dueDate, total: i.total,
      amountPaid: i.amountPaid, cgst: i.cgst, sgst: i.sgst, igst: i.igst, custom: i.custom,
      customerId: i.customerId, customerName: schema.customers.company,
    })
    .from(i)
    .innerJoin(schema.customers, eq(schema.customers.id, i.customerId))
    .where(and(eq(i.customerId, customer.id), invoiceScope(user)))
    .orderBy(desc(i.date), desc(i.id))
    .limit(500);
  return (
    <Card
      title="Invoices"
      actions={can(user, "invoices.create") ? <LinkButton href={`/invoices/new?customer=${customer.id}`}><Plus className="size-4" /> Create invoice</LinkButton> : null}
    >
      <InvoiceTable rows={rows} today={todayISO()} showCustomer={false} />
    </Card>
  );
}
