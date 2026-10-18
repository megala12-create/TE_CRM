"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, getCurrentUser, hashPassword, revokeUserSessions, verifyPassword } from "@/server/auth";
import { audit } from "@/server/audit";
import { passwordRule } from "@/lib/password";
import { str, type ActionState } from "@/lib/utils";

// Same in-process throttle as login: 5 wrong current passwords per user per 15 minutes.
const failures = new Map<number, { count: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;

/** Any logged-in user changes their own password. Needs no permission — only the current password. */
export async function changeOwnPassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const current = str(form, "currentPassword");
  const next = str(form, "newPassword");
  const confirm = str(form, "confirmPassword");

  const f = failures.get(user.id);
  if (f && f.count >= 5 && f.until > Date.now()) return { message: "Too many wrong attempts. Try again in 15 minutes." };

  const errors: Record<string, string> = {};
  if (!current) errors.currentPassword = "Enter your current password";
  const rule = passwordRule.safeParse(next);
  if (!rule.success) errors.newPassword = rule.error.issues[0]!.message;
  else if (next === current) errors.newPassword = "Choose a password different from the current one";
  if (confirm !== next) errors.confirmPassword = "Passwords do not match";
  if (Object.keys(errors).length) return { errors };

  const row = await db.query.users.findFirst({ where: eq(schema.users.id, user.id), columns: { passwordHash: true } });
  if (!row || !(await verifyPassword(row.passwordHash, current))) {
    const entry = f && f.until > Date.now() ? f : { count: 0, until: Date.now() + WINDOW_MS };
    entry.count++;
    failures.set(user.id, entry);
    return { errors: { currentPassword: "Current password is incorrect" } };
  }
  failures.delete(user.id);

  await db.update(schema.users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(schema.users.id, user.id));
  // Log out every other device, keep this one signed in
  await revokeUserSessions(user.id);
  await createSession(user.id);
  await audit({ userId: user.id, action: "password_change", entity: "user", entityId: user.id });
  redirect("/account/password?changed=1");
}
