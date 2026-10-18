import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowDown, ArrowUp } from "lucide-react";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES } from "@/lib/custom-fields";
import { strParam, cn } from "@/lib/utils";
import { moveCustomField } from "./actions";

export const metadata = { title: "Custom fields" };

export default async function CustomFieldsPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  await requirePermission("custom_fields.manage");
  const requested = strParam((await searchParams).entity);
  const entity = CUSTOM_FIELD_ENTITIES.find((e) => e.value === requested)?.value ?? "customers";
  const fields = await db
    .select()
    .from(schema.customFields)
    .where(eq(schema.customFields.entity, entity))
    .orderBy(asc(schema.customFields.sortOrder), asc(schema.customFields.id));
  const roles = await db.select({ id: schema.roles.id, name: schema.roles.name }).from(schema.roles);
  const roleName = (ids: number[] | null) => (ids?.length ? ids.map((i) => roles.find((r) => r.id === i)?.name ?? "?").join(", ") : "All roles");

  return (
    <>
      <PageHeader
        title="Custom fields"
        subtitle="Add your own fields to any screen. Fields marked “Show as column” also appear in the list tables."
        actions={<LinkButton href={`/settings/custom-fields/new?entity=${entity}`}>Add field</LinkButton>}
      />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {CUSTOM_FIELD_ENTITIES.map((e) => (
          <Link
            key={e.value}
            href={`/settings/custom-fields?entity=${e.value}`}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              e.value === entity ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {e.label}
          </Link>
        ))}
      </div>
      <Card>
        {fields.length === 0 ? (
          <EmptyState title="No custom fields yet">
            Example: add “Brand name”, “Preferred process” (dropdown) or “Merchandiser” to customers.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th w-16">Order</th>
                  <th className="th">Label</th>
                  <th className="th">Type</th>
                  <th className="th">Options</th>
                  <th className="th">Visible to</th>
                  <th className="th">Editable by</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f, i) => (
                  <tr key={f.id} className={cn("hover:bg-slate-50", !f.active && "opacity-60")}>
                    <td className="td">
                      <div className="flex gap-0.5">
                        <form action={moveCustomField.bind(null, f.id, "up")}>
                          <button disabled={i === 0} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Move up">
                            <ArrowUp className="size-3.5" />
                          </button>
                        </form>
                        <form action={moveCustomField.bind(null, f.id, "down")}>
                          <button disabled={i === fields.length - 1} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Move down">
                            <ArrowDown className="size-3.5" />
                          </button>
                        </form>
                      </div>
                    </td>
                    <td className="td">
                      <Link href={`/settings/custom-fields/${f.id}`} className="link">
                        {f.label}
                      </Link>
                      <div className="font-mono text-xs text-slate-400">{f.key}</div>
                    </td>
                    <td className="td">{CUSTOM_FIELD_TYPES.find((t) => t.value === f.type)?.label ?? f.type}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {f.required ? <Badge tone="red">Required</Badge> : null}
                        {f.showInList ? <Badge tone="blue">Column</Badge> : null}
                        {!f.active ? <Badge>Hidden</Badge> : null}
                        {f.options.length ? <span className="text-xs text-slate-500">{f.options.join(", ")}</span> : null}
                      </div>
                    </td>
                    <td className="td text-slate-600">{roleName(f.visibleRoleIds)}</td>
                    <td className="td text-slate-600">{roleName(f.editableRoleIds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
