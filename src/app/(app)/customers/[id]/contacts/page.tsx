import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { getVisibleFields } from "@/server/custom-fields";
import { loadCustomer } from "@/server/scope";
import { Badge, Card, EmptyState } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckboxField, FormGrid, TextField } from "@/components/fields";
import { CustomFieldInputs } from "@/components/custom-field-inputs";
import { displayCustomValue } from "@/lib/custom-fields";
import { can } from "@/lib/permissions";
import { intParam } from "@/lib/utils";
import { deleteContact, saveContact } from "../../actions";

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const user = await requirePermission("customers.view", "customers.view_own");
  const customer = await loadCustomer(user, Number((await params).id));
  const editId = intParam((await searchParams).edit, 0);
  const [contacts, fields] = await Promise.all([
    db.query.contacts.findMany({
      where: eq(schema.contacts.customerId, customer.id),
      orderBy: [desc(schema.contacts.isPrimary), asc(schema.contacts.name)],
    }),
    getVisibleFields("contacts", user),
  ]);
  const editable = can(user, "customers.edit");
  const editing = contacts.find((c) => c.id === editId);

  return (
    <div className="space-y-5">
      <Card title={`Contacts (${contacts.length})`}>
        {contacts.length === 0 ? (
          <EmptyState title="No contacts yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Position</th>
                  <th className="th">Phone</th>
                  <th className="th">WhatsApp</th>
                  <th className="th">Email</th>
                  {fields.map((f) => <th key={f.key} className="th">{f.label}</th>)}
                  {editable ? <th className="th" /> : null}
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="td font-medium text-slate-800">
                      {c.name} {c.isPrimary ? <Badge tone="blue">Primary</Badge> : null}
                    </td>
                    <td className="td">{c.title}</td>
                    <td className="td whitespace-nowrap">{c.phone}</td>
                    <td className="td whitespace-nowrap">
                      {c.whatsapp ? (
                        <a className="link" href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                          {c.whatsapp}
                        </a>
                      ) : null}
                    </td>
                    <td className="td">{c.email}</td>
                    {fields.map((f) => <td key={f.key} className="td">{displayCustomValue(f, c.custom[f.key])}</td>)}
                    {editable ? (
                      <td className="td whitespace-nowrap text-right">
                        <a href={`?edit=${c.id}#contact-form`} className="link mr-3">Edit</a>
                        <form action={deleteContact.bind(null, customer.id, c.id)} className="inline">
                          <button className="text-sm font-medium text-red-600 hover:underline">Delete</button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editable ? (
        <section id="contact-form" className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">{editing ? `Edit ${editing.name}` : "Add contact"}</h2>
          <ActionForm key={editing?.id ?? "new"} action={saveContact.bind(null, customer.id, editing?.id ?? null)} className="space-y-4">
            <FormGrid>
              <TextField name="name" label="Name" required defaultValue={editing?.name} />
              <TextField name="title" label="Position" defaultValue={editing?.title} />
              <TextField name="phone" label="Phone" type="tel" defaultValue={editing?.phone} />
              <TextField name="whatsapp" label="WhatsApp number" type="tel" defaultValue={editing?.whatsapp} placeholder="+91…" />
              <TextField name="email" label="Email" type="email" defaultValue={editing?.email} />
              <CheckboxField name="isPrimary" label="Primary contact" defaultChecked={editing?.isPrimary ?? contacts.length === 0} className="pt-7" />
            </FormGrid>
            <CustomFieldInputs fields={fields} values={editing?.custom ?? {}} viewer={user} />
            <div className="flex justify-end gap-2">
              {editing ? <a href="?" className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</a> : null}
              <SubmitButton>{editing ? "Save contact" : "Add contact"}</SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
