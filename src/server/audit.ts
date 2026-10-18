import "server-only";
import { db, schema, type Tx } from "@/db";

export async function audit(
  entry: { userId: number | null; action: string; entity: string; entityId?: string | number | null; data?: unknown },
  tx?: Tx,
) {
  await (tx ?? db).insert(schema.auditLog).values({
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
    data: entry.data ?? null,
  });
}
