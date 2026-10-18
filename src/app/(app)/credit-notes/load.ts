import "server-only";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerScope, invoiceScope } from "@/server/scope";
import { can, viewScope } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth";

export async function loadCreditNoteDetail(user: CurrentUser, rawId: string) {
  if (!can(user, "credit_notes.view") || viewScope(user, "customers") === "none") redirect("/forbidden");
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();
  const [row] = await db
    .select({ cn: schema.creditNotes, customer: schema.customers })
    .from(schema.creditNotes)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.creditNotes.customerId))
    .where(and(eq(schema.creditNotes.id, id), customerScope(user)))
    .limit(1);
  if (!row) notFound();
  const [lines, applications, refunds] = await Promise.all([
    db.select().from(schema.creditNoteLines).where(eq(schema.creditNoteLines.creditNoteId, id)).orderBy(asc(schema.creditNoteLines.sortOrder)),
    db
      .select({ id: schema.creditApplications.id, date: schema.creditApplications.date, amount: schema.creditApplications.amount, invoiceId: schema.invoices.id, invoiceNumber: schema.invoices.number })
      .from(schema.creditApplications)
      .innerJoin(schema.invoices, eq(schema.invoices.id, schema.creditApplications.invoiceId))
      .where(eq(schema.creditApplications.creditNoteId, id))
      .orderBy(desc(schema.creditApplications.date)),
    db.select().from(schema.creditRefunds).where(eq(schema.creditRefunds.creditNoteId, id)).orderBy(desc(schema.creditRefunds.date)),
  ]);
  return { creditNote: row.cn, customer: row.customer, lines, applications, refunds };
}

/** Issued invoices of a customer that still have a balance (targets for "Apply credit"). */
export async function openInvoicesOf(user: CurrentUser, customerId: number) {
  return db
    .select({ id: schema.invoices.id, number: schema.invoices.number, total: schema.invoices.total, amountPaid: schema.invoices.amountPaid })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.customerId, customerId), inArray(schema.invoices.status, ["issued"]), invoiceScope(user)))
    .orderBy(asc(schema.invoices.dueDate));
}
