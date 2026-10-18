import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { invoiceScope } from "@/server/scope";
import { salesDocFormData } from "../quotations/form-data";
import type { CurrentUser } from "@/server/auth";

export async function creditNoteFormData(user: CurrentUser) {
  const [base, invoices] = await Promise.all([
    salesDocFormData(user, "credit_notes"),
    db
      .select({ id: schema.invoices.id, number: schema.invoices.number, customerId: schema.invoices.customerId })
      .from(schema.invoices)
      .where(and(isNotNull(schema.invoices.number), eq(schema.invoices.status, "issued"), invoiceScope(user)))
      .orderBy(desc(schema.invoices.date))
      .limit(2000),
  ]);
  return { ...base, invoices };
}
