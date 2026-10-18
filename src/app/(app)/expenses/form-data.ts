import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getVisibleFields } from "@/server/custom-fields";
import { getCompany } from "@/server/settings";
import { customerScope } from "@/server/scope";
import { expenseTaxOptions } from "@/lib/expense";
import type { CurrentUser } from "@/server/auth";

export async function expenseFormData(user: CurrentUser) {
  const [categories, customers, vendors, fields, company] = await Promise.all([
    db.select({ id: schema.expenseCategories.id, name: schema.expenseCategories.name }).from(schema.expenseCategories)
      .where(eq(schema.expenseCategories.active, true)).orderBy(asc(schema.expenseCategories.name)),
    db.select({ id: schema.customers.id, company: schema.customers.company }).from(schema.customers)
      .where(and(eq(schema.customers.active, true), customerScope(user))).orderBy(asc(schema.customers.company)),
    db.select({ id: schema.vendors.id, name: schema.vendors.name, gstin: schema.vendors.gstin }).from(schema.vendors)
      .where(eq(schema.vendors.active, true)).orderBy(asc(schema.vendors.name)),
    getVisibleFields("expenses", user),
    getCompany(),
  ]);
  return { categories, customers, vendors, fields, taxOptions: expenseTaxOptions(company.taxRates) };
}

/** Maps stored tax name/rate back to the option value used by the form. */
export function taxValue(name: string | null, rate: string | null): string {
  return name && rate ? `${name}@${Number(rate)}` : "";
}
