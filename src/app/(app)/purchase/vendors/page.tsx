import { revalidatePath } from "next/cache";
import { asc, sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertPermission, requirePermission } from "@/server/auth";
import { audit } from "@/server/audit";
import { Upload } from "lucide-react";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckboxField, TextAreaField, TextField } from "@/components/fields";
import { isValidGstin } from "@/lib/gst";
import { can } from "@/lib/permissions";
import { intParam, optStr, str, type ActionState } from "@/lib/utils";

export const metadata = { title: "Vendors" };

async function saveVendor(vendorId: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  "use server";
  const user = await assertPermission(vendorId ? "purchase.edit" : "purchase.create");
  const errors: Record<string, string> = {};
  const name = str(form, "name");
  const gstin = optStr(form, "gstin")?.toUpperCase() ?? null;
  const email = optStr(form, "email");
  if (!name) errors.name = "Name is required";
  if (gstin && !isValidGstin(gstin)) errors.gstin = "This GSTIN is not valid";
  if (email && !z.email().safeParse(email).success) errors.email = "Enter a valid email";
  if (Object.keys(errors).length) return { errors };
  const values = { name, gstin, email, phone: optStr(form, "phone"), address: optStr(form, "address"), active: form.get("active") === "on", updatedAt: new Date() };
  if (vendorId) await db.update(schema.vendors).set(values).where(eq(schema.vendors.id, vendorId));
  else await db.insert(schema.vendors).values(values);
  await audit({ userId: user.id, action: vendorId ? "update" : "create", entity: "vendor", entityId: vendorId, data: values });
  revalidatePath("/purchase/vendors");
  return { ok: true, message: vendorId ? "Vendor saved." : `Added “${name}”.` };
}

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requirePermission("purchase.view");
  const editId = intParam((await searchParams).edit, 0);
  const vendors = await db
    .select({
      v: schema.vendors,
      spent: sql<string>`(select coalesce(sum(x.total), 0) from expenses x where x.vendor_id = "vendors"."id")`,
    })
    .from(schema.vendors)
    .orderBy(asc(schema.vendors.name));
  const editing = vendors.find((r) => r.v.id === editId)?.v;
  const manage = can(user, editing ? "purchase.edit" : "purchase.create");

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers of films, inks, consumables and services. Used on expenses (and later purchase orders)."
        actions={can(user, "purchase.create") ? <LinkButton variant="secondary" href="/import/vendors"><Upload className="size-4" /> Import</LinkButton> : null}
      />
      <div className={manage ? "grid gap-5 xl:grid-cols-[1fr_380px]" : ""}>
        <Card>
          {vendors.length === 0 ? (
            <EmptyState title="No vendors yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr><th className="th">Vendor</th><th className="th">GSTIN</th><th className="th">Phone</th><th className="th text-right">Expenses</th><th className="th">Status</th></tr>
                </thead>
                <tbody>
                  {vendors.map(({ v, spent }) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="td">
                        {can(user, "purchase.edit") ? <a href={`?edit=${v.id}`} className="link">{v.name}</a> : <span className="font-medium">{v.name}</span>}
                        {v.email ? <div className="text-xs text-slate-500">{v.email}</div> : null}
                      </td>
                      <td className="td font-mono text-xs">{v.gstin}</td>
                      <td className="td">{v.phone}</td>
                      <td className="td text-right tabular-nums">₹{Number(spent).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      <td className="td">{v.active ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {manage ? (
          <Card title={editing ? `Edit ${editing.name}` : "Add vendor"}>
            <ActionForm key={editing?.id ?? "new"} action={saveVendor.bind(null, editing?.id ?? null)} className="space-y-3 p-4">
              <TextField name="name" label="Name" required defaultValue={editing?.name} />
              <TextField name="gstin" label="GSTIN" defaultValue={editing?.gstin} maxLength={15} />
              <div className="grid grid-cols-2 gap-3">
                <TextField name="phone" label="Phone" type="tel" defaultValue={editing?.phone} />
                <TextField name="email" label="Email" type="email" defaultValue={editing?.email} />
              </div>
              <TextAreaField name="address" label="Address" defaultValue={editing?.address} rows={2} />
              <CheckboxField name="active" label="Active" defaultChecked={editing?.active ?? true} />
              <div className="flex justify-end gap-2">
                {editing ? <a href="/purchase/vendors" className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</a> : null}
                <SubmitButton>{editing ? "Save vendor" : "Add vendor"}</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
