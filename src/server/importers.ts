import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema, type Tx } from "@/db";
import type { CurrentUser } from "./auth";
import { audit } from "./audit";
import { getActiveFields } from "./custom-fields";
import { customerScope, invoiceScope } from "./scope";
import { getCompany } from "./settings";
import { parseCustomFields, FORM_PREFIX, type CustomFieldDef } from "@/lib/custom-fields";
import { computeInvoiceTotals, isValidGstin, stateCodeFromGstin, stateName } from "@/lib/gst";
import { fromPaise, toPaise } from "@/lib/money";
import { addDays, todayISO } from "@/lib/format";
import { can } from "@/lib/permissions";
import { QUOTE_KINDS } from "@/lib/sales-kinds";
import {
  IMPORT_DEFS, groupByNumber, parseAmount, parseDate, parseInvoiceStatus, parseList, parsePaymentMode, parsePercent,
  parseQty, parseQuotationStatus, parseStateCode, parseYesNo, readImportFile, type ImportEntity, type ImportRow,
} from "@/lib/importing";

/**
 * Server side of every "Import" button: validates the rows of an uploaded file against the database
 * (record-level access, duplicates, references) and, when asked, saves the valid ones in one transaction.
 */

export type ImportProblem = { line: number; message: string };
export type ImportResult = {
  ok: boolean;
  message: string;
  /** Rows (or documents) that will be / were imported. */
  ready: number;
  imported?: number;
  errors: ImportProblem[];
  skipped: ImportProblem[];
  warnings: ImportProblem[];
  notes: string[];
  ignored: string[];
  previewHead: string[];
  preview: { line: number; cells: string[] }[];
};

export type ImportOptions = { commit: boolean; createCustomers: boolean };

export const MAX_IMPORT_ROWS = 5000;
const PREVIEW_ROWS = 25;
const STANDARD_GST = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];

type Prepared<T> = {
  items: T[];
  errors: ImportProblem[];
  skipped: ImportProblem[];
  warnings: ImportProblem[];
  notes: string[];
  previewHead: string[];
  preview: (item: T) => { line: number; cells: string[] };
  save: (tx: Tx, items: T[]) => Promise<void>;
};

export async function runImport(entity: ImportEntity, user: CurrentUser, table: string[][], opts: ImportOptions): Promise<ImportResult> {
  const def = IMPORT_DEFS[entity];
  const fieldDefs = def.customFields ? await getActiveFields(def.customFields) : [];
  const file = readImportFile(table, def.columns, fieldDefs.map((f) => f.label));
  const empty = { ready: 0, errors: [], skipped: [], warnings: [], notes: [], ignored: [], previewHead: [], preview: [] };
  if (!file.ok) return { ok: false, message: file.error, ...empty };
  if (file.rows.length > MAX_IMPORT_ROWS) return { ok: false, message: `At most ${MAX_IMPORT_ROWS} rows per file — split it.`, ...empty };

  const ctx: Ctx = { user, opts, fieldDefs, rows: file.rows };
  const p = await PREPARE[entity](ctx);

  let imported: number | undefined;
  if (opts.commit && p.items.length) {
    await db.transaction(async (tx) => {
      await p.save(tx, p.items);
      await audit({ userId: user.id, action: "import", entity: entity.replace(/s$/, ""), data: { rows: p.items.length, errors: p.errors.length, skipped: p.skipped.length } }, tx);
    });
    imported = p.items.length;
  }
  const label = def.linesPerRow ? "document" : "row";
  const n = p.items.length;
  const message =
    imported !== undefined
      ? `Imported ${imported} ${label}${imported === 1 ? "" : "s"}.${p.skipped.length ? ` ${p.skipped.length} skipped.` : ""}${p.errors.length ? ` ${p.errors.length} with errors were left out.` : ""}`
      : n
        ? `${n} ${label}${n === 1 ? "" : "s"} ready to import.${p.errors.length ? ` ${p.errors.length} have errors and will be left out.` : ""}${p.skipped.length ? ` ${p.skipped.length} will be skipped.` : ""}`
        : p.errors.length ? "Nothing can be imported — fix the errors below and upload again." : "Nothing new to import.";
  return {
    ok: n > 0,
    message,
    ready: n,
    imported,
    errors: p.errors,
    skipped: p.skipped,
    warnings: p.warnings,
    notes: p.notes,
    ignored: file.ignored,
    previewHead: p.previewHead,
    preview: p.items.slice(0, PREVIEW_ROWS).map(p.preview),
  };
}

type Ctx = { user: CurrentUser; opts: ImportOptions; fieldDefs: CustomFieldDef[]; rows: ImportRow[] };

// ─── Shared helpers ──────────────────────────────────────────────────────────

const lower = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const isEmail = (s: string) => z.email().safeParse(s).success;

/** Custom-field values from the extra columns (matched by field label), validated like the forms. */
function customValues(ctx: Ctx, row: ImportRow): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const defs = ctx.fieldDefs.filter((f) => Object.hasOwn(row.extra, f.label));
  if (!defs.length) return { ok: true, value: {} };
  const form = new FormData();
  for (const f of defs) {
    const raw = row.extra[f.label] ?? "";
    const name = FORM_PREFIX + f.key;
    if (f.type === "checkbox") form.set(name, parseYesNo(raw, false) ? "on" : "");
    else if (f.type === "multiselect") parseList(raw).forEach((v) => form.append(name, v));
    else if (f.type === "date") form.set(name, raw ? (parseDate(raw) ?? raw) : "");
    else if (f.type === "number" || f.type === "currency") form.set(name, raw ? (parseAmount(raw) ?? raw) : "");
    else form.set(name, raw);
  }
  const r = parseCustomFields(defs, form, ctx.user);
  return r.ok ? r : { ok: false, error: Object.values(r.errors)[0] ?? "Invalid custom field" };
}

type CustomerRef = { id: number; company: string; stateCode: string | null; paymentTermsDays: number };
type PlannedCustomer = { company: string };

/** Finds customers by GSTIN or company name among those the user may see; can plan new ones by name. */
async function customerResolver(user: CurrentUser, allowCreate: boolean) {
  const rows = await db
    .select({ id: schema.customers.id, company: schema.customers.company, gstin: schema.customers.gstin, stateCode: schema.customers.stateCode, paymentTermsDays: schema.customers.paymentTermsDays })
    .from(schema.customers)
    .where(customerScope(user));
  const byGstin = new Map(rows.filter((r) => r.gstin).map((r) => [r.gstin!.toUpperCase(), r]));
  const byName = new Map<string, CustomerRef[]>();
  for (const r of rows) byName.set(lower(r.company), [...(byName.get(lower(r.company)) ?? []), r]);
  const planned = new Map<string, PlannedCustomer>();
  return {
    planned,
    resolve(ref: string): { customer: CustomerRef | PlannedCustomer } | { error: string } {
      const s = ref.trim();
      if (!s) return { error: "Customer is empty" };
      const g = byGstin.get(s.toUpperCase());
      if (g) return { customer: g };
      const hits = byName.get(lower(s)) ?? [];
      if (hits.length === 1) return { customer: hits[0]! };
      if (hits.length > 1) return { error: `“${s}” matches ${hits.length} customers — use the GSTIN` };
      if (!allowCreate) return { error: `Customer “${s}” not found` };
      if (/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(s)) return { error: `No customer with GSTIN ${s}` };
      const key = lower(s);
      if (!planned.has(key)) planned.set(key, { company: s });
      return { customer: planned.get(key)! };
    },
  };
}

/** Inserts planned customers (name only) and returns a lookup from planned object → id. */
async function createPlannedCustomers(tx: Tx, user: CurrentUser, planned: Map<string, PlannedCustomer>) {
  const ids = new Map<PlannedCustomer, number>();
  for (const p of planned.values()) {
    const [row] = await tx
      .insert(schema.customers)
      .values({ company: p.company, ownerId: can(user, "customers.view") ? null : user.id, createdBy: user.id })
      .returning({ id: schema.customers.id });
    ids.set(p, row!.id);
    await audit({ userId: user.id, action: "create", entity: "customer", entityId: row!.id, data: { company: p.company, source: "import" } }, tx);
  }
  return (c: CustomerRef | PlannedCustomer) => ("id" in c ? c.id : ids.get(c)!);
}

const newCustomersNote = (planned: Map<string, PlannedCustomer>) =>
  planned.size ? [`${planned.size} new customer${planned.size === 1 ? "" : "s"} will be created (name only — add GSTIN and address later): ${[...planned.values()].slice(0, 8).map((p) => p.company).join(", ")}${planned.size > 8 ? " …" : ""}`] : [];

function blankPrepared<T>(head: string[]): Pick<Prepared<T>, "items" | "errors" | "skipped" | "warnings" | "notes" | "previewHead"> {
  return { items: [], errors: [], skipped: [], warnings: [], notes: [], previewHead: head };
}

// ─── Per-entity preparation ──────────────────────────────────────────────────

const PREPARE: Record<ImportEntity, (ctx: Ctx) => Promise<Prepared<any>>> = {
  async customers(ctx) {
    type Row = { line: number; values: typeof schema.customers.$inferInsert; contact: { name: string; email: string | null; phone: string | null } | null };
    const p = blankPrepared<Row>(["Company", "GSTIN", "State", "City", "Phone", "Groups"]);
    const existing = await db.select({ company: schema.customers.company, gstin: schema.customers.gstin }).from(schema.customers);
    const names = new Set(existing.map((e) => lower(e.company)));
    const gstins = new Set(existing.filter((e) => e.gstin).map((e) => e.gstin!.toUpperCase()));
    for (const r of ctx.rows) {
      const v = r.values;
      const err = (message: string) => p.errors.push({ line: r.line, message });
      const company = (v.company ?? "").trim();
      if (!company) { err("Company is empty"); continue; }
      const gstin = v.gstin?.toUpperCase().replace(/\s/g, "") || null;
      if (gstin && !isValidGstin(gstin)) { err(`GSTIN “${gstin}” is not valid`); continue; }
      if ((gstin && gstins.has(gstin)) || names.has(lower(company))) { p.skipped.push({ line: r.line, message: `${company} already exists` }); continue; }
      let stateCode = gstin ? stateCodeFromGstin(gstin) : null;
      if (!stateCode && v.state) {
        stateCode = parseStateCode(v.state);
        if (!stateCode) { err(`Unknown state “${v.state}”`); continue; }
      }
      const email = v.email || null;
      if (email && !isEmail(email)) { err(`Email “${email}” is not valid`); continue; }
      const pan = v.pan?.toUpperCase() || null;
      if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) { err(`PAN “${pan}” is not valid`); continue; }
      const terms = v.paymentTermsDays ? Number(v.paymentTermsDays) : 30;
      if (!Number.isInteger(terms) || terms < 0 || terms > 365) { err("Payment terms must be 0–365 days"); continue; }
      const creditLimit = v.creditLimit ? parseAmount(v.creditLimit) : "0";
      if (creditLimit === null) { err(`Credit limit “${v.creditLimit}” is not an amount`); continue; }
      const active = parseYesNo(v.active, true);
      if (active === null) { err(`Active must be Yes or No`); continue; }
      const custom = customValues(ctx, r);
      if (!custom.ok) { err(custom.error); continue; }
      names.add(lower(company));
      if (gstin) gstins.add(gstin);
      const contactName = (v.contactName ?? "").trim();
      p.items.push({
        line: r.line,
        values: {
          company, gstin, pan, phone: v.phone || null, email, website: v.website || null, address: v.address || null, city: v.city || null,
          stateCode, state: stateCode ? stateName(stateCode) : null, pincode: v.pincode || null, groups: parseList(v.groups),
          paymentTermsDays: terms, creditLimit, active, custom: custom.value,
          ownerId: can(ctx.user, "customers.view") ? null : ctx.user.id, createdBy: ctx.user.id,
        },
        contact: contactName ? { name: contactName, email: v.contactEmail || null, phone: v.contactPhone || null } : null,
      });
    }
    return {
      ...p,
      preview: (i) => ({ line: i.line, cells: [i.values.company, i.values.gstin ?? "", i.values.state ?? "", i.values.city ?? "", i.values.phone ?? "", (i.values.groups ?? []).join(", ")] }),
      async save(tx, items) {
        for (const i of items) {
          const [row] = await tx.insert(schema.customers).values(i.values).returning({ id: schema.customers.id });
          if (i.contact) await tx.insert(schema.contacts).values({ customerId: row!.id, ...i.contact, isPrimary: true });
        }
      },
    };
  },

  async contacts(ctx) {
    type Row = { line: number; customer: string; values: typeof schema.contacts.$inferInsert };
    const p = blankPrepared<Row>(["Customer", "Name", "Title", "Email", "Phone", "Primary"]);
    const resolver = await customerResolver(ctx.user, false);
    const existing = await db.select({ customerId: schema.contacts.customerId, name: schema.contacts.name, email: schema.contacts.email }).from(schema.contacts);
    const seen = new Set(existing.flatMap((c) => [`${c.customerId}|n|${lower(c.name)}`, ...(c.email ? [`${c.customerId}|e|${lower(c.email)}`] : [])]));
    for (const r of ctx.rows) {
      const v = r.values;
      const err = (message: string) => p.errors.push({ line: r.line, message });
      const ref = resolver.resolve(v.customer ?? "");
      if ("error" in ref) { err(ref.error); continue; }
      const c = ref.customer as CustomerRef;
      const name = (v.name ?? "").trim();
      if (!name) { err("Name is empty"); continue; }
      const email = v.email || null;
      if (email && !isEmail(email)) { err(`Email “${email}” is not valid`); continue; }
      const isPrimary = parseYesNo(v.isPrimary, false);
      if (isPrimary === null) { err("Primary must be Yes or No"); continue; }
      if (seen.has(`${c.id}|n|${lower(name)}`) || (email && seen.has(`${c.id}|e|${lower(email)}`))) { p.skipped.push({ line: r.line, message: `${name} already exists on ${c.company}` }); continue; }
      const custom = customValues(ctx, r);
      if (!custom.ok) { err(custom.error); continue; }
      seen.add(`${c.id}|n|${lower(name)}`);
      if (email) seen.add(`${c.id}|e|${lower(email)}`);
      p.items.push({ line: r.line, customer: c.company, values: { customerId: c.id, name, title: v.title || null, email, phone: v.phone || null, whatsapp: v.whatsapp || null, isPrimary, custom: custom.value } });
    }
    return {
      ...p,
      preview: (i) => ({ line: i.line, cells: [i.customer, i.values.name, i.values.title ?? "", i.values.email ?? "", i.values.phone ?? "", i.values.isPrimary ? "Yes" : "No"] }),
      async save(tx, items) {
        for (const i of items) {
          if (i.values.isPrimary) await tx.update(schema.contacts).set({ isPrimary: false }).where(eq(schema.contacts.customerId, i.values.customerId));
          await tx.insert(schema.contacts).values(i.values);
        }
      },
    };
  },

  async items(ctx) {
    type Row = { line: number; values: typeof schema.items.$inferInsert };
    const p = blankPrepared<Row>(["Name", "HSN/SAC", "Unit", "Rate", "GST %", "Active"]);
    const names = new Set((await db.select({ name: schema.items.name }).from(schema.items)).map((i) => lower(i.name)));
    for (const r of ctx.rows) {
      const v = r.values;
      const err = (message: string) => p.errors.push({ line: r.line, message });
      const name = (v.name ?? "").trim();
      if (!name) { err("Name is empty"); continue; }
      if (names.has(lower(name))) { p.skipped.push({ line: r.line, message: `${name} already exists` }); continue; }
      const rate = parseAmount(v.rate);
      if (rate === null) { err(`Rate “${v.rate ?? ""}” is not an amount`); continue; }
      const taxRate = parsePercent(v.taxRate);
      if (taxRate === null) { err(`GST % “${v.taxRate ?? ""}” is not valid`); continue; }
      const hsnSac = v.hsnSac?.replace(/\s/g, "") || null;
      if (hsnSac && !/^\d{4,8}$/.test(hsnSac)) { err(`HSN/SAC “${hsnSac}” must be 4–8 digits`); continue; }
      const active = parseYesNo(v.active, true);
      if (active === null) { err("Active must be Yes or No"); continue; }
      names.add(lower(name));
      p.items.push({ line: r.line, values: { name, description: v.description || null, hsnSac, unit: v.unit || "pcs", rate, taxRate, active } });
    }
    return {
      ...p,
      preview: (i) => ({ line: i.line, cells: [i.values.name, i.values.hsnSac ?? "", i.values.unit ?? "pcs", i.values.rate!, `${i.values.taxRate}%`, i.values.active ? "Yes" : "No"] }),
      async save(tx, items) {
        await tx.insert(schema.items).values(items.map((i) => i.values));
      },
    };
  },

  async vendors(ctx) {
    type Row = { line: number; values: typeof schema.vendors.$inferInsert };
    const p = blankPrepared<Row>(["Name", "GSTIN", "Phone", "Email", "Active"]);
    const existing = await db.select({ name: schema.vendors.name, gstin: schema.vendors.gstin }).from(schema.vendors);
    const names = new Set(existing.map((e) => lower(e.name)));
    const gstins = new Set(existing.filter((e) => e.gstin).map((e) => e.gstin!.toUpperCase()));
    for (const r of ctx.rows) {
      const v = r.values;
      const err = (message: string) => p.errors.push({ line: r.line, message });
      const name = (v.name ?? "").trim();
      if (!name) { err("Name is empty"); continue; }
      const gstin = v.gstin?.toUpperCase().replace(/\s/g, "") || null;
      if (gstin && !isValidGstin(gstin)) { err(`GSTIN “${gstin}” is not valid`); continue; }
      if (names.has(lower(name)) || (gstin && gstins.has(gstin))) { p.skipped.push({ line: r.line, message: `${name} already exists` }); continue; }
      const email = v.email || null;
      if (email && !isEmail(email)) { err(`Email “${email}” is not valid`); continue; }
      const active = parseYesNo(v.active, true);
      if (active === null) { err("Active must be Yes or No"); continue; }
      names.add(lower(name));
      if (gstin) gstins.add(gstin);
      p.items.push({ line: r.line, values: { name, gstin, phone: v.phone || null, email, address: v.address || null, active } });
    }
    return {
      ...p,
      preview: (i) => ({ line: i.line, cells: [i.values.name, i.values.gstin ?? "", i.values.phone ?? "", i.values.email ?? "", i.values.active ? "Yes" : "No"] }),
      async save(tx, items) {
        await tx.insert(schema.vendors).values(items.map((i) => i.values));
      },
    };
  },

  async expense_categories(ctx) {
    type Row = { line: number; values: typeof schema.expenseCategories.$inferInsert };
    const p = blankPrepared<Row>(["Name", "Description", "Active"]);
    const names = new Set((await db.select({ name: schema.expenseCategories.name }).from(schema.expenseCategories)).map((c) => lower(c.name)));
    for (const r of ctx.rows) {
      const v = r.values;
      const name = (v.name ?? "").trim().replace(/\s+/g, " ");
      if (!name) { p.errors.push({ line: r.line, message: "Name is empty" }); continue; }
      if (names.has(lower(name))) { p.skipped.push({ line: r.line, message: `${name} already exists` }); continue; }
      const active = parseYesNo(v.active, true);
      if (active === null) { p.errors.push({ line: r.line, message: "Active must be Yes or No" }); continue; }
      names.add(lower(name));
      p.items.push({ line: r.line, values: { name, description: v.description || null, active } });
    }
    return {
      ...p,
      preview: (i) => ({ line: i.line, cells: [i.values.name, i.values.description ?? "", i.values.active ? "Yes" : "No"] }),
      async save(tx, items) {
        await tx.insert(schema.expenseCategories).values(items.map((i) => i.values));
      },
    };
  },

  async payments(ctx) {
    type Row = { line: number; number: string; customer: string; values: typeof schema.payments.$inferInsert };
    const p = blankPrepared<Row>(["Invoice #", "Customer", "Date", "Amount", "Mode", "Reference"]);
    const numbers = [...new Set(ctx.rows.map((r) => (r.values.invoice ?? "").trim()).filter(Boolean))];
    const invoices = numbers.length
      ? await db
          .select({ id: schema.invoices.id, number: schema.invoices.number, status: schema.invoices.status, total: schema.invoices.total, amountPaid: schema.invoices.amountPaid, customerId: schema.invoices.customerId, company: schema.customers.company })
          .from(schema.invoices)
          .innerJoin(schema.customers, eq(schema.customers.id, schema.invoices.customerId))
          .where(and(inArray(sql`upper(${schema.invoices.number})`, numbers.map((n) => n.toUpperCase())), invoiceScope(ctx.user)))
      : [];
    const byNumber = new Map(invoices.map((i) => [i.number!.toUpperCase(), i]));
    const balance = new Map(invoices.map((i) => [i.id, toPaise(i.total) - toPaise(i.amountPaid)]));
    const existing = invoices.length
      ? await db.select({ invoiceId: schema.payments.invoiceId, date: schema.payments.date, amount: schema.payments.amount, reference: schema.payments.reference }).from(schema.payments).where(inArray(schema.payments.invoiceId, invoices.map((i) => i.id)))
      : [];
    const seen = new Set(existing.map((e) => `${e.invoiceId}|${e.date}|${toPaise(e.amount)}|${lower(e.reference ?? "")}`));
    const today = todayISO();
    for (const r of ctx.rows) {
      const v = r.values;
      const err = (message: string) => p.errors.push({ line: r.line, message });
      const inv = byNumber.get((v.invoice ?? "").trim().toUpperCase());
      if (!inv) { err(`Invoice “${v.invoice ?? ""}” not found`); continue; }
      if (inv.status !== "issued") { err(`${inv.number} is ${inv.status} — payments need an issued invoice`); continue; }
      const date = parseDate(v.date);
      if (!date) { err(`Date “${v.date ?? ""}” is not valid`); continue; }
      if (date > today) { err("Payment date is in the future"); continue; }
      const amount = parseAmount(v.amount);
      if (!amount || toPaise(amount) <= 0) { err(`Amount “${v.amount ?? ""}” is not valid`); continue; }
      const mode = parsePaymentMode(v.mode);
      if (!mode) { err(`Mode “${v.mode}” — use Bank, UPI, Cash, Cheque or Card`); continue; }
      const reference = v.reference || null;
      const key = `${inv.id}|${date}|${toPaise(amount)}|${lower(reference ?? "")}`;
      if (seen.has(key)) { p.skipped.push({ line: r.line, message: `Same payment already recorded on ${inv.number}` }); continue; }
      const left = balance.get(inv.id)!;
      if (toPaise(amount) > left) { err(`${inv.number}: ₹${amount} is more than the balance due (₹${fromPaise(left)})`); continue; }
      const custom = customValues(ctx, r);
      if (!custom.ok) { err(custom.error); continue; }
      seen.add(key);
      balance.set(inv.id, left - toPaise(amount));
      p.items.push({ line: r.line, number: inv.number!, customer: inv.company, values: { customerId: inv.customerId, invoiceId: inv.id, date, amount, mode, reference, note: v.note || null, custom: custom.value, createdBy: ctx.user.id } });
    }
    return {
      ...p,
      preview: (i) => ({ line: i.line, cells: [i.number, i.customer, i.values.date, i.values.amount!, i.values.mode!, i.values.reference ?? ""] }),
      async save(tx, items) {
        for (const i of items) {
          await tx.insert(schema.payments).values(i.values);
          await tx.update(schema.invoices).set({ amountPaid: sql`${schema.invoices.amountPaid} + ${i.values.amount}::numeric`, updatedAt: new Date() }).where(eq(schema.invoices.id, i.values.invoiceId!));
        }
      },
    };
  },

  invoices: (ctx) => prepareDocs(ctx, "invoice"),
  quotations: (ctx) => prepareDocs(ctx, "quotation"),
  proforma: (ctx) => prepareDocs(ctx, "proforma"),
};

// ─── Invoices, quotations and proforma invoices ──────────────────────────────

type DocLineRow = { itemId: number | null; description: string; hsnSac: string | null; qty: string; unit: string; rate: string; taxRate: string };
type Doc = {
  line: number;
  number: string;
  date: string;
  customer: CustomerRef | PlannedCustomer | null;
  customerName: string;
  header: Record<string, unknown>;
  lines: (DocLineRow & { taxableAmount: string; taxAmount: string })[];
  totals: { isInterstate: boolean; subtotal: string; discount: string; cgst: string; sgst: string; igst: string; roundOff: string; total: string };
  status: string;
  paid: boolean;
  mode: "lines" | "summary";
};

async function prepareDocs(ctx: Ctx, kind: "invoice" | "quotation" | "proforma"): Promise<Prepared<Doc>> {
  const isInvoice = kind === "invoice";
  const K = kind === "invoice" ? null : QUOTE_KINDS[kind];
  const p = blankPrepared<Doc>(isInvoice ? ["Invoice #", "Date", "Customer", "Status", "Lines", "GST", "Total"] : ["Number", "Date", "To", "Status", "Lines", "GST", "Total"]);
  const company = await getCompany();
  const resolver = await customerResolver(ctx.user, isInvoice && ctx.opts.createCustomers);
  const items = await db.select({ id: schema.items.id, name: schema.items.name, hsnSac: schema.items.hsnSac }).from(schema.items);
  const itemByName = new Map(items.map((i) => [lower(i.name), i]));

  const groups = groupByNumber(ctx.rows);
  const numbers = groups.map((g) => g.number.toUpperCase()).filter(Boolean);
  const table = isInvoice ? schema.invoices : schema.quotations;
  const taken = new Set(
    numbers.length
      ? (await db.select({ n: table.number }).from(table).where(inArray(sql`upper(${table.number})`, numbers))).map((r) => r.n!.toUpperCase())
      : [],
  );

  for (const g of groups) {
    const first = g.rows[0]!;
    const v = first.values;
    const err = (message: string) => p.errors.push({ line: first.line, message: `${g.number || "(no number)"}: ${message}` });
    if (!g.number) { p.errors.push({ line: first.line, message: "Number is empty" }); continue; }
    if (taken.has(g.number.toUpperCase())) { p.skipped.push({ line: first.line, message: `${g.number} already exists` }); continue; }

    const date = parseDate(v.date);
    if (!date) { err(`Date “${v.date ?? ""}” is not valid`); continue; }

    let customer: CustomerRef | PlannedCustomer | null = null;
    const customerRef = (v.customer ?? "").trim();
    if (customerRef || isInvoice || K?.requireCustomer) {
      const ref = resolver.resolve(customerRef);
      if ("error" in ref) { err(ref.error); continue; }
      customer = ref.customer;
    }
    const toName = customer ? ("id" in customer ? customer.company : customer.company) : (v.toName ?? "").trim();
    if (!toName) { err("Fill Customer or To"); continue; }

    let status: string;
    let paid = false;
    if (isInvoice) {
      const s = parseInvoiceStatus(v.status);
      if (!s) { err(`Status “${v.status}” — use Issued, Paid, Draft or Cancelled`); continue; }
      ({ status, paid } = s);
    } else {
      const s = parseQuotationStatus(v.status);
      if (!s) { err(`Status “${v.status}” — use Draft, Sent, Open, Revised, Declined or Accepted`); continue; }
      status = s;
    }

    let placeOfSupply = customer && "id" in customer ? (customer.stateCode ?? company.stateCode) : company.stateCode;
    if (v.placeOfSupply) {
      const code = parseStateCode(v.placeOfSupply);
      if (!code) { err(`Place of supply “${v.placeOfSupply}” is not a state`); continue; }
      placeOfSupply = code;
    }
    const interstate = placeOfSupply !== company.stateCode;
    const discount = v.discount ? parseAmount(v.discount) : "0.00";
    if (discount === null) { err(`Discount “${v.discount}” is not an amount`); continue; }
    const givenTotal = v.total ? parseAmount(v.total) : null;
    if (v.total && givenTotal === null) { err(`Total “${v.total}” is not an amount`); continue; }

    const hasLines = g.rows.some((r) => (r.values.description ?? "").trim() !== "");
    let built: Pick<Doc, "lines" | "totals" | "mode"> | { error: string };
    if (hasLines) built = buildLineDoc(g.rows, itemByName, interstate, discount, givenTotal);
    else if (isInvoice) built = buildSummaryDoc(v, interstate, givenTotal, g.rows.length);
    else built = { error: "Description, Qty, Rate and GST % are needed for each line" };
    if ("error" in built) { err(built.error); continue; }
    if ("warning" in built && built.warning) p.warnings.push({ line: first.line, message: `${g.number}: ${built.warning}` });

    if (paid && toPaise(built.totals.total) <= 0) paid = false;
    const custom = customValues(ctx, first);
    if (!custom.ok) { err(custom.error); continue; }

    let header: Record<string, unknown>;
    if (isInvoice) {
      const terms = customer && "id" in customer ? customer.paymentTermsDays : 30;
      const dueDate = v.dueDate ? parseDate(v.dueDate) : addDays(date, terms);
      if (!dueDate) { err(`Due date “${v.dueDate}” is not valid`); continue; }
      if (dueDate < date) { err("Due date is before the invoice date"); continue; }
      header = {
        number: g.number, status, date, dueDate, placeOfSupply, notes: v.notes || null, terms: v.terms || null, orderRef: v.orderRef || null, tags: parseList(v.tags),
        salesAgentId: can(ctx.user, "invoices.view") ? null : ctx.user.id, custom: custom.value, createdBy: ctx.user.id,
        issuedAt: status === "draft" ? null : new Date(`${date}T00:00:00+05:30`),
        cancelledAt: status === "cancelled" ? new Date(`${date}T00:00:00+05:30`) : null,
        amountPaid: paid ? built.totals.total : "0",
      };
    } else {
      const openTill = v.openTill ? parseDate(v.openTill) : null;
      if (v.openTill && (!openTill || openTill < date)) { err("Open till must be a date on or after the date"); continue; }
      header = {
        number: g.number, kind, subject: (v.subject ?? "").trim() || built.lines[0]!.description, toName, status, date, openTill, placeOfSupply,
        notes: v.notes || null, terms: v.terms || null, salesAgentId: can(ctx.user, K!.perm.view) ? null : ctx.user.id, custom: custom.value, createdBy: ctx.user.id,
        acceptedAt: status === "accepted" ? new Date(`${date}T00:00:00+05:30`) : null,
        sentAt: ["sent", "open", "revised", "declined", "accepted"].includes(status) ? new Date(`${date}T00:00:00+05:30`) : null,
      };
    }
    taken.add(g.number.toUpperCase());
    p.items.push({ line: first.line, number: g.number, date, customer, customerName: toName, header, status, paid, ...built });
  }
  p.notes.push(...newCustomersNote(resolver.planned));
  const summary = p.items.filter((d) => d.mode === "summary").length;
  if (summary) p.notes.push(`${summary} invoice${summary === 1 ? " has" : "s have"} no line items in the file: each gets one line “Invoice total (imported)” with its GST rate worked out from the tax.`);
  const paidCount = p.items.filter((d) => d.paid).length;
  if (paidCount) p.notes.push(`${paidCount} paid invoice${paidCount === 1 ? "" : "s"} will get a payment on the invoice date (mode Bank, note “Paid in the old CRM”). Import the real payments instead if you have them.`);

  return {
    ...p,
    preview: (d) => ({
      line: d.line,
      cells: [d.number, d.date, d.customerName, d.paid ? "paid" : d.status, String(d.lines.length), d.totals.isInterstate ? `IGST ${d.totals.igst}` : `CGST+SGST ${fromPaise(toPaise(d.totals.cgst) + toPaise(d.totals.sgst))}`, d.totals.total],
    }),
    async save(tx, docs) {
      const customerId = await createPlannedCustomers(tx, ctx.user, resolver.planned);
      for (const d of docs) {
        const cid = d.customer ? customerId(d.customer) : null;
        if (isInvoice) {
          const [row] = await tx.insert(schema.invoices).values({ ...(d.header as typeof schema.invoices.$inferInsert), customerId: cid!, ...d.totals }).returning({ id: schema.invoices.id });
          await tx.insert(schema.invoiceLines).values(d.lines.map((l, i) => ({ ...l, sortOrder: i, invoiceId: row!.id })));
          if (d.paid) {
            await tx.insert(schema.payments).values({ customerId: cid!, invoiceId: row!.id, date: d.date, amount: d.totals.total, mode: "bank", note: "Paid in the old CRM (imported — payment details not in the file)", createdBy: ctx.user.id });
          }
          await audit({ userId: ctx.user.id, action: "import", entity: "invoice", entityId: row!.id, data: { number: d.number, total: d.totals.total, status: d.status, paid: d.paid } }, tx);
        } else {
          const [row] = await tx.insert(schema.quotations).values({ ...(d.header as typeof schema.quotations.$inferInsert), customerId: cid, ...d.totals }).returning({ id: schema.quotations.id });
          await tx.insert(schema.quotationLines).values(d.lines.map((l, i) => ({ ...l, sortOrder: i, quotationId: row!.id })));
          await audit({ userId: ctx.user.id, action: "import", entity: "quotation", entityId: row!.id, data: { number: d.number, kind, total: d.totals.total } }, tx);
        }
      }
    },
  };
}

/** Line-item rows → lines + GST totals. Rounding follows the given Total when there is one. */
function buildLineDoc(
  rows: ImportRow[],
  itemByName: Map<string, { id: number; name: string; hsnSac: string | null }>,
  interstate: boolean,
  discount: string,
  givenTotal: string | null,
): (Pick<Doc, "lines" | "totals" | "mode"> & { warning?: string }) | { error: string } {
  const lines: DocLineRow[] = [];
  for (const r of rows) {
    const v = r.values;
    const description = (v.description ?? "").trim();
    if (!description) return { error: `line ${r.line}: Description is empty` };
    const qty = parseQty(v.qty);
    if (!qty) return { error: `line ${r.line}: Qty “${v.qty ?? ""}” is not valid` };
    const rate = parseAmount(v.rate);
    if (rate === null) return { error: `line ${r.line}: Rate “${v.rate ?? ""}” is not an amount` };
    const taxRate = parsePercent(v.taxRate);
    if (taxRate === null) return { error: `line ${r.line}: GST % “${v.taxRate ?? ""}” is not valid` };
    const item = itemByName.get(lower(description));
    const hsnSac = v.hsnSac?.replace(/\s/g, "") || item?.hsnSac || null;
    if (hsnSac && !/^\d{4,8}$/.test(hsnSac)) return { error: `line ${r.line}: HSN/SAC “${hsnSac}” must be 4–8 digits` };
    lines.push({ itemId: item?.id ?? null, description: description.slice(0, 500), hsnSac, qty, unit: v.unit || "pcs", rate, taxRate });
  }
  const rounded = computeInvoiceTotals(lines, { interstate, discount, roundToRupee: true });
  const exact = computeInvoiceTotals(lines, { interstate, discount, roundToRupee: false });
  if (rounded.discount < toPaise(discount)) return { error: "Discount is more than the subtotal" };
  let t = rounded;
  let warning: string | undefined;
  if (givenTotal !== null) {
    const want = toPaise(givenTotal);
    if (want === exact.total) t = exact;
    else if (want !== rounded.total) {
      const diff = Math.min(Math.abs(want - rounded.total), Math.abs(want - exact.total));
      if (diff > 100) return { error: `Total in the file is ₹${givenTotal} but the lines add up to ₹${fromPaise(rounded.total)} — check the rates and GST` };
      t = Math.abs(want - exact.total) < Math.abs(want - rounded.total) ? exact : rounded;
      warning = `total ₹${fromPaise(t.total)} differs from the file (₹${givenTotal}) by ₹${fromPaise(Math.abs(want - t.total))}`;
    }
  }
  return {
    mode: "lines",
    warning,
    lines: lines.map((l, i) => ({ ...l, taxableAmount: fromPaise(t.lines[i]!.taxablePaise), taxAmount: fromPaise(t.lines[i]!.taxPaise) })),
    totals: totalsColumns(interstate, t),
  };
}

/** Header-only invoice (Amount + Total tax) → one summary line, with the figures copied exactly. */
function buildSummaryDoc(
  v: Record<string, string>,
  interstate: boolean,
  givenTotal: string | null,
  rowCount: number,
): (Pick<Doc, "lines" | "totals" | "mode">) | { error: string } {
  if (rowCount > 1) return { error: "the same invoice number appears on several rows without line items" };
  if (givenTotal === null) return { error: "Amount (Total) is empty — needed when there are no line items" };
  const total = toPaise(givenTotal);
  const tax = v.totalTax ? toPaise(parseAmount(v.totalTax) ?? "x") : 0;
  if (Number.isNaN(tax) || (v.totalTax && parseAmount(v.totalTax) === null)) return { error: `Total tax “${v.totalTax}” is not an amount` };
  const taxable = total - tax;
  if (taxable < 0) return { error: "Total tax is more than the amount" };
  let rate = 0;
  if (taxable > 0 && tax > 0) {
    const exactRate = (tax / taxable) * 100;
    const std = STANDARD_GST.find((s) => Math.abs(s - exactRate) < 0.05);
    if (std === undefined) return { error: `GST is ${exactRate.toFixed(2)}% of the taxable amount — the invoice mixes GST rates, so it needs line items` };
    rate = std;
  } else if (tax > 0) return { error: "Total tax without a taxable amount" };
  const cgst = interstate ? 0 : Math.floor(tax / 2);
  const sgst = interstate ? 0 : tax - cgst;
  return {
    mode: "summary",
    lines: [{ itemId: null, description: "Invoice total (imported)", hsnSac: null, qty: "1", unit: "nos", rate: fromPaise(taxable), taxRate: String(rate), taxableAmount: fromPaise(taxable), taxAmount: fromPaise(tax) }],
    totals: { isInterstate: interstate, subtotal: fromPaise(taxable), discount: "0.00", cgst: fromPaise(cgst), sgst: fromPaise(sgst), igst: fromPaise(interstate ? tax : 0), roundOff: "0.00", total: fromPaise(total) },
  };
}

function totalsColumns(interstate: boolean, t: ReturnType<typeof computeInvoiceTotals>): Doc["totals"] {
  return {
    isInterstate: interstate,
    subtotal: fromPaise(t.subtotal),
    discount: fromPaise(t.discount),
    cgst: fromPaise(t.cgst),
    sgst: fromPaise(t.sgst),
    igst: fromPaise(t.igst),
    roundOff: fromPaise(t.roundOff),
    total: fromPaise(t.total),
  };
}
