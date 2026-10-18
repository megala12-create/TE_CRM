import "server-only";
import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { nextOccurrence } from "@/lib/recurrence";
import { addDays, todayISO } from "@/lib/format";
import { audit } from "./audit";

/**
 * Creates DRAFT copies of recurring invoices that have fallen due, so accounts can
 * review and issue them (issuing assigns the GST number). Idempotent: each parent
 * row is locked while its copies are created and its next date is advanced.
 */
export async function generateDueRecurringInvoices(): Promise<number> {
  const today = todayISO();
  const i = schema.invoices;
  const due = await db
    .select({ id: i.id })
    .from(i)
    .where(and(isNotNull(i.repeatEvery), isNotNull(i.nextRecurringDate), lte(i.nextRecurringDate, today)))
    .orderBy(asc(i.id))
    .limit(500);

  let created = 0;
  for (const { id } of due) {
    created += await db.transaction(async (tx) => {
      const [p] = await tx.select().from(i).where(eq(i.id, id)).for("update");
      if (!p?.repeatEvery || !p.nextRecurringDate || p.nextRecurringDate > today || p.status === "cancelled") return 0;
      const lines = await tx.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, p.id));
      const termDays = Math.max(0, Math.round((Date.parse(p.dueDate) - Date.parse(p.date)) / 864e5));
      let next = p.nextRecurringDate;
      let n = 0;
      while (next <= today && n < 60) {
        const [copy] = await tx
          .insert(i)
          .values({
            customerId: p.customerId, status: "draft", date: next, dueDate: addDays(next, termDays), placeOfSupply: p.placeOfSupply,
            isInterstate: p.isInterstate, subtotal: p.subtotal, discount: p.discount, cgst: p.cgst, sgst: p.sgst, igst: p.igst,
            roundOff: p.roundOff, total: p.total, notes: p.notes, terms: p.terms, salesAgentId: p.salesAgentId, orderRef: p.orderRef,
            tags: p.tags, custom: p.custom, recurringParentId: p.id, createdBy: p.createdBy,
          })
          .returning({ id: i.id });
        if (lines.length) {
          await tx.insert(schema.invoiceLines).values(lines.map(({ id: _id, invoiceId: _inv, ...l }) => ({ ...l, invoiceId: copy!.id })));
        }
        await audit({ userId: null, action: "create", entity: "invoice", entityId: copy!.id, data: { recurringFrom: p.id, date: next } }, tx);
        next = nextOccurrence(next, p.repeatEvery);
        n++;
      }
      await tx.update(i).set({ nextRecurringDate: next }).where(eq(i.id, p.id));
      return n;
    });
  }
  return created;
}
