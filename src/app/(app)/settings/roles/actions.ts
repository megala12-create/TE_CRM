"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { assertPermission } from "@/server/auth";
import { audit } from "@/server/audit";
import { isValidPermission } from "@/lib/permissions";
import { str, optStr, type ActionState } from "@/lib/utils";

function readPermissions(form: FormData): string[] {
  return [...new Set(form.getAll("permissions").map(String))].filter(isValidPermission).sort();
}

export async function saveRole(roleId: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("roles.manage");
  const name = str(form, "name");
  if (!name) return { errors: { name: "Role name is required" } };

  const clash = await db.query.roles.findFirst({
    where: roleId ? and(eq(sql`lower(${schema.roles.name})`, name.toLowerCase()), ne(schema.roles.id, roleId)) : eq(sql`lower(${schema.roles.name})`, name.toLowerCase()),
  });
  if (clash) return { errors: { name: "A role with this name already exists" } };

  const values = { name, description: optStr(form, "description"), permissions: readPermissions(form), updatedAt: new Date() };
  let id = roleId;
  if (roleId) {
    await db.update(schema.roles).set(values).where(eq(schema.roles.id, roleId));
  } else {
    const [row] = await db.insert(schema.roles).values(values).returning({ id: schema.roles.id });
    id = row!.id;
  }
  await audit({ userId: user.id, action: roleId ? "update" : "create", entity: "role", entityId: id, data: values });
  revalidatePath("/settings/roles");
  redirect("/settings/roles");
}

export async function deleteRole(roleId: number): Promise<ActionState> {
  const user = await assertPermission("roles.manage");
  const role = await db.query.roles.findFirst({ where: eq(schema.roles.id, roleId) });
  if (!role) return { message: "Role not found" };
  if (role.isSystem) return { message: "System roles cannot be deleted." };
  const [inUse] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.roleId, roleId));
  if ((inUse?.n ?? 0) > 0) return { message: `This role is assigned to ${inUse!.n} staff member(s). Reassign them first.` };
  await db.delete(schema.roles).where(eq(schema.roles.id, roleId));
  await audit({ userId: user.id, action: "delete", entity: "role", entityId: roleId, data: { name: role.name } });
  revalidatePath("/settings/roles");
  redirect("/settings/roles");
}
