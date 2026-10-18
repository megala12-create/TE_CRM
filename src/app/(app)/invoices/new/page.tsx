import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/ui";
import { FormSection } from "@/components/fields";
import { CustomFieldInputs } from "@/components/custom-field-inputs";
import { can } from "@/lib/permissions";
import { addDays, todayISO } from "@/lib/format";
import { intParam } from "@/lib/utils";
import { InvoiceEditor } from "../invoice-editor";
import { loadEditorData } from "../editor-data";
import { saveInvoice } from "../actions";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const user = await requirePermission("invoices.create");
  const data = await loadEditorData(user);
  const preselect = intParam((await searchParams).customer, 0);
  const customer = data.customers.find((c) => c.id === preselect);
  const today = todayISO();
  return (
    <>
      <PageHeader title="New invoice" />
      <InvoiceEditor
        action={saveInvoice.bind(null, null)}
        customers={data.customers}
        items={data.items}
        staff={data.staff}
        taxRates={data.company.taxRates}
        companyStateCode={data.company.stateCode}
        canAssignAgent={can(user, "invoices.view")}
        initial={{
          customerId: customer?.id ?? null,
          date: today,
          dueDate: addDays(today, customer?.paymentTermsDays ?? 30),
          placeOfSupply: null,
          salesAgentId: user.id,
          orderRef: "",
          tags: [],
          repeatEvery: null,
          discount: "0",
          notes: "",
          terms: data.company.invoiceTerms,
          lines: [],
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
