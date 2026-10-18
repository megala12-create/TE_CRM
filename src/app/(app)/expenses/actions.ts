"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { assertPermission, ForbiddenError, type CurrentUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { getActiveFields } from "@/server/custom-fields";
import { customerScope, expenseScope } from "@/server/scope";
import { deleteUpload, saveUpload, type StoredFile } from "@/server/storage";
import { parseCustomFields } from "@/lib/custom-fields";
import { expenseTotals, nextOccurrence, parseTaxValue, REPEAT_OPTIONS } from "@/lib/expense";
import { PAYMENT_MODES } from "@/lib/invoice-status";
import { fromPaise, toPaise } from "@/lib/money";
import { todayISO } from "@/lib/format";
import { str, optStr, type ActionState } from "@/lib/utils";

async function loadExpenseFor(user: CurrentUser, id: number) {
  const [row] = await db.select().from(schema.expenses).where(and(eq(schema.expenses.id, id), expenseScope(user))).limit(1);
  if (!row) throw new ForbiddenError();
  return row;
}

export async function saveExpense(expenseId: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission(expenseId ? "expenses.edit" : "expenses.create");
  const existing = expenseId ? await loadExpenseFor(user, expenseId) : undefined;
  const errors: Record<string, string> = {};

  const name = str(form, "name");
  const categoryId = Number(str(form, "categoryId"));
  const date = str(form, "date");
  const amount = str(form, "amount");
  const paymentMode = optStr(form, "paymentMode");
  const vendorId = Number(str(form, "vendorId")) || null;
  const customerId = Number(str(form, "customerId")) || null;
  const tax1 = optStr(form, "tax1");
  const tax2 = tax1 ? optStr(form, "tax2") : null;
  const repeatEvery = optStr(form, "repeatEvery");

  if (!Number.isInteger(categoryId) || !(await db.query.expenseCategories.findFirst({ where: eq(schema.expenseCategories.id, categoryId) }))) {
    errors.categoryId = "Choose a category";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = "Enter a valid date";
  if (!/^\d+(\.\d{1,2})?$/.test(amount) || toPaise(amount) <= 0) errors.amount = "Enter an amount";
  if (paymentMode && !PAYMENT_MODES.some((m) => m.value === paymentMode)) errors.paymentMode = "Choose a payment mode";
  const t1 = tax1 ? parseTaxValue(tax1) : null;
  const t2 = tax2 ? parseTaxValue(tax2) : null;
  if (tax1 && !t1) errors.tax1 = "Choose a tax";
  if (tax2 && !t2) errors.tax2 = "Choose a tax";
  if (t1 && t2 && t1.name === t2.name) errors.tax2 = "Tax 2 must be different from Tax 1";
  if (repeatEvery && !REPEAT_OPTIONS.some((o) => o.value === repeatEvery)) errors.repeatEvery = "Choose how often it repeats";
  if (vendorId && !(await db.query.vendors.findFirst({ where: eq(schema.vendors.id, vendorId) }))) errors.vendorId = "Choose a valid vendor";
  if (customerId) {
    const [c] = await db.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.id, customerId), customerScope(user))).limit(1);
    if (!c) errors.customerId = "Choose a valid customer";
  }

  const custom = parseCustomFields(await getActiveFields("expenses"), form, user, existing?.custom ?? {});
  if (!custom.ok) Object.assign(errors, custom.errors);
  if (Object.keys(errors).length || !custom.ok) return { errors, message: "Please fix the highlighted fields." };

  // Receipt: upload only after everything else is valid, so failed saves leave no orphan files.
  let receipt: StoredFile | null | undefined; // undefined = unchanged, null = removed
  const file = form.get("receipt");
  if (file instanceof File && file.size > 0) {
    const saved = await saveUpload(file, "expense-receipts");
    if ("error" in saved) return { errors: { receipt: saved.error } };
    receipt = saved;
  } else if (form.get("removeReceipt") === "on") {
    receipt = null;
  }

  const totals = expenseTotals(amount, [t1?.rate ?? 0, t2?.rate ?? 0]);
  const repeatChanged = repeatEvery !== (existing?.repeatEvery ?? null) || date !== existing?.date;
  const values = {
    name: name || "",
    categoryId,
    date,
    currency: "INR",
    amount: fromPaise(totals.amountPaise),
    tax1Name: t1?.name ?? null,
    tax1Rate: t1 ? String(t1.rate) : null,
    tax2Name: t2?.name ?? null,
    tax2Rate: t2 ? String(t2.rate) : null,
    taxAmount: fromPaise(totals.taxPaise),
    total: fromPaise(totals.totalPaise),
    paymentMode,
    reference: optStr(form, "reference"),
    vendorId,
    customerId,
    billable: customerId ? form.get("billable") === "on" : false,
    note: optStr(form, "note"),
    project: optStr(form, "project"),
    repeatEvery,
    // Schedule the next copy after the expense date (or keep the existing schedule if unchanged)
    nextRecurringDate: !repeatEvery
      ? null
      : repeatChanged || !existing?.nextRecurringDate
        ? nextOccurrence(date, repeatEvery)
        : existing.nextRecurringDate,
    custom: custom.value,
    updatedAt: new Date(),
    ...(receipt !== undefined
      ? { receiptKey: receipt?.key ?? null, receiptName: receipt?.name ?? null, receiptType: receipt?.type ?? null, receiptSize: receipt?.size ?? null }
      : {}),
  };

  let id = expenseId;
  try {
    if (expenseId) {
      await db.update(schema.expenses).set(values).where(eq(schema.expenses.id, expenseId));
    } else {
      const [row] = await db.insert(schema.expenses).values({ ...values, createdBy: user.id }).returning({ id: schema.expenses.id });
      id = row!.id;
    }
  } catch (e) {
    if (receipt) await deleteUpload(receipt.key);
    throw e;
  }
  if (receipt !== undefined && existing?.receiptKey) await deleteUpload(existing.receiptKey);

  await audit({ userId: user.id, action: expenseId ? "update" : "create", entity: "expense", entityId: id, data: values });
  revalidatePath("/expenses");
  redirect(`/expenses?selected=${id}`);
}

export async function deleteExpense(expenseId: number): Promise<ActionState> {
  const user = await assertPermission("expenses.delete");
  const e = await loadExpenseFor(user, expenseId);
  await db.delete(schema.expenses).where(eq(schema.expenses.id, expenseId));
  await deleteUpload(e.receiptKey);
  await audit({ userId: user.id, action: "delete", entity: "expense", entityId: expenseId, data: e });
  revalidatePath("/expenses");
  redirect("/expenses");
}

/** Stops a recurring expense from creating further copies. */
export async function stopRecurring(expenseId: number): Promise<ActionState> {
  const user = await assertPermission("expenses.edit");
  await loadExpenseFor(user, expenseId);
  await db.update(schema.expenses).set({ repeatEvery: null, nextRecurringDate: null, updatedAt: new Date() }).where(eq(schema.expenses.id, expenseId));
  await audit({ userId: user.id, action: "update", entity: "expense", entityId: expenseId, data: { stopRecurring: true, on: todayISO() } });
  revalidatePath("/expenses");
  return { ok: true, message: "Recurring stopped." };
}
