import "server-only";
import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { toPaise } from "@/lib/money";

export type StatementLine = {
  date: string;
  kind: "invoice" | "payment" | "credit";
  ref: string;
  link: string;
  detail: string;
  debit: number; // paise
  credit: number; // paise
  balance: number; // paise
};

/** Account statement for a customer: opening balance + issued invoices and payments in the period. */
export async function customerStatement(customerId: number, from: string, to: string) {
  const inv = schema.invoices;
  const pay = schema.payments;
  const ca = schema.creditApplications;
  const cn = schema.creditNotes;
  const [[openInv], [openPay], [openCredit], invoices, payments, credits] = await Promise.all([
    db.select({ s: sql<string>`coalesce(sum(${inv.total}), 0)` }).from(inv)
      .where(and(eq(inv.customerId, customerId), eq(inv.status, "issued"), lt(inv.date, from))),
    db.select({ s: sql<string>`coalesce(sum(${pay.amount}), 0)` }).from(pay)
      .where(and(eq(pay.customerId, customerId), lt(pay.date, from))),
    db.select({ s: sql<string>`coalesce(sum(${ca.amount}), 0)` }).from(ca).innerJoin(cn, eq(cn.id, ca.creditNoteId))
      .where(and(eq(cn.customerId, customerId), lt(ca.date, from))),
    db.select({ id: inv.id, number: inv.number, date: inv.date, dueDate: inv.dueDate, total: inv.total }).from(inv)
      .where(and(eq(inv.customerId, customerId), eq(inv.status, "issued"), gte(inv.date, from), lte(inv.date, to)))
      .orderBy(asc(inv.date), asc(inv.id)),
    db.select({ id: pay.id, date: pay.date, amount: pay.amount, invoiceId: pay.invoiceId, number: inv.number, mode: pay.mode }).from(pay)
      .leftJoin(inv, eq(inv.id, pay.invoiceId))
      .where(and(eq(pay.customerId, customerId), gte(pay.date, from), lte(pay.date, to)))
      .orderBy(asc(pay.date), asc(pay.id)),
    db.select({ id: ca.id, date: ca.date, amount: ca.amount, invoiceId: ca.invoiceId, cnId: cn.id, cnNumber: cn.number, number: inv.number }).from(ca)
      .innerJoin(cn, eq(cn.id, ca.creditNoteId))
      .innerJoin(inv, eq(inv.id, ca.invoiceId))
      .where(and(eq(cn.customerId, customerId), gte(ca.date, from), lte(ca.date, to)))
      .orderBy(asc(ca.date), asc(ca.id)),
  ]);

  const opening = toPaise(openInv?.s) - toPaise(openPay?.s) - toPaise(openCredit?.s);
  const events = [
    ...invoices.map((i) => ({
      date: i.date, kind: "invoice" as const, ref: i.number ?? "", link: `/invoices/${i.id}`,
      detail: `Invoice ${i.number} — due ${i.dueDate}`, debit: toPaise(i.total), credit: 0, order: 0,
    })),
    ...payments.map((p) => ({
      date: p.date, kind: "payment" as const, ref: `#${p.id}`, link: p.invoiceId ? `/invoices/${p.invoiceId}` : "#",
      detail: `Payment #${p.id}${p.number ? ` to ${p.number}` : ""}`, debit: 0, credit: toPaise(p.amount), order: 1,
    })),
    ...credits.map((c) => ({
      date: c.date, kind: "credit" as const, ref: c.cnNumber, link: `/credit-notes/${c.cnId}`,
      detail: `Credit note ${c.cnNumber} applied to ${c.number}`, debit: 0, credit: toPaise(c.amount), order: 2,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  let running = opening;
  const lines: StatementLine[] = events.map(({ order: _o, ...e }) => {
    running += e.debit - e.credit;
    return { ...e, balance: running };
  });
  const invoiced = lines.reduce((s, l) => s + l.debit, 0);
  const paid = lines.reduce((s, l) => s + l.credit, 0);
  return { opening, invoiced, paid, closing: opening + invoiced - paid, lines };
}
