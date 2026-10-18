import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/ui";
import { StaffForm } from "../staff-form";
import { saveStaff } from "../actions";

export const metadata = { title: "New staff member" };

export default async function NewStaffPage() {
  const user = await requirePermission("staff.manage");
  const roles = await db.select({ id: schema.roles.id, name: schema.roles.name }).from(schema.roles).orderBy(asc(schema.roles.name));
  return (
    <>
      <PageHeader title="New staff member" />
      <StaffForm
        action={saveStaff.bind(null, null)}
        roles={roles}
        isNew
        actorIsAdmin={user.isAdmin}
        initial={{ name: "", email: "", phone: "", roleId: null, isAdmin: false, active: true }}
      />
    </>
  );
}
