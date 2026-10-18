import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RoleForm } from "../role-form";
import { deleteRole, saveRole } from "../actions";

export const metadata = { title: "Edit role" };

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("roles.manage");
  const id = Number((await params).id);
  const role = Number.isInteger(id) ? await db.query.roles.findFirst({ where: eq(schema.roles.id, id) }) : undefined;
  if (!role) notFound();

  return (
    <>
      <PageHeader
        title={`Role: ${role.name}`}
        actions={
          role.isSystem ? null : (
            <ActionForm action={async () => { "use server"; return deleteRole(id); }} confirm={`Delete the role "${role.name}"?`}>
              <SubmitButton variant="danger">Delete role</SubmitButton>
            </ActionForm>
          )
        }
      />
      <RoleForm
        action={saveRole.bind(null, role.id)}
        initial={{ name: role.name, description: role.description ?? "", permissions: role.permissions }}
      />
    </>
  );
}
