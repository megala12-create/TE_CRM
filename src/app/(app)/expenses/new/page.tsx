import { requirePermission } from "@/server/auth";
import { can } from "@/lib/permissions";
import { FormSection } from "@/components/fields";
import { CustomFieldInputs } from "@/components/custom-field-inputs";
import { todayISO } from "@/lib/format";
import { ExpenseForm } from "../expense-form";
import { expenseFormData } from "../form-data";
import { saveExpense } from "../actions";

export const metadata = { title: "Add new expense" };

export default async function NewExpensePage() {
  const user = await requirePermission("expenses.create");
  const { fields, ...data } = await expenseFormData(user);
  return (
    <ExpenseForm
      action={saveExpense.bind(null, null)}
      canAddCategory={can(user, "expense_categories.create")}
      isNew
      {...data}
      customFields={
        fields.length ? (
          <FormSection title="Additional details">
            <CustomFieldInputs fields={fields} values={{}} viewer={user} />
          </FormSection>
        ) : null
      }
      initial={{
        name: "", categoryId: null, date: todayISO(), amount: "", tax1: "", tax2: "", paymentMode: null, vendorId: null,
        reference: null, customerId: null, billable: false, note: null, project: null, repeatEvery: null, receipt: null,
      }}
    />
  );
}
