import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { getVisibleFields } from "@/server/custom-fields";
import { customerScope, expenseScope, invoiceScope, quotationScope } from "@/server/scope";
import { displayCustomValue } from "@/lib/custom-fields";
import { can } from "@/lib/permissions";
import { todayISO } from "@/lib/format";
import { QUOTE_KINDS } from "@/lib/sales-kinds";

const MAX_ROWS = 50_000;

/** Neutralises spreadsheet formula injection and escapes CSV special characters. */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(headers: string[], rows: unknown[][]) {
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export async function GET(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  const { entity } = await params;
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const like = `%${q}%`;
  let body: string;

  switch (entity) {
    case "customers": {
      if (!can(user, "customers.view") && !can(user, "customers.view_own")) return new Response("Forbidden", { status: 403 });
      const fields = await getVisibleFields("customers", user);
      const c = schema.customers;
      const rows = await db.select().from(c)
        .where(and(customerScope(user), q ? or(ilike(c.company, like), ilike(c.gstin, like), ilike(c.phone, like)) : undefined))
        .orderBy(c.company).limit(MAX_ROWS);
      body = csv(
        ["ID", "Company", "GSTIN", "PAN", "Phone", "Email", "Address", "City", "State", "PIN", "Groups", "Payment terms", "Credit limit", "Active", ...fields.map((f) => f.label)],
        rows.map((r) => [r.id, r.company, r.gstin, r.pan, r.phone, r.email, r.address, r.city, r.state, r.pincode, r.groups.join("; "), r.paymentTermsDays, r.creditLimit, r.active ? "Yes" : "No", ...fields.map((f) => displayCustomValue(f, r.custom[f.key]))]),
      );
      break;
    }
    case "invoices": {
      if (!can(user, "invoices.view") && !can(user, "invoices.view_own")) return new Response("Forbidden", { status: 403 });
      const fields = await getVisibleFields("invoices", user);
      const i = schema.invoices;
      const rows = await db.select({ i, company: schema.customers.company, gstin: schema.customers.gstin }).from(i)
        .innerJoin(schema.customers, eq(schema.customers.id, i.customerId))
        .where(and(invoiceScope(user), q ? or(ilike(i.number, like), ilike(schema.customers.company, like)) : undefined))
        .orderBy(desc(i.date)).limit(MAX_ROWS);
      body = csv(
        ["Invoice #", "Status", "Date", "Due date", "Customer", "Customer GSTIN", "Place of supply", "Taxable", "CGST", "SGST", "IGST", "Round off", "Total", "Paid", "Balance", ...fields.map((f) => f.label)],
        rows.map(({ i: r, company, gstin }) => [
          r.number ?? `DRAFT-${r.id}`, r.status, r.date, r.dueDate, company, gstin, r.placeOfSupply,
          (Number(r.subtotal) - Number(r.discount)).toFixed(2), r.cgst, r.sgst, r.igst, r.roundOff, r.total, r.amountPaid,
          (Number(r.total) - Number(r.amountPaid)).toFixed(2), ...fields.map((f) => displayCustomValue(f, r.custom[f.key])),
        ]),
      );
      break;
    }
    case "payments": {
      if (!can(user, "payments.view")) return new Response("Forbidden", { status: 403 });
      const p = schema.payments;
      const rows = await db.select({ p, company: schema.customers.company, number: schema.invoices.number }).from(p)
        .innerJoin(schema.customers, eq(schema.customers.id, p.customerId))
        .leftJoin(schema.invoices, eq(schema.invoices.id, p.invoiceId))
        .where(q ? or(ilike(schema.customers.company, like), ilike(p.reference, like)) : undefined)
        .orderBy(desc(p.date)).limit(MAX_ROWS);
      body = csv(["ID", "Date", "Customer", "Invoice", "Mode", "Reference", "Amount"], rows.map(({ p: r, company, number }) => [r.id, r.date, company, number, r.mode, r.reference, r.amount]));
      break;
    }
    case "expenses": {
      if (!can(user, "expenses.view") && !can(user, "expenses.view_own")) return new Response("Forbidden", { status: 403 });
      const fields = await getVisibleFields("expenses", user);
      const e = schema.expenses;
      const rows = await db.select({ e, category: schema.expenseCategories.name, vendor: schema.vendors.name, vendorGstin: schema.vendors.gstin }).from(e)
        .innerJoin(schema.expenseCategories, eq(schema.expenseCategories.id, e.categoryId))
        .leftJoin(schema.vendors, eq(schema.vendors.id, e.vendorId))
        .where(and(expenseScope(user), q ? or(ilike(e.name, like), ilike(schema.vendors.name, like)) : undefined, sql`true`))
        .orderBy(desc(e.date)).limit(MAX_ROWS);
      body = csv(
        ["ID", "Date", "Category", "Name", "Vendor", "Vendor GSTIN", "Amount", "Tax 1", "Tax 2", "Tax", "Total", "Paid via", "Reference", "Project", "Billable", "Invoiced", "Repeats", ...fields.map((f) => f.label)],
        rows.map(({ e: r, category, vendor, vendorGstin }) => [r.id, r.date, category, r.name, vendor, vendorGstin, r.amount, r.tax1Name ? `${r.tax1Name} ${Number(r.tax1Rate)}%` : "", r.tax2Name ? `${r.tax2Name} ${Number(r.tax2Rate)}%` : "", r.taxAmount, r.total, r.paymentMode, r.reference, r.project, r.billable ? "Yes" : "No", r.invoiced ? "Yes" : "No", r.repeatEvery ?? "", ...fields.map((f) => displayCustomValue(f, r.custom[f.key]))]),
      );
      break;
    }
    case "quotations": {
      const kind = new URL(request.url).searchParams.get("kind") === "proforma" ? "proforma" : "quotation";
      const K = QUOTE_KINDS[kind];
      if (!can(user, K.perm.view) && !can(user, K.perm.viewOwn)) return new Response("Forbidden", { status: 403 });
      const fields = await getVisibleFields(K.entity, user);
      const t = schema.quotations;
      const rows = await db.select().from(t)
        .where(and(quotationScope(user, kind), q ? or(ilike(t.number, like), ilike(t.subject, like), ilike(t.toName, like)) : undefined))
        .orderBy(desc(t.id)).limit(MAX_ROWS);
      body = csv(
        [`${K.label} #`, "Subject", "To", "Date", "Open till", "Project", "Tags", "Status", "Taxable", "CGST", "SGST", "IGST", "Total", "SO created", ...fields.map((f) => f.label)],
        rows.map((r) => [r.number, r.subject, r.toName, r.date, r.openTill, r.project, r.tags.join("; "), r.status,
          (Number(r.subtotal) - Number(r.discount)).toFixed(2), r.cgst, r.sgst, r.igst, r.total, r.soCreated ? "Yes" : "No",
          ...fields.map((f) => displayCustomValue(f, r.custom[f.key]))]),
      );
      break;
    }
    case "credit_notes": {
      if (!can(user, "credit_notes.view")) return new Response("Forbidden", { status: 403 });
      const c = schema.creditNotes;
      const rows = await db.select({ c, customer: schema.customers.company, gstin: schema.customers.gstin }).from(c)
        .innerJoin(schema.customers, eq(schema.customers.id, c.customerId))
        .where(and(customerScope(user), q ? or(ilike(c.number, like), ilike(schema.customers.company, like), ilike(c.reference, like)) : undefined))
        .orderBy(desc(c.id)).limit(MAX_ROWS);
      body = csv(
        ["Credit note #", "Date", "Customer", "GSTIN", "Status", "Reference #", "Taxable", "CGST", "SGST", "IGST", "Amount", "Applied", "Refunded", "Remaining"],
        rows.map(({ c: r, customer, gstin }) => [r.number, r.date, customer, gstin, r.status, r.reference, (Number(r.subtotal) - Number(r.discount)).toFixed(2),
          r.cgst, r.sgst, r.igst, r.total, r.amountApplied, r.amountRefunded,
          r.status === "void" ? "0.00" : (Number(r.total) - Number(r.amountApplied) - Number(r.amountRefunded)).toFixed(2)]),
      );
      break;
    }
    default:
      return new Response("Not found", { status: 404 });
  }

  await audit({ userId: user.id, action: "export", entity, data: { q } });
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${entity}-${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
