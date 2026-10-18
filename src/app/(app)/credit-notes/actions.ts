"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { assertPermission, ForbiddenError, type CurrentUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { getActiveFields } from "@/server/custom-fields";
import { assignDocNumber, getCompany } from "@/server/settings";
import { customerScope, invoiceScope } from "@/server/scope";
import { docTotals, lineRows, parseDocLines } from "@/server/doc-lines";
import { parseCustomFields } from "@/lib/custom-fields";
import { INDIAN_STATES } from "@/lib/gst";
import { PAYMENT_MODES } from "@/lib/invoice-status";
import { fromPaise, toPaise } from "@/lib/money";
import { todayISO } from "@/lib/format";
import { str, optStr, type ActionState } from "@/lib/utils";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Credit notes are visible when the user can see the customer (customer scope). */
async function loadCreditNoteFor(user: CurrentUser, id: number, tx: Tx | typeof db = db) {
  const [row] = await tx
    .select({ cn: schema.creditNotes })
    .from(schema.creditNotes)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.creditNotes.customerId))
    .where(and(eq(schema.creditNotes.id, id), customerScope(user)))
    .limit(1);
  if (!row) throw new ForbiddenError();
  return row.cn;
}

function remainingPaise(cn: { total: string; amountApplied: string; amountRefunded: string }) {
  return toPaise(cn.total) - toPaise(cn.amountApplied) - toPaise(cn.amountRefunded);
}

/** Open while credit remains, closed when fully used. Void stays void. */
async function refreshStatus(tx: Tx, id: number) {
  const [cn] = await tx.select().from(schema.creditNotes).where(eq(schema.creditNotes.id, id));
  if (!cn || cn.status === "void") return;
  const status = remainingPaise(cn) <= 0 ? "closed" : "open";
  if (status !== cn.status) await tx.update(schema.creditNotes).set({ status, updatedAt: new Date() }).where(eq(schema.creditNotes.id, id));
}

export async function saveCreditNote(creditNoteId: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission(creditNoteId ? "credit_notes.edit" : "credit_notes.create");
  const existing = creditNoteId ? await loadCreditNoteFor(user, creditNoteId) : undefined;
  if (existing && (toPaise(existing.amountApplied) > 0 || toPaise(existing.amountRefunded) > 0 || existing.status === "void")) {
    return { message: "This credit note has been used (applied, refunded or voided) and can no longer be edited." };
  }

  const errors: Record<string, string> = {};
  const customerId = Number(str(form, "customerId"));
  const date = str(form, "date");
  const invoiceId = Number(str(form, "invoiceId")) || null;
  let placeOfSupply = optStr(form, "placeOfSupply");
  if (!isoDate.test(date)) errors.date = "Enter a valid date";
  if (placeOfSupply && !INDIAN_STATES.some((s) => s.code === placeOfSupply)) errors.placeOfSupply = "Choose a state";

  const [customer] = Number.isInteger(customerId)
    ? await db.select().from(schema.customers).where(and(eq(schema.customers.id, customerId), customerScope(user))).limit(1)
    : [];
  if (!customer) errors.customerId = "Choose a customer";

  let invoiceNumber: string | null = null;
  if (invoiceId && customer) {
    const [inv] = await db
      .select({ number: schema.invoices.number, customerId: schema.invoices.customerId })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.id, invoiceId), invoiceScope(user)))
      .limit(1);
    if (!inv || inv.customerId !== customer.id) errors.invoiceId = "Choose an invoice of this customer";
    invoiceNumber = inv?.number ?? null;
  }

  const parsed = parseDocLines(form);
  if (!parsed.ok) Object.assign(errors, parsed.errors);
  const custom = parseCustomFields(await getActiveFields("credit_notes"), form, user, existing?.custom ?? {});
  if (!custom.ok) Object.assign(errors, custom.errors);
  if (Object.keys(errors).length || !parsed.ok || !custom.ok || !customer) return { errors, message: "Please fix the highlighted fields." };

  const company = await getCompany();
  placeOfSupply ??= customer.stateCode ?? company.stateCode;
  const t = docTotals(parsed.lines, parsed.discount, placeOfSupply !== company.stateCode);
  if (!t.ok) return { errors: t.errors };

  const values = {
    customerId: customer.id,
    date,
    invoiceId,
    reference: optStr(form, "reference") ?? invoiceNumber,
    project: optStr(form, "project"),
    placeOfSupply,
    ...t.columns,
    notes: optStr(form, "notes"),
    terms: optStr(form, "terms"),
    custom: custom.value,
    updatedAt: new Date(),
  };
  const id = await db.transaction(async (tx) => {
    let cid = creditNoteId;
    if (cid) {
      await tx.update(schema.creditNotes).set(values).where(eq(schema.creditNotes.id, cid));
      await tx.delete(schema.creditNoteLines).where(eq(schema.creditNoteLines.creditNoteId, cid));
    } else {
      const number = await assignDocNumber(tx, "credit_note", date);
      const [row] = await tx.insert(schema.creditNotes).values({ ...values, number, createdBy: user.id }).returning({ id: schema.creditNotes.id });
      cid = row!.id;
    }
    await tx.insert(schema.creditNoteLines).values(lineRows(parsed.lines, t.totals).map((r) => ({ ...r, creditNoteId: cid! })));
    await refreshStatus(tx, cid!);
    await audit({ userId: user.id, action: creditNoteId ? "update" : "create", entity: "credit_note", entityId: cid, data: { ...values, lines: parsed.lines } }, tx);
    return cid!;
  });
  revalidatePath("/credit-notes");
  redirect(`/credit-notes/${id}`);
}

/** Uses part of the credit to settle an issued invoice of the same customer. */
export async function applyCredit(creditNoteId: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("credit_notes.edit");
  await loadCreditNoteFor(user, creditNoteId);
  const invoiceId = Number(str(form, "invoiceId"));
  const amount = str(form, "amount");
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) return { errors: { invoiceId: "Choose an invoice" } };
  if (!/^\d+(\.\d{1,2})?$/.test(amount) || toPaise(amount) <= 0) return { errors: { amount: "Enter an amount" } };
  const [visible] = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(and(eq(schema.invoices.id, invoiceId), invoiceScope(user))).limit(1);
  if (!visible) throw new ForbiddenError();

  try {
    await db.transaction(async (tx) => {
      const [cn] = await tx.select().from(schema.creditNotes).where(eq(schema.creditNotes.id, creditNoteId)).for("update");
      const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).for("update");
      if (!cn || cn.status === "void") throw new Error("This credit note is void.");
      if (!inv || inv.status !== "issued") throw new Error("Credits can only be applied to issued invoices.");
      if (inv.customerId !== cn.customerId) throw new Error("The invoice belongs to a different customer.");
      const p = toPaise(amount);
      if (p > remainingPaise(cn)) throw new Error(`Only ₹${fromPaise(remainingPaise(cn))} credit is remaining.`);
      if (p > toPaise(inv.total) - toPaise(inv.amountPaid)) throw new Error(`Amount is more than the invoice balance (₹${fromPaise(toPaise(inv.total) - toPaise(inv.amountPaid))}).`);
      await tx.insert(schema.creditApplications).values({ creditNoteId, invoiceId, date: todayISO(), amount, createdBy: user.id });
      await tx.update(schema.creditNotes).set({ amountApplied: sql`${schema.creditNotes.amountApplied} + ${amount}::numeric`, updatedAt: new Date() }).where(eq(schema.creditNotes.id, creditNoteId));
      await tx.update(schema.invoices).set({ amountPaid: sql`${schema.invoices.amountPaid} + ${amount}::numeric`, updatedAt: new Date() }).where(eq(schema.invoices.id, invoiceId));
      await refreshStatus(tx, creditNoteId);
      await audit({ userId: user.id, action: "apply", entity: "credit_note", entityId: creditNoteId, data: { invoiceId, amount } }, tx);
    });
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Could not apply the credit." };
  }
  revalidatePath(`/credit-notes/${creditNoteId}`);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/credit-notes");
  return { ok: true, message: "Credit applied to the invoice." };
}

export async function removeCreditApplication(creditNoteId: number, applicationId: number): Promise<ActionState> {
  const user = await assertPermission("credit_notes.edit");
  await loadCreditNoteFor(user, creditNoteId);
  const removed = await db.transaction(async (tx) => {
    const [a] = await tx
      .select()
      .from(schema.creditApplications)
      .where(and(eq(schema.creditApplications.id, applicationId), eq(schema.creditApplications.creditNoteId, creditNoteId)))
      .for("update");
    if (!a) return null;
    await tx.delete(schema.creditApplications).where(eq(schema.creditApplications.id, a.id));
    await tx.update(schema.creditNotes).set({ amountApplied: sql`greatest(${schema.creditNotes.amountApplied} - ${a.amount}::numeric, 0)`, updatedAt: new Date() }).where(eq(schema.creditNotes.id, creditNoteId));
    await tx.update(schema.invoices).set({ amountPaid: sql`greatest(${schema.invoices.amountPaid} - ${a.amount}::numeric, 0)`, updatedAt: new Date() }).where(eq(schema.invoices.id, a.invoiceId));
    await refreshStatus(tx, creditNoteId);
    await audit({ userId: user.id, action: "unapply", entity: "credit_note", entityId: creditNoteId, data: a }, tx);
    return a;
  });
  if (!removed) return { message: "Not found" };
  revalidatePath(`/credit-notes/${creditNoteId}`);
  revalidatePath(`/invoices/${removed.invoiceId}`);
  return { ok: true, message: "Credit removed from the invoice." };
}

export async function recordRefund(creditNoteId: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("credit_notes.edit");
  await loadCreditNoteFor(user, creditNoteId);
  const amount = str(form, "amount");
  const date = str(form, "date");
  const mode = str(form, "mode");
  const errors: Record<string, string> = {};
  if (!/^\d+(\.\d{1,2})?$/.test(amount) || toPaise(amount) <= 0) errors.amount = "Enter an amount";
  if (!isoDate.test(date) || date > todayISO()) errors.date = "Enter a valid date (not in the future)";
  if (!PAYMENT_MODES.some((m) => m.value === mode)) errors.mode = "Choose a mode";
  if (Object.keys(errors).length) return { errors };
  try {
    await db.transaction(async (tx) => {
      const [cn] = await tx.select().from(schema.creditNotes).where(eq(schema.creditNotes.id, creditNoteId)).for("update");
      if (!cn || cn.status === "void") throw new Error("This credit note is void.");
      if (toPaise(amount) > remainingPaise(cn)) throw new Error(`Only ₹${fromPaise(remainingPaise(cn))} credit is remaining.`);
      await tx.insert(schema.creditRefunds).values({ creditNoteId, date, amount, mode, reference: optStr(form, "reference"), note: optStr(form, "note"), createdBy: user.id });
      await tx.update(schema.creditNotes).set({ amountRefunded: sql`${schema.creditNotes.amountRefunded} + ${amount}::numeric`, updatedAt: new Date() }).where(eq(schema.creditNotes.id, creditNoteId));
      await refreshStatus(tx, creditNoteId);
      await audit({ userId: user.id, action: "refund", entity: "credit_note", entityId: creditNoteId, data: { amount, date, mode } }, tx);
    });
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Could not record the refund." };
  }
  revalidatePath(`/credit-notes/${creditNoteId}`);
  revalidatePath("/credit-notes");
  return { ok: true, message: "Refund recorded." };
}

export async function deleteRefund(creditNoteId: number, refundId: number): Promise<ActionState> {
  const user = await assertPermission("credit_notes.edit");
  await loadCreditNoteFor(user, creditNoteId);
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(schema.creditRefunds).where(and(eq(schema.creditRefunds.id, refundId), eq(schema.creditRefunds.creditNoteId, creditNoteId))).for("update");
    if (!r) return;
    await tx.delete(schema.creditRefunds).where(eq(schema.creditRefunds.id, r.id));
    await tx.update(schema.creditNotes).set({ amountRefunded: sql`greatest(${schema.creditNotes.amountRefunded} - ${r.amount}::numeric, 0)`, updatedAt: new Date() }).where(eq(schema.creditNotes.id, creditNoteId));
    await refreshStatus(tx, creditNoteId);
    await audit({ userId: user.id, action: "delete_refund", entity: "credit_note", entityId: creditNoteId, data: r }, tx);
  });
  revalidatePath(`/credit-notes/${creditNoteId}`);
  return { ok: true, message: "Refund deleted." };
}

export async function voidCreditNote(creditNoteId: number, makeVoid: boolean): Promise<ActionState> {
  const user = await assertPermission("credit_notes.delete");
  const cn = await loadCreditNoteFor(user, creditNoteId);
  if (makeVoid && (toPaise(cn.amountApplied) > 0 || toPaise(cn.amountRefunded) > 0)) {
    return { message: "Remove the applied credits and refunds before voiding." };
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.creditNotes).set({ status: makeVoid ? "void" : "open", updatedAt: new Date() }).where(eq(schema.creditNotes.id, creditNoteId));
    if (!makeVoid) await refreshStatus(tx, creditNoteId);
    await audit({ userId: user.id, action: makeVoid ? "void" : "unvoid", entity: "credit_note", entityId: creditNoteId }, tx);
  });
  revalidatePath(`/credit-notes/${creditNoteId}`);
  revalidatePath("/credit-notes");
  return { ok: true, message: makeVoid ? "Credit note voided." : "Credit note re-opened." };
}

export async function deleteCreditNote(creditNoteId: number): Promise<ActionState> {
  const user = await assertPermission("credit_notes.delete");
  const cn = await loadCreditNoteFor(user, creditNoteId);
  if (toPaise(cn.amountApplied) > 0 || toPaise(cn.amountRefunded) > 0) return { message: "Remove applied credits and refunds first, or void it instead." };
  await db.delete(schema.creditNotes).where(eq(schema.creditNotes.id, creditNoteId));
  await audit({ userId: user.id, action: "delete", entity: "credit_note", entityId: creditNoteId, data: { number: cn.number } });
  revalidatePath("/credit-notes");
  redirect("/credit-notes");
}
