import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/ui";
import { CUSTOM_FIELD_ENTITIES } from "@/lib/custom-fields";
import { strParam } from "@/lib/utils";
import { CustomFieldForm } from "../field-form";
import { saveCustomField } from "../actions";

export const metadata = { title: "Add custom field" };

export default async function NewCustomFieldPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  await requirePermission("custom_fields.manage");
  const requested = strParam((await searchParams).entity);
  const entity = CUSTOM_FIELD_ENTITIES.find((e) => e.value === requested)?.value ?? "customers";
  const roles = await db.select({ id: schema.roles.id, name: schema.roles.name }).from(schema.roles).orderBy(asc(schema.roles.name));
  return (
    <>
      <PageHeader title="Add custom field" />
      <CustomFieldForm
        action={saveCustomField.bind(null, null)}
        roles={roles}
        isNew
        initial={{
          entity, key: "", label: "", type: "text", options: [], required: false, showInList: false, active: true,
          helpText: "", defaultValue: "", sortOrder: 0, visibleRoleIds: [], editableRoleIds: [],
        }}
      />
    </>
  );
}
