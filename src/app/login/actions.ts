"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, hashPassword, verifyPassword } from "@/server/auth";
import { audit } from "@/server/audit";

// Simple in-process throttle: 5 failed attempts per email per 15 minutes.
// Replace with Redis when running more than one app instance.
const failures = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;

// A real hash so unknown emails take the same time as wrong passwords.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("timing-equaliser-not-a-password"));

export async function login(
  _prev: { message?: string; email?: string },
  form: FormData,
): Promise<{ message?: string; email?: string }> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");

  const f = failures.get(email);
  if (f && f.count >= 5 && f.until > Date.now()) {
    return { message: "Too many attempts. Try again in 15 minutes.", email };
  }

  const user = await db.query.users.findFirst({ where: eq(sql`lower(${schema.users.email})`, email) });
  const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
  if (!user || !ok || !user.active) {
    const entry = f && f.until > Date.now() ? f : { count: 0, until: Date.now() + WINDOW_MS };
    entry.count++;
    failures.set(email, entry);
    return { message: user && ok && !user.active ? "This account is deactivated." : "Incorrect email or password.", email };
  }

  failures.delete(email);
  await createSession(user.id);
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await audit({ userId: user.id, action: "login", entity: "user", entityId: user.id });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
