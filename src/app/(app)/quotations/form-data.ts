import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCompany } from "@/server/settings";
import { activeStaff } from "@/server/lookups";
import { getVisibleFields } from "@/server/custom-fields";
import { customerScope } from "@/server/scope";
import type { CurrentUser } from "@/server/auth";

/** Data needed by quotation and credit-note editors. */
export async function salesDocFormData(user: CurrentUser, entity: "quotations" | "proforma_invoices" | "credit_notes") {
  const c = schema.customers;
  const [customers, items, staff, company, fields] = await Promise.all([
    db
      .select({ id: c.id, company: c.company, stateCode: c.stateCode, email: c.email, phone: c.phone, address: c.address, city: c.city, state: c.state, pincode: c.pincode, gstin: c.gstin })
      .from(c)
      .where(and(eq(c.active, true), customerScope(user)))
      .orderBy(asc(c.company)),
    db
      .select({ id: schema.items.id, name: schema.items.name, description: schema.items.description, hsnSac: schema.items.hsnSac, unit: schema.items.unit, rate: schema.items.rate, taxRate: schema.items.taxRate })
      .from(schema.items)
      .where(eq(schema.items.active, true))
      .orderBy(asc(schema.items.name)),
    activeStaff(),
    getCompany(),
    getVisibleFields(entity, user),
  ]);
  return {
    customers: customers.map((x) => ({
      id: x.id,
      company: x.company,
      stateCode: x.stateCode,
      email: x.email,
      phone: x.phone,
      address: [x.address, [x.city, x.state, x.pincode].filter(Boolean).join(", "), x.gstin ? `GSTIN: ${x.gstin}` : ""].filter(Boolean).join("\n"),
    })),
    items,
    staff,
    company,
    fields,
  };
}
