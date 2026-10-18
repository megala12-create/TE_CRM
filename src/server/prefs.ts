import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export async function getPref<T>(userId: number, key: string): Promise<T | null> {
  const row = await db.query.userPrefs.findFirst({
    where: and(eq(schema.userPrefs.userId, userId), eq(schema.userPrefs.key, key)),
  });
  return (row?.value as T) ?? null;
}

export async function setPref(userId: number, key: string, value: unknown) {
  await db
    .insert(schema.userPrefs)
    .values({ userId, key, value })
    .onConflictDoUpdate({ target: [schema.userPrefs.userId, schema.userPrefs.key], set: { value } });
}
