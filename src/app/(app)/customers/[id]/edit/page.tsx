import { requirePermission } from "@/server/auth";
import { getVisibleFields } from "@/server/custom-fields";
import { activeStaff } from "@/server/lookups";
import { loadCustomer } from "@/server/scope";
import { PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { can } from "@/lib/permissions";
import { CustomerForm } from "../../customer-form";
import { deleteCustomer, saveCustomer } from "../../actions";

export const metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("customers.edit");
  const customer = await loadCustomer(user, Number((await params).id));
  const [fields, staff] = await Promise.all([getVisibleFields("customers", user), activeStaff()]);
  const id = customer.id;
  return (
    <>
      <PageHeader
        title={`Edit ${customer.company}`}
        actions={
          can(user, "customers.delete") ? (
            <ActionForm action={async () => { "use server"; return deleteCustomer(id); }} confirm={`Delete ${customer.company}? This cannot be undone.`}>
              <SubmitButton variant="danger">Delete</SubmitButton>
            </ActionForm>
          ) : null
        }
      />
      <CustomerForm
        action={saveCustomer.bind(null, id)}
        isNew={false}
        staff={staff}
        canAssignOwner={can(user, "customers.view")}
        fields={fields}
        viewer={user}
        initial={customer}
      />
    </>
  );
}
