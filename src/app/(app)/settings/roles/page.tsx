import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { ALL_PERMISSIONS } from "@/lib/permissions";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  await requirePermission("roles.manage");
  const roles = await db
    .select({
      id: schema.roles.id,
      name: schema.roles.name,
      description: schema.roles.description,
      permissions: schema.roles.permissions,
      isSystem: schema.roles.isSystem,
      staff: sql<number>`(select count(*)::int from users u where u.role_id = "roles"."id")`,
    })
    .from(schema.roles)
    .orderBy(asc(schema.roles.name));

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        subtitle="Create roles and choose exactly what each one can see and do. Administrators always have full access."
        actions={<LinkButton href="/settings/roles/new">New role</LinkButton>}
      />
      <Card>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Role</th>
              <th className="th">Permissions</th>
              <th className="th">Staff</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="td">
                  <Link href={`/settings/roles/${r.id}`} className="link">
                    {r.name}
                  </Link>{" "}
                  {r.isSystem ? <Badge>System</Badge> : null}
                  {r.description ? <div className="text-xs text-slate-500">{r.description}</div> : null}
                </td>
                <td className="td tabular-nums">
                  {r.permissions.length} / {ALL_PERMISSIONS.length}
                </td>
                <td className="td tabular-nums">
                  <Link href={`/settings/staff?role=${r.id}`} className="link">
                    {r.staff}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
