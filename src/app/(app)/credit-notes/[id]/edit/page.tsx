import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/ui";
import { FormSection } from "@/components/fields";
import { CustomFieldInputs } from "@/components/custom-field-inputs";
import { toPaise } from "@/lib/money";
import { CreditNoteForm } from "../../credit-note-form";
import { creditNoteFormData } from "../../form-data";
import { loadCreditNoteDetail } from "../../load";
import { saveCreditNote } from "../../actions";

export const metadata = { title: "Edit credit note" };

export default async function EditCreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("credit_notes.edit");
  const { creditNote: cn, lines } = await loadCreditNoteDetail(user, (await params).id);
  if (toPaise(cn.amountApplied) > 0 || toPaise(cn.amountRefunded) > 0 || cn.status === "void") redirect(`/credit-notes/${cn.id}`);
  const data = await creditNoteFormData(user);
  return (
    <>
      <PageHeader title={`Edit ${cn.number}`} />
      <CreditNoteForm
        action={saveCreditNote.bind(null, cn.id)}
        isNew={false}
        customers={data.customers}
        invoices={data.invoices}
        items={data.items}
        taxRates={data.company.taxRates}
        companyStateCode={data.company.stateCode}
        initial={{
          customerId: cn.customerId, date: cn.date, invoiceId: cn.invoiceId, reference: cn.reference ?? "", project: cn.project ?? "",
          placeOfSupply: cn.placeOfSupply, discount: cn.discount, notes: cn.notes ?? "", terms: cn.terms ?? "",
          lines: lines.map((l) => ({ itemId: l.itemId, description: l.description, hsnSac: l.hsnSac ?? "", qty: String(Number(l.qty)), unit: l.unit, rate: l.rate, taxRate: String(Number(l.taxRate)) })),
        }}
        customFields={
          data.fields.length ? (
            <FormSection title="Additional details">
              <CustomFieldInputs fields={data.fields} values={cn.custom} viewer={user} />
            </FormSection>
          ) : null
        }
      />
    </>
  );
}
