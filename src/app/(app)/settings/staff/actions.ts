"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertPermission, hashPassword, revokeUserSessions } from "@/server/auth";
import { audit } from "@/server/audit";
import { str, optStr, type ActionState } from "@/lib/utils";

const passwordRule = z
  .string()
  .min(5, "Use at least 5 characters")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Use letters and numbers");

async function otherActiveAdmins(excludeId: number) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(and(eq(schema.users.isAdmin, true), eq(schema.users.active, true), ne(schema.users.id, excludeId)));
  return row?.n ?? 0;
}

export async function saveStaff(staffId: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await assertPermission("staff.manage");
  const errors: Record<string, string> = {};

  const name = str(form, "name");
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const roleId = Number(str(form, "roleId")) || null;
  const active = form.get("active") === "on";
  // Only administrators may grant or revoke administrator rights.
  const existing = staffId ? await db.query.users.findFirst({ where: eq(schema.users.id, staffId) }) : undefined;
  if (staffId && !existing) return { message: "Staff member not found" };
  const isAdmin = actor.isAdmin ? form.get("isAdmin") === "on" : (existing?.isAdmin ?? false);

  if (!name) errors.name = "Name is required";
  if (!z.email().safeParse(email).success) errors.email = "Enter a valid email";
  if (!staffId || password) {
    const p = passwordRule.safeParse(password);
    if (!p.success) errors.password = p.error.issues[0]!.message;
  }
  if (!isAdmin && !roleId) errors.roleId = "Choose a role (or make this user an administrator)";
  if (roleId && !(await db.query.roles.findFirst({ where: eq(schema.roles.id, roleId) }))) errors.roleId = "Unknown role";

  const dup = await db.query.users.findFirst({
    where: staffId
      ? and(eq(sql`lower(${schema.users.email})`, email), ne(schema.users.id, staffId))
      : eq(sql`lower(${schema.users.email})`, email),
  });
  if (dup) errors.email = "Another staff member already uses this email";

  if (existing?.isAdmin && (!isAdmin || !active) && (await otherActiveAdmins(existing.id)) === 0) {
    return { message: "At least one active administrator is required. Make someone else an administrator first." };
  }
  if (Object.keys(errors).length) return { errors };

  const values = { name, email, phone: optStr(form, "phone"), roleId, isAdmin, active, updatedAt: new Date() };
  let id = staffId;
  if (staffId) {
    await db
      .update(schema.users)
      .set({ ...values, ...(password ? { passwordHash: await hashPassword(password) } : {}) })
      .where(eq(schema.users.id, staffId));
    // Force re-login when credentials or access were reduced
    if (password || !active || existing!.roleId !== roleId || existing!.isAdmin !== isAdmin) await revokeUserSessions(staffId);
  } else {
    const [row] = await db
      .insert(schema.users)
      .values({ ...values, passwordHash: await hashPassword(password) })
      .returning({ id: schema.users.id });
    id = row!.id;
  }
  await audit({
    userId: actor.id,
    action: staffId ? "update" : "create",
    entity: "user",
    entityId: id,
    data: { ...values, passwordChanged: Boolean(password) },
  });
  revalidatePath("/settings/staff");
  redirect("/settings/staff");
}
