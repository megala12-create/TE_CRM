import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { loadCustomer } from "@/server/scope";
import { Card, EmptyState } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TextAreaField } from "@/components/fields";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { addNote, deleteNote } from "../../actions";

export default async function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("customers.view", "customers.view_own");
  const customer = await loadCustomer(user, Number((await params).id));
  const notes = await db
    .select({ id: schema.customerNotes.id, body: schema.customerNotes.body, createdAt: schema.customerNotes.createdAt, author: schema.users.name })
    .from(schema.customerNotes)
    .leftJoin(schema.users, eq(schema.users.id, schema.customerNotes.createdBy))
    .where(eq(schema.customerNotes.customerId, customer.id))
    .orderBy(desc(schema.customerNotes.createdAt));

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <ActionForm action={addNote.bind(null, customer.id)} className="space-y-3">
          <TextAreaField name="body" label="Add a note" rows={3} />
          <div className="flex justify-end">
            <SubmitButton>Add note</SubmitButton>
          </div>
        </ActionForm>
      </section>
      <Card title={`Notes (${notes.length})`}>
        {notes.length === 0 ? (
          <EmptyState title="No notes yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {notes.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    <span className="font-medium text-slate-700">{n.author ?? "Former staff"}</span> · {formatDateTime(n.createdAt)}
                  </span>
                  {can(user, "customers.edit") ? (
                    <form action={deleteNote.bind(null, customer.id, n.id)}>
                      <button className="text-red-600 hover:underline">Delete</button>
                    </form>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
