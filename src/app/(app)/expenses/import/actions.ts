"use server";

import { revalidatePath } from "next/cache";
import { and, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertPermission } from "@/server/auth";
import { audit } from "@/server/audit";
import { expenseScope } from "@/server/scope";
import { matchCategory, parseBankStatement, paymentModeFromNarration, suggestCategory } from "@/lib/bank-statement";
import { PAYMENT_MODES } from "@/lib/invoice-status";
import { fromPaise, toPaise } from "@/lib/money";

export type PreviewRow = {
  key: string;
  line: number;
  slNo: string;
  date: string;
  description: string;
  reference: string;
  amount: string;
  mode: string;
  categoryId: number | null;
  suggestedFrom: "file" | "history" | "keyword" | null;
  /** Category written in the file that matched no existing category ("" otherwise). */
  unknownCategory: string;
  duplicate: boolean;
};

export type PreviewState = {
  ok?: boolean;
  message?: string;
  fileName?: string;
  rows?: PreviewRow[];
  problems?: string[];
};

const MAX_ROWS = 5000;

/** Reads existing expenses in the statement's date range, keyed for duplicate detection. */
async function existingKeys(from: string, to: string) {
  const e = schema.expenses;
  const rows = await db
    .select({ date: e.date, total: e.total, reference: e.reference, name: e.name })
    .from(e)
    .where(and(gte(e.date, from), lte(e.date, to)));
  const byRef = new Set<string>();
  const byName = new Set<string>();
  for (const r of rows) {
    const p = toPaise(r.total);
    if (r.reference) byRef.add(`${r.date}|${p}|${r.reference.trim().toLowerCase()}`);
    byName.add(`${r.date}|${p}|${r.name.trim().toLowerCase()}`);
  }
  return (date: string, amount: string, reference: string, description: string) => {
    const p = toPaise(amount);
    return reference
      ? byRef.has(`${date}|${p}|${reference.trim().toLowerCase()}`)
      : byName.has(`${date}|${p}|${description.trim().toLowerCase()}`);
  };
}

/** Step 1: upload → preview of debit rows with suggested categories and duplicate flags. Nothing is saved. */
export async function previewBankStatement(_prev: PreviewState, form: FormData): Promise<PreviewState> {
  const user = await assertPermission("expenses.create");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose the bank statement CSV file." };
  if (file.size > 5 * 1024 * 1024) return { message: "File is larger than 5 MB." };
  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
    return { message: "Please upload a CSV file. In Excel: File → Save As → “CSV (Comma delimited)”." };
  }
  const parsed = parseBankStatement(await file.text());
  if (parsed.rows.length === 0) {
    return { message: parsed.errors[0] ?? "No rows found in this file.", problems: parsed.errors.slice(1, 26) };
  }
  if (parsed.rows.length > MAX_ROWS) return { message: `At most ${MAX_ROWS} rows per import — split the statement by month.` };

  const categories = await db.select({ id: schema.expenseCategories.id, name: schema.expenseCategories.name }).from(schema.expenseCategories);
  // Learn from history: the category last used for the same description
  const names = [...new Set(parsed.rows.map((r) => r.description.toLowerCase()))];
  const history = await db
    .selectDistinctOn([sql`lower(${schema.expenses.name})`], { name: sql<string>`lower(${schema.expenses.name})`, categoryId: schema.expenses.categoryId })
    .from(schema.expenses)
    .where(and(inArray(sql`lower(${schema.expenses.name})`, names), expenseScope(user)))
    .orderBy(sql`lower(${schema.expenses.name})`, sql`${schema.expenses.date} desc`);
  const dates = parsed.rows.map((r) => r.date).sort();
  const isDuplicate = await existingKeys(dates[0]!, dates[dates.length - 1]!);

  const rows: PreviewRow[] = parsed.rows.map((r, i) => {
    // The category written in the file wins; otherwise history, then keyword hints
    const fromFile = matchCategory(r.category, categories);
    const learned = fromFile ? null : (history.find((h) => h.name === r.description.toLowerCase())?.categoryId ?? null);
    const keyword = fromFile || learned ? null : suggestCategory(r.description, categories);
    return {
      key: `${i}`,
      line: r.line,
      slNo: r.slNo.slice(0, 20),
      date: r.date,
      description: r.description.slice(0, 200),
      reference: r.reference.slice(0, 60),
      amount: r.amount,
      mode: paymentModeFromNarration(r.description, r.reference),
      categoryId: fromFile ?? learned ?? keyword,
      suggestedFrom: fromFile ? "file" : learned ? "history" : keyword ? "keyword" : null,
      unknownCategory: r.category && !fromFile ? r.category.slice(0, 60) : "",
      duplicate: isDuplicate(r.date, r.amount, r.reference, r.description),
    };
  });
  const total = rows.reduce((s, r) => s + toPaise(r.amount), 0);
  return {
    ok: true,
    fileName: file.name,
    rows,
    problems: parsed.errors.slice(0, 25),
    message: `Found ${rows.length} row(s) totalling ₹${fromPaise(total)}.${parsed.errors.length ? ` ${parsed.errors.length} row(s) have problems and will be skipped.` : ""}`,
  };
}

const rowSchema = z.object({
  line: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(200),
  reference: z.string().trim().max(60),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  mode: z.string(),
  categoryId: z.number().int().positive(),
});

/** Step 2: import the rows the user kept, with the categories they chose. All or nothing. */
export async function importBankRows(_prev: PreviewState, form: FormData): Promise<PreviewState> {
  const user = await assertPermission("expenses.create");
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("rows") ?? "[]"));
  } catch {
    raw = [];
  }
  const parsed = z.array(rowSchema).max(MAX_ROWS).safeParse(raw);
  if (!parsed.success) return { message: "Some rows are incomplete. Make sure every ticked row has a category." };
  const rows = parsed.data;
  if (rows.length === 0) return { message: "Tick at least one row to import." };
  const fileName = String(form.get("fileName") ?? "statement.csv").slice(0, 120);

  const categoryIds = new Set((await db.select({ id: schema.expenseCategories.id }).from(schema.expenseCategories)).map((c) => c.id));
  const bad = rows.find((r) => !categoryIds.has(r.categoryId) || !PAYMENT_MODES.some((m) => m.value === r.mode) || Number(r.amount) <= 0);
  if (bad) return { message: `Line ${bad.line}: invalid category, payment mode or amount.` };

  const dates = rows.map((r) => r.date).sort();
  const isDuplicate = await existingKeys(dates[0]!, dates[dates.length - 1]!);
  const fresh = rows.filter((r) => !isDuplicate(r.date, r.amount, r.reference, r.description));
  const skipped = rows.length - fresh.length;
  if (fresh.length === 0) return { message: "All ticked rows were already imported earlier — nothing to add." };

  const total = fresh.reduce((s, r) => s + toPaise(r.amount), 0);
  await db.transaction(async (tx) => {
    for (let i = 0; i < fresh.length; i += 500) {
      await tx.insert(schema.expenses).values(
        fresh.slice(i, i + 500).map((r) => ({
          categoryId: r.categoryId, name: r.description, date: r.date, currency: "INR", amount: r.amount, taxAmount: "0", total: r.amount,
          paymentMode: r.mode, reference: r.reference || null, note: `Imported from ${fileName} (line ${r.line})`,
          createdBy: user.id, custom: {},
        })),
      );
    }
    await audit({ userId: user.id, action: "import", entity: "expense", data: { source: "expense_import", file: fileName, rows: fresh.length, skipped, total: fromPaise(total) } }, tx);
  });
  revalidatePath("/expenses");
  return {
    ok: true,
    message: `Imported ${fresh.length} expense(s) totalling ₹${fromPaise(total)}.${skipped ? ` ${skipped} duplicate(s) skipped.` : ""}`,
  };
}
