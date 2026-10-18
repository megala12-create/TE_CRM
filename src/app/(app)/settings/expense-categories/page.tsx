import Link from "next/link";
import { asc, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { CheckboxField, TextAreaField, TextField } from "@/components/fields";
import { SearchBox } from "@/components/list-tools";
import { can } from "@/lib/permissions";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { intParam, strParam } from "@/lib/utils";
import { deleteExpenseCategory, mergeExpenseCategory, saveExpenseCategory, toggleExpenseCategory } from "./actions";

export const metadata = { title: "Expense categories" };

export default async function ExpenseCategoriesPage({ searchParams }: { searchParams: Promise<{ q?: string; edit?: string; merged?: string }> }) {
  const user = await requirePermission("expense_categories.view");
  const sp = await searchParams;
  const q = strParam(sp.q);
  const editId = intParam(sp.edit, 0);
  const c = schema.expenseCategories;
  const e = schema.expenses;
  const cats = await db
    .select({
      id: c.id,
      name: c.name,
      description: c.description,
      active: c.active,
      used: sql<number>`(select count(*)::int from expenses x where x.category_id = "expense_categories"."id")`,
      spent: sql<string>`(select coalesce(sum(x.total), 0) from expenses x where x.category_id = "expense_categories"."id")`,
      lastUsed: sql<string | null>`(select max(x.date)::text from expenses x where x.category_id = "expense_categories"."id")`,
    })
    .from(c)
    .where(q ? or(ilike(c.name, `%${q}%`), ilike(c.description, `%${q}%`)) : undefined)
    .orderBy(asc(c.name));
  const all = q ? await db.select({ id: c.id, name: c.name }).from(c).orderBy(asc(c.name)) : cats;
  const editing = editId ? await db.query.expenseCategories.findFirst({ where: eq(c.id, editId) }) : undefined;
  const canCreate = can(user, "expense_categories.create");
  const canEdit = can(user, "expense_categories.edit");
  const canDelete = can(user, "expense_categories.delete");
  const editingUsage = editing ? cats.find((x) => x.id === editing.id)?.used ?? 0 : 0;

  return (
    <>
      <PageHeader
        title="Expense categories"
        subtitle="The master list used on expenses, imports and reports. Hidden categories stay on old expenses but can't be picked for new ones."
      />
      {sp.merged ? <div role="status" className="mb-4 rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Merged: {strParam(sp.merged)}</div> : null}
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3">
            <span className="text-sm text-slate-500">{cats.length} categor{cats.length === 1 ? "y" : "ies"}</span>
            <SearchBox action="/settings/expense-categories" defaultValue={q} placeholder="Search categories" />
          </div>
          {cats.length === 0 ? (
            <EmptyState title="No categories found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Category</th>
                    <th className="th text-right">Expenses</th>
                    <th className="th text-right">Total spent</th>
                    <th className="th">Last used</th>
                    <th className="th">Status</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {cats.map((cat) => (
                    <tr key={cat.id} className={editId === cat.id ? "bg-brand-50" : "hover:bg-slate-50"}>
                      <td className="td">
                        {canEdit ? <Link href={`?edit=${cat.id}`} className="link">{cat.name}</Link> : <span className="font-medium">{cat.name}</span>}
                        {cat.description ? <div className="text-xs text-slate-500">{cat.description}</div> : null}
                      </td>
                      <td className="td text-right tabular-nums">
                        {cat.used ? <Link href={`/expenses?category=${cat.id}`} className="link font-normal">{cat.used}</Link> : 0}
                      </td>
                      <td className="td whitespace-nowrap text-right tabular-nums">{formatINR(cat.spent)}</td>
                      <td className="td whitespace-nowrap text-slate-500">{formatDate(cat.lastUsed)}</td>
                      <td className="td">{cat.active ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>}</td>
                      <td className="td text-right">
                        {canEdit ? (
                          <ActionForm action={async () => { "use server"; return toggleExpenseCategory(cat.id); }}>
                            <button className="text-sm font-medium text-brand-600 hover:underline">{cat.active ? "Hide" : "Show"}</button>
                          </ActionForm>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          {editing && canEdit ? (
            <Card title={`Edit “${editing.name}”`}>
              <ActionForm key={`edit-${editing.id}`} action={saveExpenseCategory.bind(null, editing.id)} className="space-y-3 p-4">
                <TextField name="name" label="Name" required defaultValue={editing.name} maxLength={80} />
                <TextAreaField name="description" label="Description" defaultValue={editing.description} rows={2} />
                <CheckboxField name="active" label="Active (can be picked on new expenses)" defaultChecked={editing.active} />
                <div className="flex justify-end gap-2">
                  <Link href="/settings/expense-categories" className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</Link>
                  <SubmitButton>Save</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          ) : canCreate ? (
            <Card title="Add category">
              <ActionForm key="new" action={saveExpenseCategory.bind(null, null)} className="space-y-3 p-4">
                <TextField name="name" label="Name" required maxLength={80} placeholder="e.g. Canteen" />
                <TextAreaField name="description" label="Description" rows={2} />
                <CheckboxField name="active" label="Active" defaultChecked />
                <div className="flex justify-end"><SubmitButton>Add category</SubmitButton></div>
              </ActionForm>
            </Card>
          ) : null}

          {editing && canEdit && canDelete ? (
            <Card title="Merge or delete">
              <div className="space-y-4 p-4">
                <ActionForm action={mergeExpenseCategory.bind(null, editing.id)} confirm={`Move all ${editingUsage} expense(s) from “${editing.name}” and delete it?`} className="space-y-2">
                  <label htmlFor="targetId" className="label">Merge “{editing.name}” into</label>
                  <select id="targetId" name="targetId" required className="input" defaultValue="">
                    <option value="" disabled>— Choose category —</option>
                    {all.filter((x) => x.id !== editing.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <FieldError name="targetId" />
                  <p className="text-xs text-slate-500">Moves its {editingUsage} expense(s) to the chosen category, then removes “{editing.name}”. Useful for duplicates such as “Stationary” / “Stationery”.</p>
                  <SubmitButton variant="secondary">Merge</SubmitButton>
                </ActionForm>
                <ActionForm action={async () => { "use server"; return deleteExpenseCategory(editing.id); }} confirm={`Delete “${editing.name}”?`} className="border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs text-slate-500">{editingUsage ? "Categories in use can't be deleted — merge or hide instead." : "Not used by any expense, so it can be deleted."}</p>
                  <SubmitButton variant="danger">Delete category</SubmitButton>
                </ActionForm>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
