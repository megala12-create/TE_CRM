import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { canSeeField, type CustomFieldDef, type CustomFieldEntity, type FieldViewer } from "@/lib/custom-fields";

/** Active custom fields of an entity that this user is allowed to see, in display order. */
export async function getVisibleFields(entity: CustomFieldEntity, viewer: FieldViewer): Promise<CustomFieldDef[]> {
  const rows = await db
    .select()
    .from(schema.customFields)
    .where(and(eq(schema.customFields.entity, entity), eq(schema.customFields.active, true)))
    .orderBy(asc(schema.customFields.sortOrder), asc(schema.customFields.id));
  return rows.filter((f) => canSeeField(f, viewer));
}

/** All active fields (used when saving, so hidden values are preserved). */
export async function getActiveFields(entity: CustomFieldEntity): Promise<CustomFieldDef[]> {
  return db
    .select()
    .from(schema.customFields)
    .where(and(eq(schema.customFields.entity, entity), eq(schema.customFields.active, true)))
    .orderBy(asc(schema.customFields.sortOrder), asc(schema.customFields.id));
}
