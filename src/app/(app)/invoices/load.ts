import "server-only";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { invoiceScope } from "@/server/scope";
import { viewScope } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth";

export async function loadInvoiceDetail(user: CurrentUser, rawId: string) {
  if (viewScope(user, "invoices") === "none") redirect("/forbidden");
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();
  const [invoice] = await db.select().from(schema.invoices).where(and(eq(schema.invoices.id, id), invoiceScope(user))).limit(1);
  if (!invoice) notFound();
  const [customer, lines, payments, credits] = await Promise.all([
    db.query.customers.findFirst({ where: eq(schema.customers.id, invoice.customerId) }),
    db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, id)).orderBy(asc(schema.invoiceLines.sortOrder)),
    db.select().from(schema.payments).where(eq(schema.payments.invoiceId, id)).orderBy(desc(schema.payments.date)),
    db
      .select({ id: schema.creditApplications.id, date: schema.creditApplications.date, amount: schema.creditApplications.amount, creditNoteId: schema.creditNotes.id, creditNoteNumber: schema.creditNotes.number })
      .from(schema.creditApplications)
      .innerJoin(schema.creditNotes, eq(schema.creditNotes.id, schema.creditApplications.creditNoteId))
      .where(eq(schema.creditApplications.invoiceId, id))
      .orderBy(desc(schema.creditApplications.date)),
  ]);
  return { invoice, customer: customer!, lines, payments, credits };
}
