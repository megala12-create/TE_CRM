import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { Badge, Card, PageHeader } from "@/components/ui";
import { Pagination } from "@/components/list-tools";
import { formatDateTime } from "@/lib/format";
import { intParam, strParam } from "@/lib/utils";

export const metadata = { title: "Audit log" };
const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; page?: string }> }) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const entity = strParam(sp.entity);
  const page = intParam(sp.page, 1);
  const a = schema.auditLog;
  const rows = await db
    .select({ id: a.id, action: a.action, entity: a.entity, entityId: a.entityId, createdAt: a.createdAt, user: schema.users.name, total: sql<number>`count(*) over()::int` })
    .from(a)
    .leftJoin(schema.users, eq(schema.users.id, a.userId))
    .where(entity ? eq(a.entity, entity) : undefined)
    .orderBy(desc(a.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const tone = (action: string) => (action === "delete" || action === "cancel" ? "red" : action === "create" || action === "issue" ? "green" : "slate");
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every change, login and approval — who did what and when." />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">When</th><th className="th">User</th><th className="th">Action</th><th className="th">Record</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="td whitespace-nowrap text-slate-500">{formatDateTime(r.createdAt)}</td>
                  <td className="td">{r.user ?? "System"}</td>
                  <td className="td"><Badge tone={tone(r.action)}>{r.action}</Badge></td>
                  <td className="td"><a className="link" href={`?entity=${r.entity}`}>{r.entity}</a>{r.entityId ? ` #${r.entityId}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination base="/settings/audit" page={page} pageSize={PAGE_SIZE} total={rows[0]?.total ?? 0} params={{ entity: entity || undefined }} />
      </Card>
    </>
  );
}
