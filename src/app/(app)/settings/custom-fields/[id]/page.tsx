import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CustomFieldForm } from "../field-form";
import { deleteCustomField, saveCustomField } from "../actions";

export const metadata = { title: "Edit custom field" };

export default async function EditCustomFieldPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("custom_fields.manage");
  const id = Number((await params).id);
  const f = Number.isInteger(id) ? await db.query.customFields.findFirst({ where: eq(schema.customFields.id, id) }) : undefined;
  if (!f) notFound();
  const roles = await db.select({ id: schema.roles.id, name: schema.roles.name }).from(schema.roles).orderBy(asc(schema.roles.name));
  return (
    <>
      <PageHeader
        title={`Field: ${f.label}`}
        actions={
          <ActionForm
            action={async () => { "use server"; return deleteCustomField(id); }}
            confirm={`Delete "${f.label}"? Existing values are kept in the records and come back if you re-create a field with the key "${f.key}".`}
          >
            <SubmitButton variant="danger">Delete field</SubmitButton>
          </ActionForm>
        }
      />
      <CustomFieldForm
        action={saveCustomField.bind(null, f.id)}
        roles={roles}
        isNew={false}
        initial={{
          entity: f.entity, key: f.key, label: f.label, type: f.type, options: f.options, required: f.required,
          showInList: f.showInList, active: f.active, helpText: f.helpText ?? "", defaultValue: f.defaultValue ?? "",
          sortOrder: f.sortOrder, visibleRoleIds: f.visibleRoleIds ?? [], editableRoleIds: f.editableRoleIds ?? [],
        }}
      />
    </>
  );
}
