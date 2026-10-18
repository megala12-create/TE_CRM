import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/ui";
import { StaffForm } from "../staff-form";
import { saveStaff } from "../actions";

export const metadata = { title: "Edit staff member" };

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("staff.manage");
  const id = Number((await params).id);
  const staff = Number.isInteger(id) ? await db.query.users.findFirst({ where: eq(schema.users.id, id) }) : undefined;
  if (!staff) notFound();
  const roles = await db.select({ id: schema.roles.id, name: schema.roles.name }).from(schema.roles).orderBy(asc(schema.roles.name));
  return (
    <>
      <PageHeader title={staff.name} subtitle={staff.email} />
      <StaffForm
        action={saveStaff.bind(null, staff.id)}
        roles={roles}
        isNew={false}
        actorIsAdmin={user.isAdmin}
        initial={{
          name: staff.name,
          email: staff.email,
          phone: staff.phone ?? "",
          roleId: staff.roleId,
          isAdmin: staff.isAdmin,
          active: staff.active,
        }}
      />
    </>
  );
}
