import Link from "next/link";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { FileOutput, Paperclip, Plus, Repeat, Upload } from "lucide-react";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { getVisibleFields } from "@/server/custom-fields";
import { resolveColumns } from "@/server/columns";
import { saveColumns } from "@/server/list-actions";
import { expenseScope } from "@/server/scope";
import { generateDueRecurringExpenses } from "@/server/recurring-expenses";
import { Badge, Card, DefinitionList, EmptyState, LinkButton } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ColumnChooser } from "@/components/column-chooser";
import { Pagination, buildHref, pageSizeParam, pageSizeQuery } from "@/components/list-tools";
import { ListToolbar, ToolbarSelect } from "@/components/list-toolbar";
import { SelectAll } from "@/components/select-all";
import { CategoryQuickAdd } from "@/components/category-quick-add";
import { customFieldItems } from "@/components/custom-field-inputs";
import { displayCustomValue } from "@/lib/custom-fields";
import { repeatLabel } from "@/lib/expense";
import { PAYMENT_MODES, paymentModeLabel } from "@/lib/invoice-status";
import { can } from "@/lib/permissions";
import { formatINR } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/format";
import { cn, intParam, strParam } from "@/lib/utils";
import { stopRecurring } from "./actions";
import { bulkExpenses, invoiceExpense } from "./bulk-actions";

export const metadata = { title: "Expenses" };
const BULK = "bulk-expenses";
const BUILTIN = [
  { key: "amount", label: "Amount", default: true },
  { key: "name", label: "Name", default: true },
  { key: "receipt", label: "Receipt", default: true },
  { key: "date", label: "Date", default: true },
  { key: "project", label: "Project", default: true },
  { key: "customer", label: "Customer", default: true },
  { key: "invoice", label: "Invoice", default: true },
  { key: "reference", label: "Reference #", default: true },
  { key: "mode", label: "Payment mode", default: true },
  { key: "vendor", label: "Vendor", default: false },
  { key: "tax", label: "Tax", default: false },
];

type SP = { q?: string; year?: string; category?: string; page?: string; size?: string; selected?: string };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("expenses.view", "expenses.view_own");
  // Create any recurring copies that have fallen due (cheap when nothing is due).
  await generateDueRecurringExpenses().catch((err) => console.error("recurring expenses failed", err));
  const sp = await searchParams;
  const q = strParam(sp.q);
  const year = intParam(sp.year, 0);
  const category = intParam(sp.category, 0);
  const page = intParam(sp.page, 1);
  const size = pageSizeParam(sp.size);
  const selectedId = intParam(sp.selected, 0);
  const e = schema.expenses;
  const scope = expenseScope(user);

  const fields = await getVisibleFields("expenses", user);
  const cols = await resolveColumns(user.id, "expenses", BUILTIN, fields);
  const like = `%${q}%`;
  const where = and(
    scope,
    year ? and(gte(e.date, `${year}-01-01`), lte(e.date, `${year}-12-31`)) : undefined,
    category ? eq(e.categoryId, category) : undefined,
    q
      ? or(
          ilike(e.name, like), ilike(e.reference, like), ilike(e.project, like), ilike(schema.expenseCategories.name, like),
          sql`exists (select 1 from vendors v where v.id = "expenses"."vendor_id" and v.name ilike ${like})`,
          sql`exists (select 1 from customers c where c.id = "expenses"."customer_id" and c.company ilike ${like})`,
          sql`${e.custom}::text ilike ${like}`,
        )
      : undefined,
  );

  const [rows, categories, years, selected] = await Promise.all([
    db
      .select({
        id: e.id, name: e.name, date: e.date, total: e.total, taxAmount: e.taxAmount, reference: e.reference, paymentMode: e.paymentMode,
        project: e.project, billable: e.billable, invoiced: e.invoiced, invoiceId: e.invoiceId, invoiceNumber: schema.invoices.number,
        repeatEvery: e.repeatEvery, hasReceipt: sql<boolean>`${e.receiptKey} is not null`, custom: e.custom,
        category: schema.expenseCategories.name, vendor: schema.vendors.name, customerId: e.customerId, customerName: schema.customers.company,
        count: sql<number>`count(*) over()::int`,
      })
      .from(e)
      .innerJoin(schema.expenseCategories, eq(schema.expenseCategories.id, e.categoryId))
      .leftJoin(schema.customers, eq(schema.customers.id, e.customerId))
      .leftJoin(schema.vendors, eq(schema.vendors.id, e.vendorId))
      .leftJoin(schema.invoices, eq(schema.invoices.id, e.invoiceId))
      .where(where)
      .orderBy(desc(e.date), desc(e.id))
      .limit(size)
      .offset((page - 1) * size),
    db.select({ id: schema.expenseCategories.id, name: schema.expenseCategories.name, active: schema.expenseCategories.active }).from(schema.expenseCategories).orderBy(schema.expenseCategories.name),
    db.selectDistinct({ y: sql<number>`extract(year from ${e.date})::int` }).from(e).where(scope),
    selectedId
      ? db
          .select({ e, category: schema.expenseCategories.name, customer: schema.customers.company, createdBy: schema.users.name, vendor: schema.vendors.name, vendorGstin: schema.vendors.gstin, invoiceNumber: schema.invoices.number })
          .from(e)
          .innerJoin(schema.expenseCategories, eq(schema.expenseCategories.id, e.categoryId))
          .leftJoin(schema.customers, eq(schema.customers.id, e.customerId))
          .leftJoin(schema.users, eq(schema.users.id, e.createdBy))
          .leftJoin(schema.vendors, eq(schema.vendors.id, e.vendorId))
          .leftJoin(schema.invoices, eq(schema.invoices.id, e.invoiceId))
          .where(and(eq(e.id, selectedId), scope))
          .limit(1)
          .then((r) => r[0])
      : undefined,
  ]);
  const params = {
    q: q || undefined, year: year ? String(year) : undefined, category: category ? String(category) : undefined,
    size: pageSizeQuery(size),
  };
  const canBulk = can(user, "expenses.edit") || can(user, "expenses.delete");
  const canAddCategory = can(user, "expense_categories.create");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {can(user, "expenses.create") ? (
            <>
              <LinkButton href="/expenses/new"><Plus className="size-4" /> Record expense</LinkButton>
              <LinkButton href="/expenses/import"><Upload className="size-4" /> Import expenses</LinkButton>
            </>
          ) : null}
        </div>
        <ColumnChooser columns={cols.options} selected={cols.selected} save={saveColumns.bind(null, "expenses")} />
      </div>
      <h1 className="sr-only">Expenses</h1>
      <div className={cn("grid gap-5", selected && "2xl:grid-cols-[1fr_420px]")}>
        <Card>
          <ListToolbar
              exportHref={buildHref("/api/export/expenses", { q: q || undefined })}
              searchPlaceholder="Name, category, vendor, customer, reference…"
              extra={
                <>
                  {canBulk ? (
                    <details className="relative">
                      <summary className="cursor-pointer list-none rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-xs hover:bg-slate-50">
                        Manipulation
                      </summary>
                      <div className="absolute left-0 z-20 mt-1 w-72 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                        <p className="text-xs text-slate-500">Applies to the ticked rows on this page.</p>
                        <select form={BULK} name="op" className="input" aria-label="Bulk action" defaultValue="">
                          <option value="" disabled>Choose an action…</option>
                          {can(user, "expenses.edit") ? (
                            <>
                              <option value="category">Change category</option>
                              <option value="payment_mode">Change payment mode</option>
                              <option value="billable">Mark billable</option>
                              <option value="not_billable">Mark not billable</option>
                            </>
                          ) : null}
                          {can(user, "expenses.delete") ? <option value="delete">Delete</option> : null}
                        </select>
                        <div className="flex">
                          <select form={BULK} name="categoryId" className={canAddCategory ? "input rounded-r-none" : "input"} aria-label="New category" defaultValue="">
                            <option value="">Category (for “Change category”)</option>
                            {categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          {canAddCategory ? <CategoryQuickAdd attached /> : null}
                        </div>
                        <select form={BULK} name="paymentMode" className="input" aria-label="New payment mode" defaultValue="">
                          <option value="">Payment mode (for “Change payment mode”)</option>
                          {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <button type="submit" form={BULK} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Apply</button>
                      </div>
                    </details>
                  ) : null}
                  <ToolbarSelect name="year" label="Year" options={[{ value: "", label: "All years" }, ...[...new Set([Number(todayISO().slice(0, 4)), ...years.map((y) => y.y)])].sort((a, b) => b - a).map((y) => ({ value: String(y), label: String(y) }))]} />
                  <span className="inline-flex items-center gap-1">
                    <ToolbarSelect name="category" label="Category" options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: String(c.id), label: c.active ? c.name : `${c.name} (hidden)` }))]} />
                    {canAddCategory ? <CategoryQuickAdd /> : null}
                  </span>
                </>
              }
            />
            {/* Bulk-action form: the row tick boxes and the Manipulation controls belong to it via form={BULK} */}
            <ActionForm id={BULK} action={bulkExpenses} confirm="Apply this action to all ticked expenses?" className="px-3">{null}</ActionForm>
            {rows.length === 0 ? (
              <EmptyState title="No expenses found" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {canBulk ? <th className="th w-10"><SelectAll formId={BULK} name="ids" label="Select all expenses on this page" /></th> : null}
                      <th className="th">Category</th>
                      {cols.show("amount") && <th className="th text-right">Amount</th>}
                      {cols.show("name") && <th className="th">Name</th>}
                      {cols.show("receipt") && <th className="th">Receipt</th>}
                      {cols.show("date") && <th className="th">Date</th>}
                      {cols.show("project") && <th className="th">Project</th>}
                      {cols.show("customer") && <th className="th">Customer</th>}
                      {cols.show("invoice") && <th className="th">Invoice</th>}
                      {cols.show("reference") && <th className="th">Reference #</th>}
                      {cols.show("mode") && <th className="th">Payment mode</th>}
                      {cols.show("vendor") && <th className="th">Vendor</th>}
                      {cols.show("tax") && <th className="th text-right">Tax</th>}
                      {cols.visibleFields.map((f) => <th key={f.key} className="th">{f.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const open = buildHref("/expenses", { ...params, page: page > 1 ? page : undefined, selected: r.id });
                      return (
                        <tr key={r.id} className={cn("hover:bg-slate-50", r.id === selectedId && "bg-brand-50")}>
                          {canBulk ? <td className="td"><input type="checkbox" form={BULK} name="ids" value={r.id} aria-label={`Select expense ${r.id}`} className="size-4 accent-brand-600" /></td> : null}
                          <td className="td">
                            <Link href={open} className="link" scroll={false}>{r.category}</Link>
                            {r.billable && !r.invoiced ? <div className="text-xs text-red-600">Not invoiced</div> : null}
                          </td>
                          {cols.show("amount") && <td className="td whitespace-nowrap text-right tabular-nums">{formatINR(r.total)}</td>}
                          {cols.show("name") && (
                            <td className="td">
                              <Link href={open} className="link font-normal" scroll={false}>{r.name || "—"}</Link>
                              {r.repeatEvery ? <Repeat className="ml-1.5 inline size-3.5 text-brand-500" aria-label="Recurring" /> : null}
                            </td>
                          )}
                          {cols.show("receipt") && (
                            <td className="td">
                              {r.hasReceipt ? (
                                <a href={`/api/files/expense-receipt/${r.id}`} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 font-normal"><Paperclip className="size-3.5" /> View</a>
                              ) : null}
                            </td>
                          )}
                          {cols.show("date") && <td className="td whitespace-nowrap">{formatDate(r.date)}</td>}
                          {cols.show("project") && <td className="td">{r.project}</td>}
                          {cols.show("customer") && <td className="td">{r.customerId ? <Link className="link font-normal" href={`/customers/${r.customerId}`}>{r.customerName}</Link> : null}</td>}
                          {cols.show("invoice") && <td className="td whitespace-nowrap">{r.invoiceId ? <Link className="link font-normal" href={`/invoices/${r.invoiceId}`}>{r.invoiceNumber ?? `Draft #${r.invoiceId}`}</Link> : null}</td>}
                          {cols.show("reference") && <td className="td">{r.reference}</td>}
                          {cols.show("mode") && <td className="td">{r.paymentMode ? paymentModeLabel(r.paymentMode) : ""}</td>}
                          {cols.show("vendor") && <td className="td">{r.vendor}</td>}
                          {cols.show("tax") && <td className="td whitespace-nowrap text-right tabular-nums">{formatINR(r.taxAmount)}</td>}
                          {cols.visibleFields.map((f) => <td key={f.key} className="td">{displayCustomValue(f, r.custom[f.key])}</td>)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          <Pagination base="/expenses" page={page} pageSize={size} total={rows[0]?.count ?? 0} params={params} />
        </Card>

        {selected ? (
          <Card
            title={selected.e.name || selected.category}
            actions={
              <div className="flex gap-2">
                {can(user, "expenses.edit") ? <LinkButton variant="secondary" href={`/expenses/${selected.e.id}`}>Edit</LinkButton> : null}
                <Link href={buildHref("/expenses", params)} className="rounded-md px-2 py-2 text-sm text-slate-500 hover:bg-slate-100" aria-label="Close">✕</Link>
              </div>
            }
          >
            {selected.e.receiptKey ? (
              <div className="border-b border-slate-100 p-4">
                {selected.e.receiptType?.startsWith("image/") ? (
                  <a href={`/api/files/expense-receipt/${selected.e.id}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/expense-receipt/${selected.e.id}`} alt="Expense receipt" className="max-h-64 w-full rounded-md border border-slate-200 object-contain" />
                  </a>
                ) : (
                  <a href={`/api/files/expense-receipt/${selected.e.id}`} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-2 text-sm">
                    <Paperclip className="size-4" /> {selected.e.receiptName ?? "Receipt"}
                  </a>
                )}
              </div>
            ) : null}
            {selected.e.repeatEvery ? (
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
                <span className="inline-flex items-center gap-1.5">
                  <Repeat className="size-4" /> Repeats every {repeatLabel(selected.e.repeatEvery)?.toLowerCase()} · next on {formatDate(selected.e.nextRecurringDate)}
                </span>
                {can(user, "expenses.edit") ? (
                  <ActionForm action={async () => { "use server"; return stopRecurring(selected.e.id); }} confirm="Stop creating new copies of this expense?">
                    <SubmitButton variant="secondary">Stop</SubmitButton>
                  </ActionForm>
                ) : null}
              </div>
            ) : null}
            {selected.e.billable && !selected.e.invoiced && selected.e.customerId && can(user, "invoices.create") && can(user, "expenses.edit") ? (
              <div className="border-b border-slate-100 px-4 py-3">
                <ActionForm action={async () => { "use server"; return invoiceExpense(selected.e.id); }} confirm="Create a draft invoice for this expense?">
                  <SubmitButton><FileOutput className="size-4" /> Invoice this expense</SubmitButton>
                </ActionForm>
              </div>
            ) : null}
            <DefinitionList
              items={[
                { label: "Category", value: selected.category },
                { label: "Total", value: <span className="text-base font-semibold">{formatINR(selected.e.total)}</span> },
                { label: "Amount", value: formatINR(selected.e.amount) },
                {
                  label: "Tax",
                  value: selected.e.tax1Name
                    ? `${[`${selected.e.tax1Name} ${Number(selected.e.tax1Rate)}%`, selected.e.tax2Name ? `${selected.e.tax2Name} ${Number(selected.e.tax2Rate)}%` : null].filter(Boolean).join(" + ")} = ${formatINR(selected.e.taxAmount)}`
                    : Number(selected.e.taxAmount) > 0 ? formatINR(selected.e.taxAmount) : "No tax",
                },
                { label: "Date", value: formatDate(selected.e.date) },
                { label: "Paid via", value: selected.e.paymentMode ? paymentModeLabel(selected.e.paymentMode) : null },
                { label: "Reference #", value: selected.e.reference },
                { label: "Vendor", value: [selected.vendor, selected.vendorGstin].filter(Boolean).join(" · ") },
                { label: "Project", value: selected.e.project },
                { label: "Customer", value: selected.e.customerId ? <Link className="link" href={`/customers/${selected.e.customerId}`}>{selected.customer}</Link> : null },
                {
                  label: "Billable",
                  value: selected.e.billable ? (
                    selected.e.invoiceId ? <Link href={`/invoices/${selected.e.invoiceId}`}><Badge tone="green">Invoiced · {selected.invoiceNumber ?? "draft"}</Badge></Link> : <Badge tone="red">Not invoiced</Badge>
                  ) : "No",
                },
                { label: "Recorded by", value: selected.createdBy },
                ...customFieldItems(fields, selected.e.custom),
              ]}
            />
            {selected.e.note ? <p className="whitespace-pre-wrap border-t border-slate-100 px-4 py-3 text-sm text-slate-700">{selected.e.note}</p> : null}
          </Card>
        ) : null}
      </div>
    </>
  );
}
