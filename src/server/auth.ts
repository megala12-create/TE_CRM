import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { db, schema } from "@/db";
import { can, type Permission } from "@/lib/permissions";

export const SESSION_COOKIE = "te_session";
const SESSION_DAYS = 7;

export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
  roleId: number | null;
  roleName: string | null;
  permissions: string[];
};

const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string) {
  return hash(password, ARGON_OPTS);
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password).catch(() => false);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  const h = await headers();
  await db.insert(schema.sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  // Opportunistic cleanup of expired sessions
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure (HTTPS-only) in production unless explicitly disabled for a plain-HTTP LAN install
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

/** Destroys every session of a user, e.g. after a password change or deactivation. */
export async function revokeUserSessions(userId: number) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

/** Resolves the logged-in user once per request (React cache). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      isAdmin: schema.users.isAdmin,
      active: schema.users.active,
      roleId: schema.users.roleId,
      roleName: schema.roles.name,
      permissions: schema.roles.permissions,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .leftJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(and(eq(schema.sessions.id, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const u = rows[0];
  if (!u || !u.active) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isAdmin: u.isAdmin,
    roleId: u.roleId,
    roleName: u.isAdmin ? "Administrator" : u.roleName,
    permissions: u.permissions ?? [],
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirects to an access-denied page when the permission is missing. */
export async function requirePermission(...anyOf: Permission[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!anyOf.some((p) => can(user, p))) redirect("/forbidden");
  return user;
}

export class ForbiddenError extends Error {
  constructor() {
    super("You do not have permission to do this.");
  }
}

/** For server actions: throws instead of redirecting. */
export async function assertPermission(...anyOf: Permission[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!anyOf.some((p) => can(user, p))) throw new ForbiddenError();
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/forbidden");
  return user;
}
