import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCompany } from "@/server/settings";
import { activeStaff } from "@/server/lookups";
import { getVisibleFields } from "@/server/custom-fields";
import { customerScope } from "@/server/scope";
import type { CurrentUser } from "@/server/auth";

export async function loadEditorData(user: CurrentUser) {
  const [customers, items, staff, company, fields] = await Promise.all([
    db
      .select({
        id: schema.customers.id,
        company: schema.customers.company,
        stateCode: schema.customers.stateCode,
        paymentTermsDays: schema.customers.paymentTermsDays,
      })
      .from(schema.customers)
      .where(and(eq(schema.customers.active, true), customerScope(user)))
      .orderBy(asc(schema.customers.company)),
    db
      .select({
        id: schema.items.id,
        name: schema.items.name,
        description: schema.items.description,
        hsnSac: schema.items.hsnSac,
        unit: schema.items.unit,
        rate: schema.items.rate,
        taxRate: schema.items.taxRate,
      })
      .from(schema.items)
      .where(eq(schema.items.active, true))
      .orderBy(asc(schema.items.name)),
    activeStaff(),
    getCompany(),
    getVisibleFields("invoices", user),
  ]);
  return { customers, items, staff, company, fields };
}
