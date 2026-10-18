import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { intParam } from "@/lib/utils";

export const metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const user = await requirePermission("staff.view", "staff.manage");
  const roleFilter = intParam((await searchParams).role, 0);
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      phone: schema.users.phone,
      isAdmin: schema.users.isAdmin,
      active: schema.users.active,
      lastLoginAt: schema.users.lastLoginAt,
      roleName: schema.roles.name,
    })
    .from(schema.users)
    .leftJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(roleFilter ? eq(schema.users.roleId, roleFilter) : undefined)
    .orderBy(asc(schema.users.name));
  const manage = can(user, "staff.manage");

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle={roleFilter ? <Link href="/settings/staff" className="link">Show all staff</Link> : "Everyone who can log in to the CRM."}
        actions={manage ? <LinkButton href="/settings/staff/new">New staff member</LinkButton> : null}
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Email</th>
                <th className="th">Phone</th>
                <th className="th">Role</th>
                <th className="th">Status</th>
                <th className="th">Last login</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td">
                    {manage ? <Link href={`/settings/staff/${r.id}`} className="link">{r.name}</Link> : r.name}
                  </td>
                  <td className="td">{r.email}</td>
                  <td className="td">{r.phone}</td>
                  <td className="td">{r.isAdmin ? <Badge tone="blue">Administrator</Badge> : r.roleName ?? <span className="text-slate-400">—</span>}</td>
                  <td className="td">{r.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}</td>
                  <td className="td text-slate-500">{formatDateTime(r.lastLoginAt) || "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
