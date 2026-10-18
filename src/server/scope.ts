import "server-only";
import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, schema } from "@/db";
import { viewScope } from "@/lib/permissions";
import type { CurrentUser } from "./auth";

/** Row filter for customers the user may see (undefined = all). */
export function customerScope(user: CurrentUser): SQL | undefined {
  const scope = viewScope(user, "customers");
  if (scope === "all") return undefined;
  if (scope === "own") return or(eq(schema.customers.ownerId, user.id), eq(schema.customers.createdBy, user.id));
  return sql`false`;
}

export function invoiceScope(user: CurrentUser): SQL | undefined {
  const scope = viewScope(user, "invoices");
  if (scope === "all") return undefined;
  if (scope === "own") return or(eq(schema.invoices.salesAgentId, user.id), eq(schema.invoices.createdBy, user.id));
  return sql`false`;
}

/** Quotations and proforma invoices share a table; each kind has its own permissions. */
export function quotationScope(user: CurrentUser, kind: "quotation" | "proforma" = "quotation"): SQL {
  const scope = viewScope(user, kind === "proforma" ? "proforma_invoices" : "quotations");
  const ofKind = eq(schema.quotations.kind, kind);
  if (scope === "all") return ofKind;
  if (scope === "own") return and(ofKind, or(eq(schema.quotations.salesAgentId, user.id), eq(schema.quotations.createdBy, user.id)))!;
  return sql`false`;
}

export function expenseScope(user: CurrentUser): SQL | undefined {
  const scope = viewScope(user, "expenses");
  if (scope === "all") return undefined;
  if (scope === "own") return eq(schema.expenses.createdBy, user.id);
  return sql`false`;
}

/** Loads a customer the user may see, or 404s (no hint that the record exists). */
export async function loadCustomer(user: CurrentUser, id: number) {
  if (viewScope(user, "customers") === "none") redirect("/forbidden");
  if (!Number.isInteger(id)) notFound();
  const scope = customerScope(user);
  const rows = await db
    .select()
    .from(schema.customers)
    .where(and(eq(schema.customers.id, id), scope))
    .limit(1);
  if (!rows[0]) notFound();
  return rows[0];
}
