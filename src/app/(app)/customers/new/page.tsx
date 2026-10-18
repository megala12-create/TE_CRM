import { requirePermission } from "@/server/auth";
import { getVisibleFields } from "@/server/custom-fields";
import { activeStaff } from "@/server/lookups";
import { PageHeader } from "@/components/ui";
import { can } from "@/lib/permissions";
import { CustomerForm } from "../customer-form";
import { saveCustomer } from "../actions";

export const metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  const user = await requirePermission("customers.create");
  const [fields, staff] = await Promise.all([getVisibleFields("customers", user), activeStaff()]);
  return (
    <>
      <PageHeader title="New customer" />
      <CustomerForm
        action={saveCustomer.bind(null, null)}
        isNew
        staff={staff}
        canAssignOwner={can(user, "customers.view")}
        fields={fields}
        viewer={user}
        initial={{
          company: "", gstin: null, pan: null, phone: null, email: null, website: null, address: null, city: "Tiruppur",
          stateCode: "33", pincode: null, groups: [], ownerId: user.id, paymentTermsDays: 30, creditLimit: "0",
          active: true, custom: {},
        }}
      />
    </>
  );
}
