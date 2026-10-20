import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { getVisibleFields } from "@/server/custom-fields";
import { resolveColumns } from "@/server/columns";
import { saveColumns } from "@/server/list-actions";
import { customerScope } from "@/server/scope";
import { Badge, Card, EmptyState, LinkButton } from "@/components/ui";
import { ColumnChooser } from "@/components/column-chooser";
import { Pagination, buildHref, pageSizeParam, pageSizeQuery } from "@/components/list-tools";
import { ListToolbar, ToolbarSelect } from "@/components/list-toolbar";
import { displayCustomValue } from "@/lib/custom-fields";
import { CREDIT_NOTE_STATUSES, CREDIT_NOTE_STATUS_LABEL, CREDIT_NOTE_STATUS_TONE, type CreditNoteStatus } from "@/lib/doc-status";
import { can } from "@/lib/permissions";
import { formatINR, fromPaise, toPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { intParam, strParam } from "@/lib/utils";

export const metadata = { title: "Credit notes" };
const BUILTIN = [
  { key: "date", label: "Credit note date", default: true },
  { key: "project", label: "Project", default: true },
  { key: "reference", label: "Reference #", default: true },
  { key: "amount", label: "Amount", default: true },
  { key: "remaining", label: "Remaining amount", default: true },
];

type SP = { q?: string; status?: string; page?: string; size?: string };

export default async function CreditNotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("credit_notes.view");
  const sp = await searchParams;
  const q = strParam(sp.q);
  const status = (CREDIT_NOTE_STATUSES as readonly string[]).includes(strParam(sp.status)) ? strParam(sp.status) : "";
  const page = intParam(sp.page, 1);
  const size = pageSizeParam(sp.size);
  const c = schema.creditNotes;

  const fields = await getVisibleFields("credit_notes", user);
  const cols = await resolveColumns(user.id, "credit_notes", BUILTIN, fields);
  const like = `%${q}%`;
  const rows = await db
    .select({
      id: c.id, number: c.number, date: c.date, status: c.status, project: c.project, reference: c.reference, invoiceId: c.invoiceId,
      total: c.total, amountApplied: c.amountApplied, amountRefunded: c.amountRefunded, custom: c.custom,
      customerId: c.customerId, customer: schema.customers.company, count: sql<number>`count(*) over()::int`,
    })
    .from(c)
    .innerJoin(schema.customers, eq(schema.customers.id, c.customerId))
    .where(
      and(
        customerScope(user),
        status ? eq(c.status, status) : undefined,
        q ? or(ilike(c.number, like), ilike(schema.customers.company, like), ilike(c.reference, like), ilike(c.project, like)) : undefined,
      ),
    )
    .orderBy(desc(c.id))
    .limit(size)
    .offset((page - 1) * size);
  const params = { q: q || undefined, status: status || undefined, size: pageSizeQuery(size) };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {can(user, "credit_notes.create") ? <LinkButton href="/credit-notes/new"><Plus className="size-4" /> New credit note</LinkButton> : <span />}
        <ColumnChooser columns={cols.options} selected={cols.selected} save={saveColumns.bind(null, "credit_notes")} />
      </div>
      <h1 className="sr-only">Credit notes</h1>
      <Card>
        <ListToolbar
          exportHref={buildHref("/api/export/credit_notes", { q: q || undefined })}
          searchPlaceholder="Number, customer, reference…"
          extra={<ToolbarSelect name="status" label="Status" options={[{ value: "", label: "All statuses" }, ...CREDIT_NOTE_STATUSES.map((s) => ({ value: s, label: CREDIT_NOTE_STATUS_LABEL[s] }))]} />}
        />
        {rows.length === 0 ? (
          <EmptyState title="No credit notes found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Credit note #</th>
                  {cols.show("date") && <th className="th">Credit note date</th>}
                  <th className="th">Customer</th>
                  <th className="th">Status</th>
                  {cols.show("project") && <th className="th">Project</th>}
                  {cols.show("reference") && <th className="th">Reference #</th>}
                  {cols.visibleFields.map((f) => <th key={f.key} className="th">{f.label}</th>)}
                  {cols.show("amount") && <th className="th text-right">Amount</th>}
                  {cols.show("remaining") && <th className="th text-right">Remaining amount</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = r.status as CreditNoteStatus;
                  const remaining = r.status === "void" ? 0 : toPaise(r.total) - toPaise(r.amountApplied) - toPaise(r.amountRefunded);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="td whitespace-nowrap"><Link href={`/credit-notes/${r.id}`} className="link">{r.number}</Link></td>
                      {cols.show("date") && <td className="td whitespace-nowrap">{formatDate(r.date)}</td>}
                      <td className="td"><Link href={`/customers/${r.customerId}`} className="link font-normal">{r.customer}</Link></td>
                      <td className="td"><Badge tone={CREDIT_NOTE_STATUS_TONE[st] ?? "slate"}>{CREDIT_NOTE_STATUS_LABEL[st] ?? r.status}</Badge></td>
                      {cols.show("project") && <td className="td">{r.project}</td>}
                      {cols.show("reference") && (
                        <td className="td whitespace-nowrap">{r.invoiceId ? <Link href={`/invoices/${r.invoiceId}`} className="link font-normal">{r.reference}</Link> : r.reference}</td>
                      )}
                      {cols.visibleFields.map((f) => <td key={f.key} className="td">{displayCustomValue(f, r.custom[f.key])}</td>)}
                      {cols.show("amount") && <td className="td whitespace-nowrap text-right tabular-nums">{formatINR(r.total)}</td>}
                      {cols.show("remaining") && <td className="td whitespace-nowrap text-right tabular-nums">{formatINR(fromPaise(remaining))}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination base="/credit-notes" page={page} pageSize={size} total={rows[0]?.count ?? 0} params={params} />
      </Card>
    </>
  );
}
