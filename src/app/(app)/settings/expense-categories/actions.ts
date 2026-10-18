"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { assertPermission } from "@/server/auth";
import { audit } from "@/server/audit";
import { optStr, str, type ActionState } from "@/lib/utils";

const c = schema.expenseCategories;

function refresh() {
  revalidatePath("/settings/expense-categories");
  revalidatePath("/expenses", "layout");
  revalidatePath("/reports/expenses");
}

async function nameTaken(name: string, exceptId?: number) {
  const row = await db.query.expenseCategories.findFirst({
    where: exceptId ? and(eq(sql`lower(${c.name})`, name.toLowerCase()), ne(c.id, exceptId)) : eq(sql`lower(${c.name})`, name.toLowerCase()),
  });
  return row;
}

/** Create or rename a category in the master list. */
export async function saveExpenseCategory(categoryId: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission(categoryId ? "expense_categories.edit" : "expense_categories.create");
  const name = str(form, "name").replace(/\s+/g, " ").slice(0, 80);
  if (!name) return { errors: { name: "Enter a name" } };
  if (await nameTaken(name, categoryId ?? undefined)) return { errors: { name: "A category with this name already exists" } };
  const values = { name, description: optStr(form, "description"), active: form.get("active") === "on", updatedAt: new Date() };
  if (categoryId) {
    const before = await db.query.expenseCategories.findFirst({ where: eq(c.id, categoryId) });
    if (!before) return { message: "Category not found" };
    await db.update(c).set(values).where(eq(c.id, categoryId));
    await audit({ userId: user.id, action: "update", entity: "expense_category", entityId: categoryId, data: { before, after: values } });
  } else {
    const [row] = await db.insert(c).values(values).returning({ id: c.id });
    await audit({ userId: user.id, action: "create", entity: "expense_category", entityId: row!.id, data: values });
  }
  refresh();
  redirect("/settings/expense-categories");
}

export async function toggleExpenseCategory(categoryId: number): Promise<ActionState> {
  const user = await assertPermission("expense_categories.edit");
  const [row] = await db.update(c).set({ active: sql`not ${c.active}`, updatedAt: new Date() }).where(eq(c.id, categoryId)).returning();
  if (!row) return { message: "Category not found" };
  await audit({ userId: user.id, action: "update", entity: "expense_category", entityId: categoryId, data: { active: row.active } });
  refresh();
  return { ok: true, message: `${row.name} is now ${row.active ? "active" : "hidden"}.` };
}

/** Deletes a category that no expense uses. Used categories must be hidden or merged instead. */
export async function deleteExpenseCategory(categoryId: number): Promise<ActionState> {
  const user = await assertPermission("expense_categories.delete");
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.expenses).where(eq(schema.expenses.categoryId, categoryId))) as [{ n: number }];
  if (n > 0) return { message: `This category is used by ${n} expense(s). Merge it into another category or hide it instead.` };
  const [row] = await db.delete(c).where(eq(c.id, categoryId)).returning();
  if (!row) return { message: "Category not found" };
  await audit({ userId: user.id, action: "delete", entity: "expense_category", entityId: categoryId, data: row });
  refresh();
  redirect("/settings/expense-categories");
}

/** Moves every expense of one category into another, then deletes the empty category. */
export async function mergeExpenseCategory(categoryId: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("expense_categories.edit");
  await assertPermission("expense_categories.delete");
  const targetId = Number(str(form, "targetId"));
  if (!Number.isInteger(targetId) || targetId === categoryId) return { errors: { targetId: "Choose a different category to merge into" } };
  const [source, target] = await Promise.all([
    db.query.expenseCategories.findFirst({ where: eq(c.id, categoryId) }),
    db.query.expenseCategories.findFirst({ where: eq(c.id, targetId) }),
  ]);
  if (!source || !target) return { message: "Category not found" };
  const moved = await db.transaction(async (tx) => {
    const rows = await tx.update(schema.expenses).set({ categoryId: targetId, updatedAt: new Date() }).where(eq(schema.expenses.categoryId, categoryId)).returning({ id: schema.expenses.id });
    await tx.delete(c).where(eq(c.id, categoryId));
    await audit({ userId: user.id, action: "merge", entity: "expense_category", entityId: categoryId, data: { from: source.name, into: target.name, expenses: rows.length } }, tx);
    return rows.length;
  });
  refresh();
  redirect(`/settings/expense-categories?merged=${encodeURIComponent(`${source.name} → ${target.name} (${moved})`)}`);
}

/** "+" next to any category dropdown: creates the category (or returns the existing one with that name). */
export async function quickAddExpenseCategory(name: string): Promise<{ id: number; name: string } | { error: string }> {
  const user = await assertPermission("expense_categories.create");
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return { error: "Enter a category name" };
  const existing = await nameTaken(clean);
  if (existing) {
    if (!existing.active) await db.update(c).set({ active: true, updatedAt: new Date() }).where(eq(c.id, existing.id));
    return { id: existing.id, name: existing.name };
  }
  const [row] = await db.insert(c).values({ name: clean }).returning();
  await audit({ userId: user.id, action: "create", entity: "expense_category", entityId: row!.id, data: { name: clean, via: "quick add" } });
  refresh();
  return { id: row!.id, name: row!.name };
}
