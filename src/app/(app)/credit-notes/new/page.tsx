import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { invoiceScope } from "@/server/scope";
import { PageHeader } from "@/components/ui";
import { FormSection } from "@/components/fields";
import { CustomFieldInputs } from "@/components/custom-field-inputs";
import { todayISO } from "@/lib/format";
import { intParam } from "@/lib/utils";
import { CreditNoteForm } from "../credit-note-form";
import { creditNoteFormData } from "../form-data";
import { saveCreditNote } from "../actions";

export const metadata = { title: "New credit note" };

/** ?invoice=ID pre-fills the customer, reference and lines from that invoice. */
export default async function NewCreditNotePage({ searchParams }: { searchParams: Promise<{ invoice?: string; customer?: string }> }) {
  const user = await requirePermission("credit_notes.create");
  const sp = await searchParams;
  const data = await creditNoteFormData(user);
  const invoiceId = intParam(sp.invoice, 0);
  const [inv] = invoiceId
    ? await db.select().from(schema.invoices).where(and(eq(schema.invoices.id, invoiceId), invoiceScope(user))).limit(1)
    : [];
  const invLines = inv
    ? await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, inv.id)).orderBy(asc(schema.invoiceLines.sortOrder))
    : [];
  return (
    <>
      <PageHeader title="New credit note" subtitle={inv ? `Against ${inv.number}` : undefined} />
      <CreditNoteForm
        action={saveCreditNote.bind(null, null)}
        isNew
        customers={data.customers}
        invoices={data.invoices}
        items={data.items}
        taxRates={data.company.taxRates}
        companyStateCode={data.company.stateCode}
        initial={{
          customerId: inv?.customerId ?? (intParam(sp.customer, 0) || null),
          date: todayISO(),
          invoiceId: inv?.id ?? null,
          reference: inv?.number ?? "",
          project: "",
          placeOfSupply: inv?.placeOfSupply ?? null,
          discount: "0",
          notes: "",
          terms: data.company.creditNoteTerms,
          lines: invLines.map((l) => ({ itemId: l.itemId, description: l.description, hsnSac: l.hsnSac ?? "", qty: String(Number(l.qty)), unit: l.unit, rate: l.rate, taxRate: String(Number(l.taxRate)) })),
        }}
        customFields={
          data.fields.length ? (
            <FormSection title="Additional details">
              <CustomFieldInputs fields={data.fields} values={{}} viewer={user} />
            </FormSection>
          ) : null
        }
      />
    </>
  );
}
