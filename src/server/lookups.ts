import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export function activeStaff() {
  return db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.active, true))
    .orderBy(asc(schema.users.name));
}
