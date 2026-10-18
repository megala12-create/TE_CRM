"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { assertPermission } from "@/server/auth";
import { audit } from "@/server/audit";
import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES, slugifyKey } from "@/lib/custom-fields";
import { str, optStr, type ActionState } from "@/lib/utils";

const RESERVED_KEYS = new Set(["id", "created_at", "updated_at", "custom"]);

function roleIds(form: FormData, key: string): number[] | null {
  const ids = form.getAll(key).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? ids : null;
}

export async function saveCustomField(fieldId: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("custom_fields.manage");
  const errors: Record<string, string> = {};
  const existing = fieldId ? await db.query.customFields.findFirst({ where: eq(schema.customFields.id, fieldId) }) : undefined;
  if (fieldId && !existing) return { message: "Field not found" };

  // Entity and key are fixed after creation so stored values stay attached.
  const entity = existing?.entity ?? str(form, "entity");
  const type = str(form, "type");
  const label = str(form, "label");
  const key = existing?.key ?? slugifyKey(str(form, "key") || label);
  const options = [...new Set(str(form, "options").split(/\r?\n|,/).map((o) => o.trim()).filter(Boolean))];

  if (!CUSTOM_FIELD_ENTITIES.some((e) => e.value === entity)) errors.entity = "Choose where the field appears";
  if (!CUSTOM_FIELD_TYPES.some((t) => t.value === type)) errors.type = "Choose a field type";
  if (!label) errors.label = "Label is required";
  if (RESERVED_KEYS.has(key)) errors.key = "This key is reserved";
  if ((type === "select" || type === "multiselect") && options.length === 0) errors.options = "Add at least one option";
  if (!fieldId) {
    const dup = await db.query.customFields.findFirst({
      where: and(eq(schema.customFields.entity, entity), eq(schema.customFields.key, key)),
    });
    if (dup) errors.key = `"${key}" already exists on this screen`;
  }
  if (Object.keys(errors).length) return { errors };

  const values = {
    entity,
    key,
    label,
    type,
    options,
    required: form.get("required") === "on",
    showInList: form.get("showInList") === "on",
    active: form.get("active") === "on",
    helpText: optStr(form, "helpText"),
    defaultValue: optStr(form, "defaultValue"),
    sortOrder: Number(str(form, "sortOrder")) || 0,
    visibleRoleIds: roleIds(form, "visibleRoleIds"),
    editableRoleIds: roleIds(form, "editableRoleIds"),
    updatedAt: new Date(),
  };

  let id = fieldId;
  if (fieldId) {
    await db.update(schema.customFields).set(values).where(eq(schema.customFields.id, fieldId));
  } else {
    const [row] = await db.insert(schema.customFields).values(values).returning({ id: schema.customFields.id });
    id = row!.id;
  }
  await audit({ userId: user.id, action: fieldId ? "update" : "create", entity: "custom_field", entityId: id, data: values });
  revalidatePath("/", "layout");
  redirect(`/settings/custom-fields?entity=${entity}`);
}

export async function deleteCustomField(fieldId: number): Promise<ActionState> {
  const user = await assertPermission("custom_fields.manage");
  const field = await db.query.customFields.findFirst({ where: eq(schema.customFields.id, fieldId) });
  if (!field) return { message: "Field not found" };
  // Values stay inside each record's JSON, so re-creating the same key later restores them.
  await db.delete(schema.customFields).where(eq(schema.customFields.id, fieldId));
  await audit({ userId: user.id, action: "delete", entity: "custom_field", entityId: fieldId, data: field });
  revalidatePath("/", "layout");
  redirect(`/settings/custom-fields?entity=${field.entity}`);
}

export async function moveCustomField(fieldId: number, direction: "up" | "down") {
  await assertPermission("custom_fields.manage");
  const field = await db.query.customFields.findFirst({ where: eq(schema.customFields.id, fieldId) });
  if (!field) return;
  const siblings = await db.query.customFields.findMany({
    where: and(eq(schema.customFields.entity, field.entity), ne(schema.customFields.id, -1)),
    orderBy: (f, { asc }) => [asc(f.sortOrder), asc(f.id)],
  });
  const idx = siblings.findIndex((s) => s.id === fieldId);
  const swap = siblings[direction === "up" ? idx - 1 : idx + 1];
  if (!swap) return;
  const ordered = [...siblings];
  ordered[idx] = swap;
  ordered[direction === "up" ? idx - 1 : idx + 1] = field;
  await db.transaction(async (tx) => {
    for (const [i, f] of ordered.entries()) {
      await tx.update(schema.customFields).set({ sortOrder: (i + 1) * 10 }).where(eq(schema.customFields.id, f.id));
    }
  });
  revalidatePath("/settings/custom-fields");
}
