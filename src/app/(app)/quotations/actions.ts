"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertPermission, ForbiddenError, type CurrentUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { getActiveFields } from "@/server/custom-fields";
import { assignDocNumber, getCompany } from "@/server/settings";
import { customerScope, quotationScope } from "@/server/scope";
import { docTotals, lineRows, parseDocLines, parseTags } from "@/server/doc-lines";
import { parseCustomFields } from "@/lib/custom-fields";
import { isQuotationStatus } from "@/lib/doc-status";
import { INDIAN_STATES } from "@/lib/gst";
import { addDays } from "@/lib/format";
import { can } from "@/lib/permissions";
import { str, optStr, type ActionState } from "@/lib/utils";
import { QUOTE_KINDS, type QuoteKind } from "@/lib/sales-kinds";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

async function loadQuotationFor(user: CurrentUser, kind: QuoteKind, id: number) {
  const [row] = await db.select().from(schema.quotations).where(and(eq(schema.quotations.id, id), quotationScope(user, kind))).limit(1);
  if (!row) throw new ForbiddenError();
  return row;
}

export async function saveQuotation(kind: QuoteKind, quotationId: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const K = QUOTE_KINDS[kind];
  const user = await assertPermission(quotationId ? K.perm.edit : K.perm.create);
  const existing = quotationId ? await loadQuotationFor(user, kind, quotationId) : undefined;
  if (existing?.invoiceId) return { message: `This ${K.label.toLowerCase()} has been converted to an invoice and can no longer be edited.` };

  const errors: Record<string, string> = {};
  const subject = str(form, "subject");
  const toName = str(form, "toName");
  const toEmail = optStr(form, "toEmail");
  const date = str(form, "date");
  const openTill = optStr(form, "openTill");
  const status = str(form, "status") || "draft";
  const customerId = Number(str(form, "customerId")) || null;
  let placeOfSupply = optStr(form, "placeOfSupply");

  if (!subject) errors.subject = "Subject is required";
  if (!toName) errors.toName = "Enter who the quotation is for";
  if (toEmail && !z.email().safeParse(toEmail).success) errors.toEmail = "Enter a valid email";
  if (!isoDate.test(date)) errors.date = "Enter a valid date";
  if (openTill && (!isoDate.test(openTill) || openTill < date)) errors.openTill = "Open till must be on or after the date";
  if (!isQuotationStatus(status)) errors.status = "Choose a status";
  if (placeOfSupply && !INDIAN_STATES.some((s) => s.code === placeOfSupply)) errors.placeOfSupply = "Choose a state";

  let customer: typeof schema.customers.$inferSelect | undefined;
  if (customerId) {
    [customer] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, customerId), customerScope(user))).limit(1);
    if (!customer) errors.customerId = "Choose a valid customer";
  } else if (K.requireCustomer) {
    errors.customerId = "Choose a customer";
  }

  const parsed = parseDocLines(form);
  if (!parsed.ok) Object.assign(errors, parsed.errors);
  const custom = parseCustomFields(await getActiveFields(K.entity), form, user, existing?.custom ?? {});
  if (!custom.ok) Object.assign(errors, custom.errors);
  if (Object.keys(errors).length || !parsed.ok || !custom.ok) return { errors, message: "Please fix the highlighted fields." };

  const company = await getCompany();
  placeOfSupply ??= customer?.stateCode ?? company.stateCode;
  const t = docTotals(parsed.lines, parsed.discount, placeOfSupply !== company.stateCode);
  if (!t.ok) return { errors: t.errors };

  const values = {
    subject,
    customerId,
    toName,
    toEmail,
    toPhone: optStr(form, "toPhone"),
    toAddress: optStr(form, "toAddress"),
    status,
    date,
    openTill,
    project: optStr(form, "project"),
    tags: parseTags(form),
    placeOfSupply,
    ...t.columns,
    notes: optStr(form, "notes"),
    terms: optStr(form, "terms"),
    salesAgentId: can(user, K.perm.view) ? Number(str(form, "salesAgentId")) || null : (existing?.salesAgentId ?? user.id),
    acceptedAt: status === "accepted" ? (existing?.acceptedAt ?? new Date()) : null,
    sentAt: status === "sent" && !existing?.sentAt ? new Date() : (existing?.sentAt ?? null),
    custom: custom.value,
    updatedAt: new Date(),
  };

  const id = await db.transaction(async (tx) => {
    let qid = quotationId;
    if (qid) {
      await tx.update(schema.quotations).set(values).where(eq(schema.quotations.id, qid));
      await tx.delete(schema.quotationLines).where(eq(schema.quotationLines.quotationId, qid));
    } else {
      const number = await assignDocNumber(tx, K.numberDoc, date);
      const [row] = await tx.insert(schema.quotations).values({ ...values, kind, number, createdBy: user.id }).returning({ id: schema.quotations.id });
      qid = row!.id;
    }
    await tx.insert(schema.quotationLines).values(lineRows(parsed.lines, t.totals).map((r) => ({ ...r, quotationId: qid! })));
    await audit({ userId: user.id, action: quotationId ? "update" : "create", entity: kind, entityId: qid, data: { ...values, lines: parsed.lines } }, tx);
    return qid!;
  });
  revalidatePath(K.base);
  redirect(`${K.base}/${id}`);
}

export async function setQuotationStatus(kind: QuoteKind, quotationId: number, status: string): Promise<ActionState> {
  const K = QUOTE_KINDS[kind];
  const user = await assertPermission(K.perm.edit);
  const q = await loadQuotationFor(user, kind, quotationId);
  if (!isQuotationStatus(status)) return { message: "Unknown status" };
  await db
    .update(schema.quotations)
    .set({
      status,
      acceptedAt: status === "accepted" ? (q.acceptedAt ?? new Date()) : null,
      sentAt: status === "sent" ? (q.sentAt ?? new Date()) : q.sentAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.quotations.id, quotationId));
  await audit({ userId: user.id, action: "update", entity: kind, entityId: quotationId, data: { status } });
  revalidatePath(`${K.base}/${quotationId}`);
  revalidatePath(K.base);
  return { ok: true, message: `Marked as ${status}.` };
}

export async function setQuotationStatusFromForm(kind: QuoteKind, quotationId: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  const status = str(form, "status");
  const res = await setQuotationStatus(kind, quotationId, status);
  return res.ok ? { ok: true, message: `Status changed to ${status}.` } : res;
}

export async function deleteQuotation(kind: QuoteKind, quotationId: number): Promise<ActionState> {
  const K = QUOTE_KINDS[kind];
  const user = await assertPermission(K.perm.delete);
  const q = await loadQuotationFor(user, kind, quotationId);
  if (q.invoiceId) return { message: "Converted documents cannot be deleted." };
  await db.delete(schema.quotations).where(eq(schema.quotations.id, quotationId));
  await audit({ userId: user.id, action: "delete", entity: kind, entityId: quotationId, data: { number: q.number } });
  revalidatePath(K.base);
  redirect(K.base);
}

/** Creates a DRAFT invoice from the quotation (lines, totals, tags) and marks the quotation accepted. */
export async function convertQuotationToInvoice(kind: QuoteKind, quotationId: number): Promise<ActionState> {
  const K = QUOTE_KINDS[kind];
  const user = await assertPermission("invoices.create");
  await assertPermission(K.perm.edit);
  const q = await loadQuotationFor(user, kind, quotationId);
  if (q.invoiceId) redirect(`/invoices/${q.invoiceId}`);
  if (!q.customerId) return { message: "Link this quotation to a customer first (Edit → Customer). Prospects must become customers before invoicing." };
  const customer = await db.query.customers.findFirst({ where: eq(schema.customers.id, q.customerId) });
  if (!customer) return { message: "Customer not found." };
  const lines = await db.select().from(schema.quotationLines).where(eq(schema.quotationLines.quotationId, q.id)).orderBy(asc(schema.quotationLines.sortOrder));
  const company = await getCompany();
  const today = new Date().toISOString().slice(0, 10);

  const invoiceId = await db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(schema.invoices)
      .values({
        customerId: q.customerId!, status: "draft", date: today, dueDate: addDays(today, customer.paymentTermsDays),
        placeOfSupply: q.placeOfSupply, isInterstate: q.isInterstate, subtotal: q.subtotal, discount: q.discount, cgst: q.cgst,
        sgst: q.sgst, igst: q.igst, roundOff: q.roundOff, total: q.total, notes: q.notes, terms: company.invoiceTerms,
        salesAgentId: q.salesAgentId, tags: q.tags, orderRef: kind === "proforma" ? q.number : null, createdBy: user.id, custom: {},
      })
      .returning({ id: schema.invoices.id });
    if (lines.length) {
      await tx.insert(schema.invoiceLines).values(lines.map(({ id: _id, quotationId: _q, ...l }) => ({ ...l, invoiceId: inv!.id })));
    }
    await tx
      .update(schema.quotations)
      .set({ invoiceId: inv!.id, status: "accepted", acceptedAt: q.acceptedAt ?? new Date(), updatedAt: new Date() })
      .where(eq(schema.quotations.id, q.id));
    await audit({ userId: user.id, action: "convert", entity: kind, entityId: q.id, data: { invoiceId: inv!.id } }, tx);
    return inv!.id;
  });
  revalidatePath(K.base);
  revalidatePath("/invoices");
  redirect(`/invoices/${invoiceId}/edit`);
}
