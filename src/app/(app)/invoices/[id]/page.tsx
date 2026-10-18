import Link from "next/link";
import { Pencil, Printer } from "lucide-react";
import { requirePermission } from "@/server/auth";
import { getCompany } from "@/server/settings";
import { getVisibleFields } from "@/server/custom-fields";
import { Badge, Card, DefinitionList, LinkButton, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormGrid, SelectField, TextField } from "@/components/fields";
import { CustomFieldInputs, customFieldItems } from "@/components/custom-field-inputs";
import { can } from "@/lib/permissions";
import { formatINR, fromPaise, toPaise } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/format";
import { INVOICE_STATE_LABEL, INVOICE_STATE_TONE, PAYMENT_MODES, invoiceState, paymentModeLabel } from "@/lib/invoice-status";
import { InvoiceDocument } from "../invoice-document";
import { loadInvoiceDetail } from "../load";
import { cancelInvoice, deleteDraftInvoice, deletePayment, issueInvoice, markInvoiceSent, recordPayment, setInvoiceRepeat } from "../actions";
import { REPEAT_OPTIONS, repeatLabel } from "@/lib/recurrence";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("invoices.view", "invoices.view_own");
  const { invoice, customer, lines, payments, credits } = await loadInvoiceDetail(user, (await params).id);
  const [company, fields, paymentFields] = await Promise.all([getCompany(), getVisibleFields("invoices", user), getVisibleFields("payments", user)]);
  const today = todayISO();
  const state = invoiceState(invoice, today);
  const balance = toPaise(invoice.total) - toPaise(invoice.amountPaid);
  const id = invoice.id;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {invoice.number ?? `Draft #${invoice.id}`}
            <Badge tone={INVOICE_STATE_TONE[state]}>{INVOICE_STATE_LABEL[state]}</Badge>
            {invoice.status === "issued" ? (invoice.sentAt ? <Badge tone="blue">Sent</Badge> : <Badge>Not sent</Badge>) : null}
          </span>
        }
        subtitle={<Link href={`/customers/${customer.id}`} className="link">{customer.company}</Link>}
        actions={
          <>
            <LinkButton variant="secondary" href={`/print/invoices/${id}`} target="_blank">
              <Printer className="size-4" /> Print / PDF
            </LinkButton>
            {invoice.status === "draft" && can(user, "invoices.edit") ? (
              <LinkButton variant="secondary" href={`/invoices/${id}/edit`}>
                <Pencil className="size-4" /> Edit
              </LinkButton>
            ) : null}
            {invoice.status === "draft" && (can(user, "invoices.edit") || can(user, "invoices.create")) ? (
              <ActionForm action={async () => { "use server"; return issueInvoice(id); }} confirm="Issue this invoice? It gets a permanent number and can no longer be edited.">
                <SubmitButton>Issue invoice</SubmitButton>
              </ActionForm>
            ) : null}
            {invoice.status === "draft" && can(user, "invoices.delete") ? (
              <ActionForm action={async () => { "use server"; return deleteDraftInvoice(id); }} confirm="Delete this draft?">
                <SubmitButton variant="danger">Delete draft</SubmitButton>
              </ActionForm>
            ) : null}
            {invoice.status === "issued" && (can(user, "invoices.edit") || can(user, "invoices.create")) ? (
              <ActionForm action={async () => { "use server"; return markInvoiceSent(id, !invoice.sentAt); }}>
                <SubmitButton variant="secondary">{invoice.sentAt ? "Mark as not sent" : "Mark as sent"}</SubmitButton>
              </ActionForm>
            ) : null}
            {invoice.status === "issued" && can(user, "credit_notes.create") ? (
              <LinkButton variant="secondary" href={`/credit-notes/new?invoice=${id}`}>Create credit note</LinkButton>
            ) : null}
            {invoice.status === "issued" && can(user, "invoices.delete") ? (
              <ActionForm action={async () => { "use server"; return cancelInvoice(id); }} confirm="Cancel this invoice? The number stays reserved and the invoice is kept for audit.">
                <SubmitButton variant="secondary">Cancel invoice</SubmitButton>
              </ActionForm>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="card overflow-hidden">
          <InvoiceDocument invoice={invoice} customer={customer} lines={lines} company={company} />
        </div>

        <div className="space-y-5">
          <Card title="Summary">
            <DefinitionList
              items={[
                { label: "Total", value: formatINR(invoice.total) },
                { label: "Paid / credited", value: formatINR(invoice.amountPaid) },
                { label: "Order", value: invoice.orderRef },
                { label: "Tags", value: invoice.tags.length ? <div className="flex flex-wrap gap-1">{invoice.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div> : null },
                { label: "Sent to customer", value: invoice.sentAt ? formatDate(invoice.sentAt) : null },
                { label: "Balance due", value: <span className={balance > 0 ? "font-semibold text-red-700" : ""}>{formatINR(fromPaise(balance))}</span> },
                { label: "Due date", value: formatDate(invoice.dueDate) },
                ...customFieldItems(fields, invoice.custom),
              ]}
            />
          </Card>

          {invoice.status === "issued" && balance > 0 && can(user, "payments.create") ? (
            <Card title="Record payment">
              <ActionForm action={recordPayment.bind(null, id)} className="space-y-4 p-4">
                <FormGrid>
                  <TextField name="amount" label="Amount (₹)" type="number" step="0.01" min="0.01" required defaultValue={fromPaise(balance)} />
                  <TextField name="date" label="Date" type="date" required defaultValue={today} max={today} />
                  <SelectField name="mode" label="Mode" defaultValue="bank" options={PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label }))} />
                  <TextField name="reference" label="Reference / UTR" />
                </FormGrid>
                <TextField name="note" label="Note" />
                <CustomFieldInputs fields={paymentFields} values={{}} viewer={user} />
                <div className="flex justify-end">
                  <SubmitButton>Record payment</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          ) : null}

          <Card title={`Payments (${payments.length})`}>
            {payments.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <div className="font-medium tabular-nums text-slate-900">{formatINR(p.amount)}</div>
                      <div className="text-xs text-slate-500">
                        {formatDate(p.date)} · {paymentModeLabel(p.mode)}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </div>
                    </div>
                    {can(user, "payments.delete") ? (
                      <ActionForm action={async () => { "use server"; return deletePayment(p.id); }} confirm="Delete this payment?">
                        <button className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {credits.length ? (
            <Card title={`Credits applied (${credits.length})`}>
              <ul className="divide-y divide-slate-100">
                {credits.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                    <Link href={`/credit-notes/${c.creditNoteId}`} className="link">{c.creditNoteNumber}</Link>
                    <span className="text-xs text-slate-500">{formatDate(c.date)}</span>
                    <span className="font-medium tabular-nums">{formatINR(c.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {invoice.status !== "cancelled" && can(user, "invoices.edit") ? (
            <Card title="Recurring">
              <ActionForm action={setInvoiceRepeat.bind(null, id)} className="space-y-3 p-4">
                {invoice.repeatEvery ? (
                  <p className="text-sm text-slate-600">
                    Repeats every {repeatLabel(invoice.repeatEvery)?.toLowerCase()} · next draft on {formatDate(invoice.nextRecurringDate)}
                  </p>
                ) : null}
                <select name="repeatEvery" defaultValue={invoice.repeatEvery ?? ""} className="input" aria-label="Repeat every">
                  <option value="">Not recurring</option>
                  {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>Every {o.label.toLowerCase()}</option>)}
                </select>
                <div className="flex justify-end">
                  <SubmitButton variant="secondary">Save</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
