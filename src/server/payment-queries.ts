import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export function paymentRowsQuery() {
  const p = schema.payments;
  return db
    .select({
      id: p.id,
      date: p.date,
      amount: p.amount,
      mode: p.mode,
      reference: p.reference,
      invoiceId: p.invoiceId,
      invoiceNumber: schema.invoices.number,
      customerId: p.customerId,
      customerName: schema.customers.company,
      totalRows: sql<number>`count(*) over()::int`,
    })
    .from(p)
    .innerJoin(schema.customers, eq(schema.customers.id, p.customerId))
    .leftJoin(schema.invoices, eq(schema.invoices.id, p.invoiceId))
    .$dynamic();
}
