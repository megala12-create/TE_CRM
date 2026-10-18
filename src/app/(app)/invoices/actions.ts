"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema, type Tx } from "@/db";
import { assertPermission, ForbiddenError, type CurrentUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { getActiveFields } from "@/server/custom-fields";
import { assignDocNumber, getCompany } from "@/server/settings";
import { customerScope, invoiceScope } from "@/server/scope";
import { docTotals, lineRows, parseDocLines, parseTags } from "@/server/doc-lines";
import { parseCustomFields } from "@/lib/custom-fields";
import { nextOccurrence, REPEAT_OPTIONS } from "@/lib/recurrence";
import { fromPaise, toPaise } from "@/lib/money";
import { PAYMENT_MODES } from "@/lib/invoice-status";
import { todayISO } from "@/lib/format";
import { can } from "@/lib/permissions";
import { str, optStr, type ActionState } from "@/lib/utils";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

async function loadInvoiceFor(user: CurrentUser, id: number, tx: Tx | typeof db = db) {
  const rows = await tx
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.id, id), invoiceScope(user)))
    .limit(1);
  if (!rows[0]) throw new ForbiddenError();
  return rows[0];
}

export async function saveInvoice(invoiceId: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission(invoiceId ? "invoices.edit" : "invoices.create");
  const existing = invoiceId ? await loadInvoiceFor(user, invoiceId) : undefined;
  if (existing && existing.status !== "draft") return { message: "Only draft invoices can be edited. Cancel and re-issue, or use a credit note." };

  const errors: Record<string, string> = {};
  const customerId = Number(str(form, "customerId"));
  const date = str(form, "date");
  const dueDate = str(form, "dueDate");
  const repeatEvery = optStr(form, "repeatEvery");
  if (!isoDate.safeParse(date).success) errors.date = "Enter a valid date";
  if (!isoDate.safeParse(dueDate).success) errors.dueDate = "Enter a valid date";
  else if (dueDate < date) errors.dueDate = "Due date cannot be before the invoice date";
  if (repeatEvery && !REPEAT_OPTIONS.some((o) => o.value === repeatEvery)) errors.repeatEvery = "Choose how often it repeats";

  const customer = Number.isInteger(customerId)
    ? (await db.select().from(schema.customers).where(and(eq(schema.customers.id, customerId), customerScope(user))).limit(1))[0]
    : undefined;
  if (!customer) errors.customerId = "Choose a customer";

  const parsed = parseDocLines(form);
  if (!parsed.ok) Object.assign(errors, parsed.errors);
  const custom = parseCustomFields(await getActiveFields("invoices"), form, user, existing?.custom ?? {});
  if (!custom.ok) Object.assign(errors, custom.errors);
  if (Object.keys(errors).length || !parsed.ok || !customer || !custom.ok) {
    return { errors, message: "Please fix the highlighted fields." };
  }

  const company = await getCompany();
  const placeOfSupply = optStr(form, "placeOfSupply") ?? customer.stateCode ?? company.stateCode;
  const t = docTotals(parsed.lines, parsed.discount, placeOfSupply !== company.stateCode);
  if (!t.ok) return { errors: t.errors };

  const salesAgentRaw = Number(str(form, "salesAgentId")) || null;
  const values = {
    customerId: customer.id,
    date,
    dueDate,
    placeOfSupply,
    ...t.columns,
    notes: optStr(form, "notes"),
    terms: optStr(form, "terms"),
    salesAgentId: can(user, "invoices.view") ? salesAgentRaw : user.id,
    orderRef: optStr(form, "orderRef"),
    tags: parseTags(form),
    repeatEvery,
    nextRecurringDate: repeatEvery ? nextOccurrence(date, repeatEvery) : null,
    custom: custom.value,
    updatedAt: new Date(),
  };

  const id = await db.transaction(async (tx) => {
    let invId = invoiceId;
    if (invId) {
      await tx.update(schema.invoices).set(values).where(eq(schema.invoices.id, invId));
      await tx.delete(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invId));
    } else {
      const [row] = await tx.insert(schema.invoices).values({ ...values, createdBy: user.id }).returning({ id: schema.invoices.id });
      invId = row!.id;
    }
    await tx.insert(schema.invoiceLines).values(lineRows(parsed.lines, t.totals).map((r) => ({ ...r, invoiceId: invId! })));
    await audit({ userId: user.id, action: invoiceId ? "update" : "create", entity: "invoice", entityId: invId, data: { ...values, lines: parsed.lines } }, tx);
    if (form.get("intent") === "issue") await issueInTx(tx, user, invId!);
    return invId!;
  });
  revalidatePath("/invoices");
  redirect(`/invoices/${id}`);
}

async function issueInTx(tx: Tx, user: CurrentUser, id: number) {
  const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, id)).for("update");
  if (!inv || inv.status !== "draft") throw new Error("Only drafts can be issued");
  const number = await assignDocNumber(tx, "invoice", inv.date);
  await tx.update(schema.invoices).set({ status: "issued", number, issuedAt: new Date(), updatedAt: new Date() }).where(eq(schema.invoices.id, id));
  await audit({ userId: user.id, action: "issue", entity: "invoice", entityId: id, data: { number } }, tx);
}

export async function issueInvoice(invoiceId: number): Promise<ActionState> {
  const user = await assertPermission("invoices.edit", "invoices.create");
  await loadInvoiceFor(user, invoiceId);
  await db.transaction((tx) => issueInTx(tx, user, invoiceId));
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true, message: "Invoice issued." };
}

/** Records that the invoice was sent to the customer (by email, WhatsApp or by hand). */
export async function markInvoiceSent(invoiceId: number, sent: boolean): Promise<ActionState> {
  const user = await assertPermission("invoices.edit", "invoices.create");
  const inv = await loadInvoiceFor(user, invoiceId);
  if (inv.status !== "issued") return { message: "Issue the invoice before marking it as sent." };
  await db.update(schema.invoices).set({ sentAt: sent ? new Date() : null, updatedAt: new Date() }).where(eq(schema.invoices.id, invoiceId));
  await audit({ userId: user.id, action: "update", entity: "invoice", entityId: invoiceId, data: { sent } });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true, message: sent ? "Marked as sent." : "Marked as not sent." };
}

/** Starts, changes or stops the repeat schedule (allowed on issued invoices too). */
export async function setInvoiceRepeat(invoiceId: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("invoices.edit");
  const inv = await loadInvoiceFor(user, invoiceId);
  const repeatEvery = optStr(form, "repeatEvery");
  if (repeatEvery && !REPEAT_OPTIONS.some((o) => o.value === repeatEvery)) return { errors: { repeatEvery: "Choose how often it repeats" } };
  let next: string | null = null;
  if (repeatEvery) {
    next = nextOccurrence(inv.date, repeatEvery);
    while (next < todayISO()) next = nextOccurrence(next, repeatEvery); // never back-fill when (re)starting
  }
  await db.update(schema.invoices).set({ repeatEvery, nextRecurringDate: next, updatedAt: new Date() }).where(eq(schema.invoices.id, invoiceId));
  await audit({ userId: user.id, action: "update", entity: "invoice", entityId: invoiceId, data: { repeatEvery, nextRecurringDate: next } });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices/recurring");
  return { ok: true, message: repeatEvery ? "Repeat schedule saved." : "Recurring stopped." };
}

export async function cancelInvoice(invoiceId: number): Promise<ActionState> {
  const user = await assertPermission("invoices.delete");
  const inv = await loadInvoiceFor(user, invoiceId);
  if (inv.status !== "issued") return { message: "Only issued invoices can be cancelled." };
  if (toPaise(inv.amountPaid) > 0) return { message: "Delete the payments and credits on this invoice before cancelling it." };
  await db
    .update(schema.invoices)
    .set({ status: "cancelled", cancelledAt: new Date(), repeatEvery: null, nextRecurringDate: null, updatedAt: new Date() })
    .where(eq(schema.invoices.id, invoiceId));
  await audit({ userId: user.id, action: "cancel", entity: "invoice", entityId: invoiceId, data: { number: inv.number } });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true, message: "Invoice cancelled. The number stays reserved." };
}

export async function deleteDraftInvoice(invoiceId: number): Promise<ActionState> {
  const user = await assertPermission("invoices.delete");
  const inv = await loadInvoiceFor(user, invoiceId);
  if (inv.status !== "draft") return { message: "Issued invoices cannot be deleted — cancel them instead." };
  await db.delete(schema.invoices).where(eq(schema.invoices.id, invoiceId));
  await audit({ userId: user.id, action: "delete", entity: "invoice", entityId: invoiceId });
  revalidatePath("/invoices");
  redirect("/invoices");
}

/** Shared by single and batch payments: locks the invoice, checks the balance, records the payment. */
async function addPaymentInTx(
  tx: Tx,
  user: CurrentUser,
  invoiceId: number,
  p: { amount: string; date: string; mode: string; reference: string | null; note: string | null; custom: Record<string, unknown> },
) {
  const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).for("update");
  if (!inv || inv.status !== "issued") throw new Error("Payments can only be recorded on issued invoices.");
  const balance = toPaise(inv.total) - toPaise(inv.amountPaid);
  if (toPaise(p.amount) > balance) throw new Error(`${inv.number}: amount is more than the balance due (₹${fromPaise(balance)}).`);
  const [row] = await tx
    .insert(schema.payments)
    .values({ customerId: inv.customerId, invoiceId, date: p.date, amount: p.amount, mode: p.mode, reference: p.reference, note: p.note, custom: p.custom, createdBy: user.id })
    .returning({ id: schema.payments.id });
  await tx
    .update(schema.invoices)
    .set({ amountPaid: sql`${schema.invoices.amountPaid} + ${p.amount}::numeric`, updatedAt: new Date() })
    .where(eq(schema.invoices.id, invoiceId));
  await audit({ userId: user.id, action: "create", entity: "payment", entityId: row!.id, data: { invoiceId, ...p } }, tx);
}

export async function recordPayment(invoiceId: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("payments.create");
  await loadInvoiceFor(user, invoiceId);
  const errors: Record<string, string> = {};
  const amount = str(form, "amount");
  const date = str(form, "date");
  const mode = str(form, "mode");
  if (!/^\d+(\.\d{1,2})?$/.test(amount) || toPaise(amount) <= 0) errors.amount = "Enter an amount";
  if (!isoDate.safeParse(date).success) errors.date = "Enter a valid date";
  else if (date > todayISO()) errors.date = "Payment date cannot be in the future";
  if (!PAYMENT_MODES.some((m) => m.value === mode)) errors.mode = "Choose a payment mode";
  const custom = parseCustomFields(await getActiveFields("payments"), form, user);
  if (!custom.ok) Object.assign(errors, custom.errors);
  if (Object.keys(errors).length || !custom.ok) return { errors };

  try {
    await db.transaction((tx) =>
      addPaymentInTx(tx, user, invoiceId, { amount, date, mode, reference: optStr(form, "reference"), note: optStr(form, "note"), custom: custom.value }),
    );
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Could not record the payment." };
  }
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/payments");
  return { ok: true, message: "Payment recorded." };
}

/** Batch Payments: record many invoice payments at once. All or nothing. */
export async function recordBatchPayments(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("payments.create");
  const date = str(form, "date");
  const mode = str(form, "mode");
  const errors: Record<string, string> = {};
  if (!isoDate.safeParse(date).success) errors.date = "Enter a valid date";
  else if (date > todayISO()) errors.date = "Payment date cannot be in the future";
  if (!PAYMENT_MODES.some((m) => m.value === mode)) errors.mode = "Choose a payment mode";

  const rows: { invoiceId: number; amount: string; reference: string | null }[] = [];
  for (const [key, value] of form.entries()) {
    const m = /^amount_(\d+)$/.exec(key);
    const amount = String(value).trim();
    if (!m || amount === "") continue;
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || toPaise(amount) <= 0) {
      errors[key] = "Invalid amount";
      continue;
    }
    rows.push({ invoiceId: Number(m[1]), amount, reference: optStr(form, `reference_${m[1]}`) });
  }
  if (rows.length === 0 && !Object.keys(errors).length) return { message: "Enter an amount for at least one invoice." };
  if (Object.keys(errors).length) return { errors, message: "Please fix the highlighted fields." };

  // Every invoice must be visible to this user
  const visible = await db
    .select({ id: schema.invoices.id })
    .from(schema.invoices)
    .where(and(inArray(schema.invoices.id, rows.map((r) => r.invoiceId)), invoiceScope(user)));
  if (visible.length !== new Set(rows.map((r) => r.invoiceId)).size) throw new ForbiddenError();

  try {
    await db.transaction(async (tx) => {
      for (const r of rows) {
        await addPaymentInTx(tx, user, r.invoiceId, { amount: r.amount, date, mode, reference: r.reference, note: "Batch payment", custom: {} });
      }
    });
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Could not record the payments." };
  }
  revalidatePath("/invoices");
  revalidatePath("/payments");
  return { ok: true, message: `Recorded ${rows.length} payment(s) totalling ₹${fromPaise(rows.reduce((s, r) => s + toPaise(r.amount), 0))}.` };
}

export async function deletePayment(paymentId: number): Promise<ActionState> {
  const user = await assertPermission("payments.delete");
  const result = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.payments).where(eq(schema.payments.id, paymentId)).for("update");
    if (!p) return null;
    if (p.invoiceId) {
      await tx
        .update(schema.invoices)
        .set({ amountPaid: sql`greatest(${schema.invoices.amountPaid} - ${p.amount}::numeric, 0)`, updatedAt: new Date() })
        .where(eq(schema.invoices.id, p.invoiceId));
    }
    await tx.delete(schema.payments).where(eq(schema.payments.id, paymentId));
    await audit({ userId: user.id, action: "delete", entity: "payment", entityId: paymentId, data: p }, tx);
    return p;
  });
  if (!result) return { message: "Payment not found" };
  revalidatePath("/payments");
  if (result.invoiceId) revalidatePath(`/invoices/${result.invoiceId}`);
  return { ok: true, message: "Payment deleted." };
}
