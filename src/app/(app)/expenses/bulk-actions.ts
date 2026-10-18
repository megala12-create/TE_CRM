"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { assertPermission, ForbiddenError } from "@/server/auth";
import { audit } from "@/server/audit";
import { getCompany } from "@/server/settings";
import { customerScope, expenseScope } from "@/server/scope";
import { deleteUpload } from "@/server/storage";
import { docTotals, lineRows } from "@/server/doc-lines";
import { PAYMENT_MODES } from "@/lib/invoice-status";
import { addDays } from "@/lib/format";
import { str, type ActionState } from "@/lib/utils";

/** "Manipulation" menu on the expenses list: apply one action to all ticked rows. */
export async function bulkExpenses(_prev: ActionState, form: FormData): Promise<ActionState> {
  const op = str(form, "op");
  const ids = [...new Set(form.getAll("ids").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 1000);
  if (ids.length === 0) return { message: "Tick at least one expense first." };
  const user = await assertPermission(op === "delete" ? "expenses.delete" : "expenses.edit");
  const rows = await db.select().from(schema.expenses).where(and(inArray(schema.expenses.id, ids), expenseScope(user)));
  if (rows.length !== ids.length) throw new ForbiddenError();
  const e = schema.expenses;

  switch (op) {
    case "delete":
      await db.delete(e).where(inArray(e.id, ids));
      for (const r of rows) await deleteUpload(r.receiptKey);
      break;
    case "category": {
      const categoryId = Number(str(form, "categoryId"));
      if (!(await db.query.expenseCategories.findFirst({ where: eq(schema.expenseCategories.id, categoryId) }))) return { message: "Choose a category." };
      await db.update(e).set({ categoryId, updatedAt: new Date() }).where(inArray(e.id, ids));
      break;
    }
    case "billable":
      if (rows.some((r) => !r.customerId)) return { message: "Only expenses with a customer can be billable." };
      await db.update(e).set({ billable: true, updatedAt: new Date() }).where(inArray(e.id, ids));
      break;
    case "not_billable":
      await db.update(e).set({ billable: false, updatedAt: new Date() }).where(and(inArray(e.id, ids), eq(e.invoiced, false)));
      break;
    case "payment_mode": {
      const mode = str(form, "paymentMode");
      if (!PAYMENT_MODES.some((m) => m.value === mode)) return { message: "Choose a payment mode." };
      await db.update(e).set({ paymentMode: mode, updatedAt: new Date() }).where(inArray(e.id, ids));
      break;
    }
    default:
      return { message: "Choose an action." };
  }
  await audit({ userId: user.id, action: `bulk_${op}`, entity: "expense", data: { ids } });
  revalidatePath("/expenses");
  return { ok: true, message: `${op === "delete" ? "Deleted" : "Updated"} ${ids.length} expense(s).` };
}

/** Bills a billable expense to its customer as a new draft invoice. */
export async function invoiceExpense(expenseId: number): Promise<ActionState> {
  const user = await assertPermission("invoices.create");
  await assertPermission("expenses.edit");
  const [exp] = await db.select().from(schema.expenses).where(and(eq(schema.expenses.id, expenseId), expenseScope(user))).limit(1);
  if (!exp) throw new ForbiddenError();
  if (!exp.customerId || !exp.billable) return { message: "Only billable expenses with a customer can be invoiced." };
  if (exp.invoiced) return { message: "This expense is already invoiced." };
  const [customer] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, exp.customerId), customerScope(user))).limit(1);
  if (!customer) throw new ForbiddenError();
  const category = await db.query.expenseCategories.findFirst({ where: eq(schema.expenseCategories.id, exp.categoryId) });
  const company = await getCompany();
  const placeOfSupply = customer.stateCode ?? company.stateCode;
  const taxRate = String(Number(exp.tax1Rate ?? 0) + Number(exp.tax2Rate ?? 0));
  const lines = [{ itemId: null, description: [category?.name, exp.name].filter(Boolean).join(" — "), hsnSac: null, qty: "1", unit: "nos", rate: exp.amount, taxRate }];
  const t = docTotals(lines, "0", placeOfSupply !== company.stateCode);
  if (!t.ok) return { message: "Could not compute totals." };
  const today = new Date().toISOString().slice(0, 10);

  const invoiceId = await db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(schema.invoices)
      .values({
        customerId: customer.id, status: "draft", date: today, dueDate: addDays(today, customer.paymentTermsDays), placeOfSupply,
        ...t.columns, notes: `Billable expense #${exp.id}`, terms: company.invoiceTerms, salesAgentId: user.id, createdBy: user.id, custom: {},
      })
      .returning({ id: schema.invoices.id });
    await tx.insert(schema.invoiceLines).values(lineRows(lines, t.totals).map((r) => ({ ...r, invoiceId: inv!.id })));
    await tx.update(schema.expenses).set({ invoiced: true, invoiceId: inv!.id, updatedAt: new Date() }).where(eq(schema.expenses.id, exp.id));
    await audit({ userId: user.id, action: "invoice", entity: "expense", entityId: exp.id, data: { invoiceId: inv!.id } }, tx);
    return inv!.id;
  });
  revalidatePath("/expenses");
  redirect(`/invoices/${invoiceId}/edit`);
}
