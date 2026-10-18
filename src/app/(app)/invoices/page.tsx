import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { FileText, Plus, Repeat, Upload } from "lucide-react";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { getVisibleFields } from "@/server/custom-fields";
import { resolveColumns } from "@/server/columns";
import { saveColumns } from "@/server/list-actions";
import { invoiceScope } from "@/server/scope";
import { invoiceStateWhere } from "@/server/invoice-queries";
import { generateDueRecurringInvoices } from "@/server/recurring-invoices";
import { Card, LinkButton } from "@/components/ui";
import { ColumnChooser } from "@/components/column-chooser";
import { Pagination, buildHref, pageSizeParam } from "@/components/list-tools";
import { ListToolbar, ToolbarSelect } from "@/components/list-toolbar";
import { InvoiceTable } from "@/components/invoice-table";
import { INVOICE_STATE_LABEL, type InvoiceState } from "@/lib/invoice-status";
import { can } from "@/lib/permissions";
import { todayISO } from "@/lib/format";
import { intParam, strParam } from "@/lib/utils";

export const metadata = { title: "Invoices" };
const STATES = Object.keys(INVOICE_STATE_LABEL) as InvoiceState[];
const BUILTIN = [
  { key: "tax", label: "Total tax", default: true },
  { key: "date", label: "Date", default: true },
  { key: "order", label: "Order", default: true },
  { key: "tags", label: "Tags", default: true },
  { key: "due", label: "Due date", default: true },
  { key: "balance", label: "Balance", default: false },
];

type SP = { q?: string; status?: string; page?: string; size?: string; recurring?: string };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("invoices.view", "invoices.view_own");
  await generateDueRecurringInvoices().catch((err) => console.error("recurring invoices failed", err));
  const sp = await searchParams;
  const q = strParam(sp.q);
  const status = (STATES as string[]).includes(strParam(sp.status)) ? (strParam(sp.status) as InvoiceState) : "";
  const recurring = strParam(sp.recurring) === "1";
  const page = intParam(sp.page, 1);
  const size = pageSizeParam(sp.size);
  const today = todayISO();
  const i = schema.invoices;

  const fields = await getVisibleFields("invoices", user);
  const cols = await resolveColumns(user.id, "invoices", BUILTIN, fields);

  const like = `%${q}%`;
  const where = and(
    invoiceScope(user),
    q
      ? or(ilike(i.number, like), ilike(schema.customers.company, like), ilike(i.orderRef, like), sql`array_to_string(${i.tags}, ',') ilike ${like}`, sql`${i.custom}::text ilike ${like}`)
      : undefined,
    status ? invoiceStateWhere(status, today) : undefined,
    recurring ? sql`${i.repeatEvery} is not null` : undefined,
  );

  const rows = await db
    .select({
      id: i.id, number: i.number, status: i.status, date: i.date, dueDate: i.dueDate, total: i.total,
      amountPaid: i.amountPaid, cgst: i.cgst, sgst: i.sgst, igst: i.igst, custom: i.custom, orderRef: i.orderRef,
      tags: i.tags, repeatEvery: i.repeatEvery, customerId: i.customerId, customerName: schema.customers.company,
      count: sql<number>`count(*) over()::int`,
    })
    .from(i)
    .innerJoin(schema.customers, eq(schema.customers.id, i.customerId))
    .where(where)
    .orderBy(desc(i.date), desc(i.id))
    .limit(size)
    .offset((page - 1) * size);
  const params = { q: q || undefined, status: status || undefined, size: size === 25 ? undefined : String(size), recurring: recurring ? "1" : undefined };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {can(user, "invoices.create") ? (
            <LinkButton href="/invoices/new"><Plus className="size-4" /> Create new invoice</LinkButton>
          ) : null}
          {can(user, "payments.create") ? (
            <LinkButton href="/invoices/batch-payments"><FileText className="size-4" /> Batch payments</LinkButton>
          ) : null}
          {can(user, "invoices.create") ? <LinkButton variant="secondary" href="/import/invoices"><Upload className="size-4" /> Import</LinkButton> : null}
          <LinkButton variant="secondary" href={recurring ? "/invoices" : "/invoices?recurring=1"}>
            <Repeat className="size-4" /> {recurring ? "All invoices" : "Recurring invoices"}
          </LinkButton>
        </div>
        <ColumnChooser columns={cols.options} selected={cols.selected} save={saveColumns.bind(null, "invoices")} />
      </div>
      {recurring ? <h1 className="mb-3 text-lg font-semibold text-slate-900">Recurring invoices</h1> : <h1 className="sr-only">Invoices</h1>}
      <Card>
        <ListToolbar
          exportHref={buildHref("/api/export/invoices", { q: q || undefined })}
          searchPlaceholder="Invoice #, customer, order, tag…"
          extra={
            <ToolbarSelect
              name="status"
              label="Status"
              options={[{ value: "", label: "All statuses" }, ...STATES.map((s) => ({ value: s, label: INVOICE_STATE_LABEL[s] }))]}
            />
          }
        />
        <InvoiceTable rows={rows} today={today} show={cols.show} customColumns={cols.visibleFields} />
        <Pagination base="/invoices" page={page} pageSize={size} total={rows[0]?.count ?? 0} params={params} />
      </Card>
    </>
  );
}
