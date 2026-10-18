import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { FileOutput, Pencil, Plus, Printer, Upload } from "lucide-react";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { getCompany } from "@/server/settings";
import { getVisibleFields } from "@/server/custom-fields";
import { resolveColumns } from "@/server/columns";
import { saveColumns } from "@/server/list-actions";
import { quotationScope } from "@/server/scope";
import { Badge, Card, DefinitionList, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormSection } from "@/components/fields";
import { CustomFieldInputs, customFieldItems } from "@/components/custom-field-inputs";
import { ColumnChooser } from "@/components/column-chooser";
import { Pagination, buildHref, pageSizeParam } from "@/components/list-tools";
import { ListToolbar, ToolbarSelect } from "@/components/list-toolbar";
import { PrintButton } from "@/components/print-button";
import { displayCustomValue } from "@/lib/custom-fields";
import { QUOTATION_STATUSES, QUOTATION_STATUS_LABEL, QUOTATION_STATUS_TONE, isQuotationStatus, type QuotationStatus } from "@/lib/doc-status";
import { QUOTE_KINDS, type QuoteKind } from "@/lib/sales-kinds";
import { can } from "@/lib/permissions";
import { formatINR } from "@/lib/money";
import { addDays, formatDate, formatDateTime, todayISO } from "@/lib/format";
import { intParam, strParam } from "@/lib/utils";
import { QuotationForm } from "./quotation-form";
import { QuotationDocument } from "./quotation-document";
import { salesDocFormData } from "./form-data";
import { loadQuotationDetail } from "./load";
import { convertQuotationToInvoice, deleteQuotation, saveQuotation, setQuotationStatusFromForm } from "./actions";

const BUILTIN = [
  { key: "subject", label: "Subject", default: true },
  { key: "to", label: "To", default: true },
  { key: "total", label: "Total", default: true },
  { key: "date", label: "Date", default: true },
  { key: "openTill", label: "Open till", default: true },
  { key: "project", label: "Project", default: true },
  { key: "tags", label: "Tags", default: true },
  { key: "created", label: "Date created", default: true },
  { key: "so", label: "SO create", default: true },
];

type ListSP = { q?: string; status?: string; page?: string; size?: string };

export async function QuotationListView({ kind, searchParams }: { kind: QuoteKind; searchParams: Promise<ListSP> }) {
  const K = QUOTE_KINDS[kind];
  const user = await requirePermission(K.perm.view, K.perm.viewOwn);
  const sp = await searchParams;
  const q = strParam(sp.q);
  const status = isQuotationStatus(strParam(sp.status)) ? (strParam(sp.status) as QuotationStatus) : "";
  const page = intParam(sp.page, 1);
  const size = pageSizeParam(sp.size);
  const t = schema.quotations;
  const listKey = kind === "proforma" ? "proforma" : "quotations";

  const fields = await getVisibleFields(K.entity, user);
  const cols = await resolveColumns(user.id, listKey, kind === "proforma" ? BUILTIN.filter((b) => b.key !== "so") : BUILTIN, fields);
  const like = `%${q}%`;
  const rows = await db
    .select({
      id: t.id, number: t.number, subject: t.subject, toName: t.toName, customerId: t.customerId, total: t.total, date: t.date,
      openTill: t.openTill, project: t.project, tags: t.tags, createdAt: t.createdAt, status: t.status, soCreated: t.soCreated,
      invoiceId: t.invoiceId, custom: t.custom, count: sql<number>`count(*) over()::int`,
    })
    .from(t)
    .where(
      and(
        quotationScope(user, kind),
        status ? eq(t.status, status) : undefined,
        q ? or(ilike(t.number, like), ilike(t.subject, like), ilike(t.toName, like), ilike(t.project, like), sql`array_to_string(${t.tags}, ',') ilike ${like}`, sql`${t.custom}::text ilike ${like}`) : undefined,
      ),
    )
    .orderBy(desc(t.id))
    .limit(size)
    .offset((page - 1) * size);
  const params = { q: q || undefined, status: status || undefined, size: size === 25 ? undefined : String(size) };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {can(user, K.perm.create) ? (
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`${K.base}/new`}><Plus className="size-4" /> New {K.label.toLowerCase()}</LinkButton>
            <LinkButton variant="secondary" href={`/import/${kind === "proforma" ? "proforma" : "quotations"}`}><Upload className="size-4" /> Import</LinkButton>
          </div>
        ) : <span />}
        <ColumnChooser columns={cols.options} selected={cols.selected} save={saveColumns.bind(null, listKey)} />
      </div>
      <h1 className="sr-only">{K.plural}</h1>
      <Card>
        <ListToolbar
          exportHref={buildHref("/api/export/quotations", { q: q || undefined, kind })}
          searchPlaceholder="Number, subject, to, tag…"
          extra={<ToolbarSelect name="status" label="Status" options={[{ value: "", label: "All statuses" }, ...QUOTATION_STATUSES.map((s) => ({ value: s, label: QUOTATION_STATUS_LABEL[s] }))]} />}
        />
        {rows.length === 0 ? (
          <EmptyState title={q ? `Nothing matches “${q}”` : `No ${K.plural.toLowerCase()} yet`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">{K.label} #</th>
                  {cols.show("subject") && <th className="th">Subject</th>}
                  {cols.show("to") && <th className="th">To</th>}
                  {cols.show("total") && <th className="th text-right">Total</th>}
                  {cols.show("date") && <th className="th">Date</th>}
                  {cols.show("openTill") && <th className="th">Open till</th>}
                  {cols.show("project") && <th className="th">Project</th>}
                  {cols.show("tags") && <th className="th">Tags</th>}
                  {cols.visibleFields.map((f) => <th key={f.key} className="th">{f.label}</th>)}
                  {cols.show("created") && <th className="th">Date created</th>}
                  <th className="th">Status</th>
                  {cols.show("so") && <th className="th">SO create</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = (isQuotationStatus(r.status) ? r.status : "draft") as QuotationStatus;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="td whitespace-nowrap"><Link href={`${K.base}/${r.id}`} className="link">{r.number}</Link></td>
                      {cols.show("subject") && <td className="td"><Link href={`${K.base}/${r.id}`} className="link font-normal">{r.subject}</Link></td>}
                      {cols.show("to") && <td className="td">{r.customerId ? <Link href={`/customers/${r.customerId}`} className="link font-normal">{r.toName}</Link> : r.toName}</td>}
                      {cols.show("total") && <td className="td whitespace-nowrap text-right tabular-nums">{formatINR(r.total)}</td>}
                      {cols.show("date") && <td className="td whitespace-nowrap">{formatDate(r.date)}</td>}
                      {cols.show("openTill") && <td className="td whitespace-nowrap">{formatDate(r.openTill)}</td>}
                      {cols.show("project") && <td className="td">{r.project}</td>}
                      {cols.show("tags") && <td className="td"><div className="flex flex-wrap gap-1">{r.tags.map((tg) => <Badge key={tg}>{tg}</Badge>)}</div></td>}
                      {cols.visibleFields.map((f) => <td key={f.key} className="td">{displayCustomValue(f, r.custom[f.key])}</td>)}
                      {cols.show("created") && <td className="td whitespace-nowrap text-slate-500">{formatDateTime(r.createdAt)}</td>}
                      <td className="td">
                        <Badge tone={QUOTATION_STATUS_TONE[st]}>{QUOTATION_STATUS_LABEL[st]}</Badge>
                        {r.invoiceId ? <div className="mt-1 text-xs"><Link className="link" href={`/invoices/${r.invoiceId}`}>Invoiced</Link></div> : null}
                      </td>
                      {cols.show("so") && <td className="td">{r.soCreated ? "Yes" : "No"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination base={K.base} page={page} pageSize={size} total={rows[0]?.count ?? 0} params={params} />
      </Card>
    </>
  );
}

export async function QuotationNewView({ kind, searchParams }: { kind: QuoteKind; searchParams: Promise<{ customer?: string }> }) {
  const K = QUOTE_KINDS[kind];
  const user = await requirePermission(K.perm.create);
  const data = await salesDocFormData(user, K.entity as "quotations" | "proforma_invoices");
  const preId = intParam((await searchParams).customer, 0);
  const pre = data.customers.find((c) => c.id === preId);
  const today = todayISO();
  return (
    <>
      <PageHeader title={`New ${K.label.toLowerCase()}`} />
      <QuotationForm
        action={saveQuotation.bind(null, kind, null)}
        isNew
        label={K.label}
        requireCustomer={K.requireCustomer}
        customers={data.customers}
        items={data.items}
        staff={data.staff}
        taxRates={data.company.taxRates}
        companyStateCode={data.company.stateCode}
        validDays={data.company.quotationValidDays}
        canAssignAgent={can(user, K.perm.view)}
        initial={{
          subject: "", customerId: pre?.id ?? null, toName: pre?.company ?? "", toEmail: pre?.email ?? "", toPhone: pre?.phone ?? "",
          toAddress: pre?.address ?? "", status: "draft", date: today, openTill: addDays(today, data.company.quotationValidDays), project: "",
          tags: [], placeOfSupply: null, salesAgentId: user.id, discount: "0", notes: "",
          terms: kind === "proforma" ? data.company.invoiceTerms : data.company.quotationTerms, lines: [],
        }}
        customFields={data.fields.length ? <FormSection title="Additional details"><CustomFieldInputs fields={data.fields} values={{}} viewer={user} /></FormSection> : null}
      />
    </>
  );
}

export async function QuotationEditView({ kind, params }: { kind: QuoteKind; params: Promise<{ id: string }> }) {
  const K = QUOTE_KINDS[kind];
  const user = await requirePermission(K.perm.edit);
  const { quotation: q, lines } = await loadQuotationDetail(user, (await params).id, kind);
  if (q.invoiceId) redirect(`${K.base}/${q.id}`);
  const data = await salesDocFormData(user, K.entity as "quotations" | "proforma_invoices");
  return (
    <>
      <PageHeader title={`Edit ${q.number}`} />
      <QuotationForm
        action={saveQuotation.bind(null, kind, q.id)}
        isNew={false}
        label={K.label}
        requireCustomer={K.requireCustomer}
        customers={data.customers}
        items={data.items}
        staff={data.staff}
        taxRates={data.company.taxRates}
        companyStateCode={data.company.stateCode}
        validDays={data.company.quotationValidDays}
        canAssignAgent={can(user, K.perm.view)}
        initial={{
          subject: q.subject, customerId: q.customerId, toName: q.toName, toEmail: q.toEmail ?? "", toPhone: q.toPhone ?? "",
          toAddress: q.toAddress ?? "", status: q.status, date: q.date, openTill: q.openTill ?? "", project: q.project ?? "", tags: q.tags,
          placeOfSupply: q.placeOfSupply, salesAgentId: q.salesAgentId, discount: q.discount, notes: q.notes ?? "", terms: q.terms ?? "",
          lines: lines.map((l) => ({ itemId: l.itemId, description: l.description, hsnSac: l.hsnSac ?? "", qty: String(Number(l.qty)), unit: l.unit, rate: l.rate, taxRate: String(Number(l.taxRate)) })),
        }}
        customFields={data.fields.length ? <FormSection title="Additional details"><CustomFieldInputs fields={data.fields} values={q.custom} viewer={user} /></FormSection> : null}
      />
    </>
  );
}

export async function QuotationDetailView({ kind, params }: { kind: QuoteKind; params: Promise<{ id: string }> }) {
  const K = QUOTE_KINDS[kind];
  const user = await requirePermission(K.perm.view, K.perm.viewOwn);
  const { quotation: q, lines } = await loadQuotationDetail(user, (await params).id, kind);
  const [company, fields] = await Promise.all([getCompany(), getVisibleFields(K.entity, user)]);
  const st = (isQuotationStatus(q.status) ? q.status : "draft") as QuotationStatus;
  const expired = !!q.openTill && q.openTill < todayISO() && !["accepted", "declined"].includes(st);
  const id = q.id;
  const editable = can(user, K.perm.edit) && !q.invoiceId;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {q.number}
            <Badge tone={QUOTATION_STATUS_TONE[st]}>{QUOTATION_STATUS_LABEL[st]}</Badge>
            {expired ? <Badge tone="red">Expired</Badge> : null}
          </span>
        }
        subtitle={q.customerId ? <Link href={`/customers/${q.customerId}`} className="link">{q.toName}</Link> : `${q.toName} (prospect)`}
        actions={
          <>
            <LinkButton variant="secondary" href={`/print/${kind === "proforma" ? "proforma-invoices" : "quotations"}/${id}`} target="_blank"><Printer className="size-4" /> Print / PDF</LinkButton>
            {editable ? <LinkButton variant="secondary" href={`${K.base}/${id}/edit`}><Pencil className="size-4" /> Edit</LinkButton> : null}
            {q.invoiceId ? (
              <LinkButton href={`/invoices/${q.invoiceId}`}>View invoice</LinkButton>
            ) : can(user, "invoices.create") && can(user, K.perm.edit) ? (
              <ActionForm action={async () => { "use server"; return convertQuotationToInvoice(kind, id); }} confirm="Create a draft tax invoice from this document?">
                <SubmitButton><FileOutput className="size-4" /> Convert to invoice</SubmitButton>
              </ActionForm>
            ) : null}
            {can(user, K.perm.delete) && !q.invoiceId ? (
              <ActionForm action={async () => { "use server"; return deleteQuotation(kind, id); }} confirm={`Delete ${q.number}?`}>
                <SubmitButton variant="danger">Delete</SubmitButton>
              </ActionForm>
            ) : null}
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="card overflow-hidden">
          <QuotationDocument quotation={q} lines={lines} company={company} title={K.docTitle} partyTitle={K.partyTitle} showBank={K.showBank} />
        </div>
        <div className="space-y-5">
          <Card title="Summary">
            <DefinitionList
              items={[
                { label: "Total", value: formatINR(q.total) },
                { label: "Date", value: formatDate(q.date) },
                { label: "Open till", value: formatDate(q.openTill) },
                { label: "Project", value: q.project },
                { label: "Tags", value: q.tags.length ? <div className="flex flex-wrap gap-1">{q.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div> : null },
                { label: "Sent", value: q.sentAt ? formatDateTime(q.sentAt) : null },
                { label: "Accepted", value: q.acceptedAt ? formatDateTime(q.acceptedAt) : null },
                ...(kind === "quotation" ? [{ label: "SO created", value: q.soCreated ? "Yes" : "No" }] : []),
                ...customFieldItems(fields, q.custom),
              ]}
            />
          </Card>
          {editable ? (
            <Card title="Change status">
              <ActionForm action={setQuotationStatusFromForm.bind(null, kind, id)} className="flex flex-wrap items-center gap-2 p-4">
                <select name="status" defaultValue={st} className="input w-auto flex-1" aria-label="Status">
                  {QUOTATION_STATUSES.map((s) => <option key={s} value={s}>{QUOTATION_STATUS_LABEL[s]}</option>)}
                </select>
                <SubmitButton variant="secondary">Update status</SubmitButton>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

export async function QuotationPrintView({ kind, params }: { kind: QuoteKind; params: Promise<{ id: string }> }) {
  const K = QUOTE_KINDS[kind];
  const user = await requirePermission(K.perm.view, K.perm.viewOwn);
  const { quotation, lines } = await loadQuotationDetail(user, (await params).id, kind);
  const company = await getCompany();
  return (
    <div className="mx-auto max-w-4xl bg-white print:max-w-none">
      <div className="no-print flex justify-end gap-2 p-4">
        <PrintButton />
      </div>
      <QuotationDocument quotation={quotation} lines={lines} company={company} title={K.docTitle} partyTitle={K.partyTitle} showBank={K.showBank} />
    </div>
  );
}
