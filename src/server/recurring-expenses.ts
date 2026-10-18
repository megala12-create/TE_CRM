import "server-only";
import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { nextOccurrence } from "@/lib/expense";
import { todayISO } from "@/lib/format";
import { audit } from "./audit";

/**
 * Creates the copies of recurring expenses that have fallen due (catching up on
 * any missed periods). Idempotent and safe to run concurrently: each parent row
 * is locked while its copies are created and its next date is advanced.
 */
export async function generateDueRecurringExpenses(): Promise<number> {
  const today = todayISO();
  const e = schema.expenses;
  const due = await db
    .select({ id: e.id })
    .from(e)
    .where(and(isNotNull(e.repeatEvery), isNotNull(e.nextRecurringDate), lte(e.nextRecurringDate, today)))
    .orderBy(asc(e.id))
    .limit(500);

  let created = 0;
  for (const { id } of due) {
    created += await db.transaction(async (tx) => {
      const [p] = await tx.select().from(e).where(eq(e.id, id)).for("update");
      if (!p?.repeatEvery || !p.nextRecurringDate || p.nextRecurringDate > today) return 0;
      let next = p.nextRecurringDate;
      let n = 0;
      while (next <= today && n < 120) {
        const [copy] = await tx
          .insert(e)
          .values({
            categoryId: p.categoryId, name: p.name, vendorId: p.vendorId, date: next, currency: p.currency, amount: p.amount,
            tax1Name: p.tax1Name, tax1Rate: p.tax1Rate, tax2Name: p.tax2Name, tax2Rate: p.tax2Rate, taxAmount: p.taxAmount,
            total: p.total, paymentMode: p.paymentMode, reference: null, customerId: p.customerId, billable: p.billable,
            note: p.note, custom: p.custom, recurringParentId: p.id, createdBy: p.createdBy,
          })
          .returning({ id: e.id });
        await audit({ userId: null, action: "create", entity: "expense", entityId: copy!.id, data: { recurringFrom: p.id, date: next } }, tx);
        next = nextOccurrence(next, p.repeatEvery);
        n++;
      }
      await tx.update(e).set({ nextRecurringDate: next }).where(eq(e.id, p.id));
      return n;
    });
  }
  return created;
}
