import Link from "next/link";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Download, Plus, Upload } from "lucide-react";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { getVisibleFields } from "@/server/custom-fields";
import { resolveColumns } from "@/server/columns";
import { saveColumns } from "@/server/list-actions";
import { customerScope } from "@/server/scope";
import { Badge, Card, EmptyState, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { ColumnChooser } from "@/components/column-chooser";
import { FilterTabs, Pagination, SearchBox, buildHref } from "@/components/list-tools";
import { displayCustomValue } from "@/lib/custom-fields";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { intParam, strParam } from "@/lib/utils";

export const metadata = { title: "Customers" };
const PAGE_SIZE = 25;

const BUILTIN = [
  { key: "contact", label: "Primary contact", default: true },
  { key: "phone", label: "Phone", default: true },
  { key: "email", label: "Email", default: false },
  { key: "gstin", label: "GSTIN", default: true },
  { key: "city", label: "City / State", default: true },
  { key: "groups", label: "Groups", default: true },
  { key: "owner", label: "Account owner", default: false },
  { key: "active", label: "Status", default: true },
  { key: "created", label: "Date created", default: false },
];

type SP = { q?: string; status?: string; group?: string; page?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("customers.view", "customers.view_own");
  const sp = await searchParams;
  const q = strParam(sp.q);
  const status = strParam(sp.status);
  const group = strParam(sp.group);
  const page = intParam(sp.page, 1);

  const fields = await getVisibleFields("customers", user);
  const cols = await resolveColumns(user.id, "customers", BUILTIN, fields);
  const scope = customerScope(user);
  const c = schema.customers;

  const like = `%${q}%`;
  const where = and(
    scope,
    q
      ? or(
          ilike(c.company, like),
          ilike(c.gstin, like),
          ilike(c.phone, like),
          ilike(c.email, like),
          ilike(c.city, like),
          sql`${c.custom}::text ilike ${like}`,
          sql`exists (select 1 from contacts ct where ct.customer_id = "customers"."id" and (ct.name ilike ${like} or ct.phone ilike ${like} or ct.email ilike ${like}))`,
        )
      : undefined,
    status === "active" ? eq(c.active, true) : status === "inactive" ? eq(c.active, false) : undefined,
    group ? sql`${group} = any(${c.groups})` : undefined,
  );

  const [rows, [totals], [contactCount]] = await Promise.all([
    db
      .select({
        id: c.id,
        company: c.company,
        phone: c.phone,
        email: c.email,
        gstin: c.gstin,
        city: c.city,
        state: c.state,
        groups: c.groups,
        active: c.active,
        custom: c.custom,
        createdAt: c.createdAt,
        ownerName: schema.users.name,
        contactName: sql<string | null>`(select ct.name from contacts ct where ct.customer_id = "customers"."id" order by ct.is_primary desc, ct.id limit 1)`,
        total: sql<number>`count(*) over()::int`,
      })
      .from(c)
      .leftJoin(schema.users, eq(schema.users.id, c.ownerId))
      .where(where)
      .orderBy(asc(c.company), desc(c.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${c.active})::int`,
      })
      .from(c)
      .where(scope),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.contacts)
      .innerJoin(c, eq(c.id, schema.contacts.customerId))
      .where(scope),
  ]);
  const total = rows[0]?.total ?? 0;
  const params = { q: q || undefined, status: status || undefined, group: group || undefined };

  return (
    <>
      <PageHeader
        title="Customers"
        actions={
          <>
            <LinkButton variant="secondary" href={buildHref("/api/export/customers", params)} prefetch={false}>
              <Download className="size-4" /> Export
            </LinkButton>
            {can(user, "customers.create") ? <LinkButton variant="secondary" href="/import/customers"><Upload className="size-4" /> Import</LinkButton> : null}
            {can(user, "customers.edit") ? <LinkButton variant="secondary" href="/import/contacts"><Upload className="size-4" /> Import contacts</LinkButton> : null}
            {can(user, "customers.create") ? (
              <LinkButton href="/customers/new">
                <Plus className="size-4" /> New customer
              </LinkButton>
            ) : null}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total customers" value={totals?.total ?? 0} href="/customers" />
        <StatCard label="Active customers" value={totals?.active ?? 0} tone="green" href="/customers?status=active" />
        <StatCard label="Inactive customers" value={(totals?.total ?? 0) - (totals?.active ?? 0)} tone="red" href="/customers?status=inactive" />
        <StatCard label="Contacts" value={contactCount?.n ?? 0} tone="blue" />
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3">
          <FilterTabs
            base="/customers"
            current={status}
            params={params}
            tabs={[
              { value: "", label: "All" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
          <div className="flex items-center gap-2">
            {group ? (
              <Link href={buildHref("/customers", { ...params, group: undefined })}>
                <Badge tone="blue">Group: {group} ✕</Badge>
              </Link>
            ) : null}
            <SearchBox action="/customers" defaultValue={q} placeholder="Name, GSTIN, phone, contact…" hidden={{ status, group }} />
            <ColumnChooser columns={cols.options} selected={cols.selected} save={saveColumns.bind(null, "customers")} />
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState title={q ? `No customers match “${q}”` : "No customers yet"}>
            {can(user, "customers.create") && !q ? <Link href="/customers/new" className="link">Add your first customer</Link> : null}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">#</th>
                  <th className="th">Company</th>
                  {cols.show("contact") && <th className="th">Primary contact</th>}
                  {cols.show("phone") && <th className="th">Phone</th>}
                  {cols.show("email") && <th className="th">Email</th>}
                  {cols.show("gstin") && <th className="th">GSTIN</th>}
                  {cols.show("city") && <th className="th">City / State</th>}
                  {cols.show("groups") && <th className="th">Groups</th>}
                  {cols.show("owner") && <th className="th">Account owner</th>}
                  {cols.visibleFields.map((f) => (
                    <th key={f.key} className="th">{f.label}</th>
                  ))}
                  {cols.show("active") && <th className="th">Status</th>}
                  {cols.show("created") && <th className="th">Created</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td text-slate-400 tabular-nums">{r.id}</td>
                    <td className="td">
                      <Link href={`/customers/${r.id}`} className="link">{r.company}</Link>
                    </td>
                    {cols.show("contact") && <td className="td">{r.contactName}</td>}
                    {cols.show("phone") && <td className="td whitespace-nowrap">{r.phone}</td>}
                    {cols.show("email") && <td className="td">{r.email}</td>}
                    {cols.show("gstin") && <td className="td font-mono text-xs">{r.gstin}</td>}
                    {cols.show("city") && <td className="td">{[r.city, r.state].filter(Boolean).join(", ")}</td>}
                    {cols.show("groups") && (
                      <td className="td">
                        <div className="flex flex-wrap gap-1">
                          {r.groups.map((g) => (
                            <Link key={g} href={buildHref("/customers", { ...params, group: g })}>
                              <Badge>{g}</Badge>
                            </Link>
                          ))}
                        </div>
                      </td>
                    )}
                    {cols.show("owner") && <td className="td">{r.ownerName}</td>}
                    {cols.visibleFields.map((f) => (
                      <td key={f.key} className="td">{displayCustomValue(f, r.custom[f.key])}</td>
                    ))}
                    {cols.show("active") && (
                      <td className="td">{r.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}</td>
                    )}
                    {cols.show("created") && <td className="td whitespace-nowrap">{formatDate(r.createdAt)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination base="/customers" page={page} pageSize={PAGE_SIZE} total={total} params={params} />
      </Card>
    </>
  );
}
