import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { expenseScope } from "@/server/scope";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormSection } from "@/components/fields";
import { CustomFieldInputs } from "@/components/custom-field-inputs";
import { can } from "@/lib/permissions";
import { ExpenseForm } from "../expense-form";
import { expenseFormData, taxValue } from "../form-data";
import { deleteExpense, saveExpense } from "../actions";

export const metadata = { title: "Edit expense" };

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("expenses.edit");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [e] = await db.select().from(schema.expenses).where(and(eq(schema.expenses.id, id), expenseScope(user))).limit(1);
  if (!e) notFound();
  const { fields, ...data } = await expenseFormData(user);
  return (
    <>
      {can(user, "expenses.delete") ? (
        <div className="mb-2 flex justify-end">
          <ActionForm action={async () => { "use server"; return deleteExpense(id); }} confirm="Delete this expense?">
            <SubmitButton variant="danger">Delete expense</SubmitButton>
          </ActionForm>
        </div>
      ) : null}
      <ExpenseForm
        action={saveExpense.bind(null, id)}
        canAddCategory={can(user, "expense_categories.create")}
        isNew={false}
        {...data}
        customFields={
          fields.length ? (
            <FormSection title="Additional details">
              <CustomFieldInputs fields={fields} values={e.custom} viewer={user} />
            </FormSection>
          ) : null
        }
        initial={{
          name: e.name, categoryId: e.categoryId, date: e.date, amount: e.amount, tax1: taxValue(e.tax1Name, e.tax1Rate),
          tax2: taxValue(e.tax2Name, e.tax2Rate), paymentMode: e.paymentMode, vendorId: e.vendorId, reference: e.reference,
          customerId: e.customerId, billable: e.billable, note: e.note, project: e.project, repeatEvery: e.repeatEvery,
          receipt: e.receiptKey ? { name: e.receiptName ?? "Receipt", url: `/api/files/expense-receipt/${e.id}`, type: e.receiptType ?? "" } : null,
        }}
      />
    </>
  );
}
