import Link from "next/link";
import { Pencil, Printer } from "lucide-react";
import { requirePermission } from "@/server/auth";
import { getCompany } from "@/server/settings";
import { getVisibleFields } from "@/server/custom-fields";
import { Badge, Card, DefinitionList, LinkButton, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormGrid, SelectField, TextField } from "@/components/fields";
import { customFieldItems } from "@/components/custom-field-inputs";
import { CREDIT_NOTE_STATUS_LABEL, CREDIT_NOTE_STATUS_TONE, type CreditNoteStatus } from "@/lib/doc-status";
import { PAYMENT_MODES, paymentModeLabel } from "@/lib/invoice-status";
import { can } from "@/lib/permissions";
import { formatINR, fromPaise, toPaise } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/format";
import { CreditNoteDocument } from "../credit-note-document";
import { loadCreditNoteDetail, openInvoicesOf } from "../load";
import { applyCredit, deleteCreditNote, deleteRefund, recordRefund, removeCreditApplication, voidCreditNote } from "../actions";

export const metadata = { title: "Credit note" };

export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("credit_notes.view");
  const { creditNote: cn, customer, lines, applications, refunds } = await loadCreditNoteDetail(user, (await params).id);
  const [company, fields, openInvoices] = await Promise.all([getCompany(), getVisibleFields("credit_notes", user), openInvoicesOf(user, cn.customerId)]);
  const remaining = cn.status === "void" ? 0 : toPaise(cn.total) - toPaise(cn.amountApplied) - toPaise(cn.amountRefunded);
  const used = toPaise(cn.amountApplied) > 0 || toPaise(cn.amountRefunded) > 0;
  const st = cn.status as CreditNoteStatus;
  const id = cn.id;
  const canEdit = can(user, "credit_notes.edit");
  const targets = openInvoices.filter((i) => toPaise(i.total) > toPaise(i.amountPaid));
  const today = todayISO();

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">{cn.number}<Badge tone={CREDIT_NOTE_STATUS_TONE[st] ?? "slate"}>{CREDIT_NOTE_STATUS_LABEL[st] ?? cn.status}</Badge></span>}
        subtitle={<Link href={`/customers/${customer.id}`} className="link">{customer.company}</Link>}
        actions={
          <>
            <LinkButton variant="secondary" href={`/print/credit-notes/${id}`} target="_blank"><Printer className="size-4" /> Print / PDF</LinkButton>
            {canEdit && !used && cn.status !== "void" ? <LinkButton variant="secondary" href={`/credit-notes/${id}/edit`}><Pencil className="size-4" /> Edit</LinkButton> : null}
            {can(user, "credit_notes.delete") ? (
              <>
                <ActionForm action={async () => { "use server"; return voidCreditNote(id, cn.status !== "void"); }} confirm={cn.status === "void" ? "Re-open this credit note?" : "Void this credit note?"}>
                  <SubmitButton variant="secondary">{cn.status === "void" ? "Mark as open" : "Void"}</SubmitButton>
                </ActionForm>
                {!used ? (
                  <ActionForm action={async () => { "use server"; return deleteCreditNote(id); }} confirm={`Delete ${cn.number}?`}>
                    <SubmitButton variant="danger">Delete</SubmitButton>
                  </ActionForm>
                ) : null}
              </>
            ) : null}
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="card overflow-hidden">
          <CreditNoteDocument creditNote={cn} customer={customer} lines={lines} company={company} />
        </div>
        <div className="space-y-5">
          <Card title="Summary">
            <DefinitionList
              items={[
                { label: "Amount", value: formatINR(cn.total) },
                { label: "Applied to invoices", value: formatINR(cn.amountApplied) },
                { label: "Refunded", value: formatINR(cn.amountRefunded) },
                { label: "Remaining", value: <span className="font-semibold">{formatINR(fromPaise(remaining))}</span> },
                { label: "Reference #", value: cn.invoiceId ? <Link href={`/invoices/${cn.invoiceId}`} className="link">{cn.reference}</Link> : cn.reference },
                { label: "Project", value: cn.project },
                ...customFieldItems(fields, cn.custom),
              ]}
            />
          </Card>

          {canEdit && remaining > 0 ? (
            <Card title="Apply to invoice">
              {targets.length === 0 ? (
                <p className="px-4 py-5 text-sm text-slate-500">This customer has no unpaid invoices.</p>
              ) : (
                <ActionForm action={applyCredit.bind(null, id)} className="space-y-3 p-4">
                  <SelectField
                    name="invoiceId"
                    label="Invoice"
                    placeholder="— Select —"
                    options={targets.map((i) => ({ value: i.id, label: `${i.number} · due ${formatINR(fromPaise(toPaise(i.total) - toPaise(i.amountPaid)))}` }))}
                  />
                  <TextField name="amount" label="Amount (₹)" type="number" step="0.01" min="0.01" defaultValue={fromPaise(remaining)} />
                  <div className="flex justify-end"><SubmitButton>Apply credit</SubmitButton></div>
                </ActionForm>
              )}
            </Card>
          ) : null}

          {canEdit && remaining > 0 ? (
            <Card title="Refund">
              <ActionForm action={recordRefund.bind(null, id)} className="space-y-3 p-4">
                <FormGrid>
                  <TextField name="amount" label="Amount (₹)" type="number" step="0.01" min="0.01" defaultValue={fromPaise(remaining)} />
                  <TextField name="date" label="Date" type="date" defaultValue={today} max={today} />
                  <SelectField name="mode" label="Mode" defaultValue="bank" options={PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label }))} />
                  <TextField name="reference" label="Reference / UTR" />
                </FormGrid>
                <div className="flex justify-end"><SubmitButton variant="secondary">Record refund</SubmitButton></div>
              </ActionForm>
            </Card>
          ) : null}

          {applications.length ? (
            <Card title="Applied to invoices">
              <ul className="divide-y divide-slate-100">
                {applications.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <Link href={`/invoices/${a.invoiceId}`} className="link">{a.invoiceNumber}</Link>
                      <div className="text-xs text-slate-500">{formatDate(a.date)}</div>
                    </div>
                    <span className="font-medium tabular-nums">{formatINR(a.amount)}</span>
                    {canEdit ? (
                      <ActionForm action={async () => { "use server"; return removeCreditApplication(id, a.id); }} confirm="Remove this credit from the invoice?">
                        <button className="text-xs font-medium text-red-600 hover:underline">Remove</button>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {refunds.length ? (
            <Card title="Refunds">
              <ul className="divide-y divide-slate-100">
                {refunds.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <div className="font-medium tabular-nums">{formatINR(r.amount)}</div>
                      <div className="text-xs text-slate-500">{formatDate(r.date)} · {paymentModeLabel(r.mode)}{r.reference ? ` · ${r.reference}` : ""}</div>
                    </div>
                    {canEdit ? (
                      <ActionForm action={async () => { "use server"; return deleteRefund(id, r.id); }} confirm="Delete this refund?">
                        <button className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
