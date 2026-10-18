import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { assertPermission, requirePermission } from "@/server/auth";
import { audit } from "@/server/audit";
import { getCompany } from "@/server/settings";
import { Upload } from "lucide-react";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/fields";
import { can } from "@/lib/permissions";
import { formatINR } from "@/lib/money";
import { intParam, optStr, str, type ActionState } from "@/lib/utils";

export const metadata = { title: "Items" };

async function saveItem(itemId: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  "use server";
  const user = await assertPermission("items.manage");
  const errors: Record<string, string> = {};
  const name = str(form, "name");
  const rate = str(form, "rate") || "0";
  const taxRate = str(form, "taxRate");
  const hsnSac = optStr(form, "hsnSac");
  if (!name) errors.name = "Name is required";
  if (!/^\d+(\.\d{1,2})?$/.test(rate)) errors.rate = "Enter a rate";
  if (!/^\d+(\.\d{1,2})?$/.test(taxRate) || Number(taxRate) > 100) errors.taxRate = "Choose a GST rate";
  if (hsnSac && !/^\d{4,8}$/.test(hsnSac)) errors.hsnSac = "HSN/SAC is 4–8 digits";
  if (Object.keys(errors).length) return { errors };
  const values = {
    name, rate, taxRate, hsnSac, description: optStr(form, "description"), unit: str(form, "unit") || "pcs",
    active: form.get("active") === "on", updatedAt: new Date(),
  };
  if (itemId) await db.update(schema.items).set(values).where(eq(schema.items.id, itemId));
  else await db.insert(schema.items).values(values);
  await audit({ userId: user.id, action: itemId ? "update" : "create", entity: "item", entityId: itemId, data: values });
  revalidatePath("/items");
  return { ok: true, message: itemId ? "Item saved." : `Added “${name}”.` };
}

export default async function ItemsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requirePermission("items.view");
  const editId = intParam((await searchParams).edit, 0);
  const [items, company] = await Promise.all([db.select().from(schema.items).orderBy(asc(schema.items.name)), getCompany()]);
  const editing = items.find((i) => i.id === editId);
  const manage = can(user, "items.manage");

  return (
    <>
      <PageHeader
        title="Items & rates"
        subtitle="Your processes and products with default rate, HSN/SAC and GST — picked when creating invoices."
        actions={manage ? <LinkButton variant="secondary" href="/import/items"><Upload className="size-4" /> Import</LinkButton> : null}
      />
      <div className={manage ? "grid gap-5 xl:grid-cols-[1fr_380px]" : ""}>
        <Card>
          {items.length === 0 ? (
            <EmptyState title="No items yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Item</th>
                    <th className="th">HSN/SAC</th>
                    <th className="th">Unit</th>
                    <th className="th text-right">Rate</th>
                    <th className="th text-right">GST</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <td className="td">
                        {manage ? <a href={`?edit=${i.id}`} className="link">{i.name}</a> : <span className="font-medium">{i.name}</span>}
                        {i.description ? <div className="text-xs text-slate-500">{i.description}</div> : null}
                      </td>
                      <td className="td font-mono text-xs">{i.hsnSac}</td>
                      <td className="td">{i.unit}</td>
                      <td className="td text-right tabular-nums">{formatINR(i.rate)}</td>
                      <td className="td text-right tabular-nums">{Number(i.taxRate)}%</td>
                      <td className="td">{i.active ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {manage ? (
          <Card title={editing ? `Edit ${editing.name}` : "Add item"}>
            <ActionForm key={editing?.id ?? "new"} action={saveItem.bind(null, editing?.id ?? null)} className="space-y-3 p-4">
              <TextField name="name" label="Name" required defaultValue={editing?.name} placeholder="e.g. DTF print – A4" />
              <TextAreaField name="description" label="Description" defaultValue={editing?.description} rows={2} />
              <div className="grid grid-cols-2 gap-3">
                <TextField name="hsnSac" label="HSN/SAC" defaultValue={editing?.hsnSac} />
                <TextField name="unit" label="Unit" defaultValue={editing?.unit ?? "pcs"} />
                <TextField name="rate" label="Rate (₹)" type="number" step="0.01" min="0" defaultValue={editing?.rate ?? "0"} />
                <SelectField
                  name="taxRate"
                  label="GST %"
                  defaultValue={editing ? String(Number(editing.taxRate)) : "18"}
                  options={[...new Set([...company.taxRates.map(String), editing ? String(Number(editing.taxRate)) : "18"])].map((r) => ({ value: r, label: `${r}%` }))}
                />
              </div>
              <CheckboxField name="active" label="Active" defaultChecked={editing?.active ?? true} />
              <div className="flex justify-end gap-2">
                {editing ? <a href="/items" className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</a> : null}
                <SubmitButton>{editing ? "Save item" : "Add item"}</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
