import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { invoiceScope } from "@/server/scope";
import { PageHeader } from "@/components/ui";
import { FormSection } from "@/components/fields";
import { CustomFieldInputs } from "@/components/custom-field-inputs";
import { can } from "@/lib/permissions";
import { InvoiceEditor } from "../../invoice-editor";
import { loadEditorData } from "../../editor-data";
import { saveInvoice } from "../../actions";

export const metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("invoices.edit");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [inv] = await db.select().from(schema.invoices).where(and(eq(schema.invoices.id, id), invoiceScope(user))).limit(1);
  if (!inv) notFound();
  if (inv.status !== "draft") redirect(`/invoices/${id}`);
  const [lines, data] = await Promise.all([
    db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, id)).orderBy(asc(schema.invoiceLines.sortOrder)),
    loadEditorData(user),
  ]);
  return (
    <>
      <PageHeader title="Edit draft invoice" />
      <InvoiceEditor
        action={saveInvoice.bind(null, id)}
        customers={data.customers}
        items={data.items}
        staff={data.staff}
        taxRates={data.company.taxRates}
        companyStateCode={data.company.stateCode}
        canAssignAgent={can(user, "invoices.view")}
        initial={{
          customerId: inv.customerId,
          date: inv.date,
          dueDate: inv.dueDate,
          placeOfSupply: inv.placeOfSupply,
          salesAgentId: inv.salesAgentId,
          orderRef: inv.orderRef ?? "",
          tags: inv.tags,
          repeatEvery: inv.repeatEvery,
          discount: inv.discount,
          notes: inv.notes ?? "",
          terms: inv.terms ?? "",
          lines: lines.map((l) => ({
            itemId: l.itemId,
            description: l.description,
            hsnSac: l.hsnSac ?? "",
            qty: String(Number(l.qty)),
            unit: l.unit,
            rate: l.rate,
            taxRate: String(Number(l.taxRate)),
          })),
        }}
        customFields={
          data.fields.length ? (
            <FormSection title="Additional details">
              <CustomFieldInputs fields={data.fields} values={inv.custom} viewer={user} />
            </FormSection>
          ) : null
        }
      />
    </>
  );
}
