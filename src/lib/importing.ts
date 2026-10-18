import { parseCsv } from "./csv";
import { parseBankAmount, parseBankDate } from "./bank-statement";
import { INDIAN_STATES } from "./gst";
import { PAYMENT_MODES } from "./invoice-status";
import { QUOTATION_STATUSES } from "./doc-status";
import type { Permission } from "./permissions";

/**
 * CSV import definitions for every module that supports "Import": the columns each file may
 * have, a sample file, and pure value parsers. The server side lives in src/server/importers.ts.
 * Pure — no DB access.
 */

export type ImportColumn = { key: string; label: string; required?: boolean; aliases?: string[]; hint: string };

export type ImportEntity =
  | "customers" | "contacts" | "items" | "vendors" | "expense_categories" | "invoices" | "payments" | "quotations" | "proforma";

export type ImportDef = {
  title: string;
  /** List page to return to. */
  back: string;
  permission: Permission;
  /** Custom-field entity whose fields can be filled from extra columns (matched by field label). */
  customFields?: "customers" | "contacts" | "invoices" | "payments" | "quotations" | "proforma_invoices";
  /** One CSV row per document line; rows with the same number form one document. */
  linesPerRow?: boolean;
  columns: ImportColumn[];
  sample: string[][];
  notes: string[];
};

const CUSTOMER_REF = "Company name exactly as in Customers, or its GSTIN";

const LINE_COLUMNS: ImportColumn[] = [
  { key: "description", label: "Description", required: true, aliases: ["item", "item description", "line description"], hint: "Line item. Linked to the item with the same name in Items, if any" },
  { key: "hsnSac", label: "HSN/SAC", aliases: ["hsn", "sac", "hsn code"], hint: "4–8 digits; taken from the item when empty" },
  { key: "qty", label: "Qty", required: true, aliases: ["quantity"], hint: "Quantity, e.g. 500" },
  { key: "unit", label: "Unit", hint: "pcs, mtr, kg … (default pcs)" },
  { key: "rate", label: "Rate", required: true, aliases: ["price", "unit price"], hint: "Rate per unit before GST" },
  { key: "taxRate", label: "GST %", required: true, aliases: ["gst", "gst rate", "tax", "tax rate", "tax %"], hint: "0, 5, 12, 18 or 28" },
];

/** Invoice files may instead carry only totals (Perfex "Invoices" list export): no line columns required. */
const OPTIONAL_LINES = LINE_COLUMNS.map((c) => ({ ...c, required: false }));

const DOC_TAIL: ImportColumn[] = [
  { key: "placeOfSupply", label: "Place of supply", aliases: ["state", "pos"], hint: "State name or GST code (33 = Tamil Nadu). Default: the customer's state" },
  { key: "discount", label: "Discount", hint: "Discount amount for the whole document (first row of the document)" },
  { key: "notes", label: "Notes", hint: "Shown on the document (first row)" },
  { key: "terms", label: "Terms", aliases: ["terms & conditions", "terms and conditions"], hint: "Terms & conditions (first row)" },
  { key: "total", label: "Total", aliases: ["grand total", "invoice total"], hint: "Optional check: the import stops that document if our GST total differs by more than ₹1" },
];

const SUMMARY_COLUMNS: ImportColumn[] = [
  { key: "totalTax", label: "Total tax", aliases: ["tax amount", "gst amount", "total gst"], hint: "Summary files only: GST of the whole invoice" },
];

export const IMPORT_DEFS: Record<ImportEntity, ImportDef> = {
  customers: {
    title: "Import customers",
    back: "/customers",
    permission: "customers.create",
    customFields: "customers",
    columns: [
      { key: "company", label: "Company", required: true, aliases: ["company name", "customer", "customer name", "name"], hint: "Customer / company name" },
      { key: "gstin", label: "GSTIN", aliases: ["gst number", "gst no", "vat", "vat number"], hint: "15 characters; the state is taken from it" },
      { key: "pan", label: "PAN", hint: "ABCDE1234F" },
      { key: "phone", label: "Phone", aliases: ["phone number", "mobile"], hint: "Main phone" },
      { key: "email", label: "Email", hint: "Main email" },
      { key: "website", label: "Website", hint: "" },
      { key: "address", label: "Address", aliases: ["billing address", "street"], hint: "Street address" },
      { key: "city", label: "City", hint: "" },
      { key: "state", label: "State", hint: "State name or GST code. Not needed when GSTIN is given" },
      { key: "pincode", label: "PIN", aliases: ["pincode", "pin code", "zip", "zip code", "postal code"], hint: "" },
      { key: "groups", label: "Groups", aliases: ["group", "customer groups"], hint: "Separate several with ; (e.g. Exporter; VIP)" },
      { key: "paymentTermsDays", label: "Payment terms", aliases: ["payment terms days", "credit days"], hint: "Days, default 30" },
      { key: "creditLimit", label: "Credit limit", hint: "Amount, default 0" },
      { key: "active", label: "Active", hint: "Yes / No (default Yes)" },
      { key: "contactName", label: "Contact name", aliases: ["primary contact", "contact"], hint: "Creates the primary contact" },
      { key: "contactEmail", label: "Contact email", hint: "" },
      { key: "contactPhone", label: "Contact phone", hint: "" },
    ],
    sample: [
      ["Company", "GSTIN", "Phone", "Email", "Address", "City", "State", "PIN", "Groups", "Payment terms", "Contact name", "Contact phone"],
      ["Sri Murugan Knits", "", "+91 98430 11111", "accounts@murugan.example", "12 Kumaran Road", "Tiruppur", "Tamil Nadu", "641601", "Exporter; VIP", "30", "Ramesh", "+91 98430 11112"],
      ["Bengaluru Sportswear Co", "", "+91 98450 33333", "", "", "Bengaluru", "Karnataka", "560001", "Sportswear", "45", "", ""],
    ],
    notes: ["Customers whose GSTIN or company name already exists are skipped.", "Extra columns named like a customer custom field fill that field."],
  },
  contacts: {
    title: "Import contacts",
    back: "/customers",
    permission: "customers.edit",
    customFields: "contacts",
    columns: [
      { key: "customer", label: "Customer", required: true, aliases: ["company", "company name", "customer gstin"], hint: CUSTOMER_REF },
      { key: "name", label: "Name", required: true, aliases: ["contact name", "full name", "firstname"], hint: "Contact person" },
      { key: "title", label: "Title", aliases: ["position", "designation"], hint: "e.g. Purchase manager" },
      { key: "email", label: "Email", hint: "" },
      { key: "phone", label: "Phone", aliases: ["phone number", "mobile"], hint: "" },
      { key: "whatsapp", label: "WhatsApp", hint: "" },
      { key: "isPrimary", label: "Primary", aliases: ["primary contact", "is primary"], hint: "Yes / No (default No)" },
    ],
    sample: [
      ["Customer", "Name", "Title", "Email", "Phone", "WhatsApp", "Primary"],
      ["Sri Murugan Knits", "Lakshmi", "Accounts", "lakshmi@murugan.example", "+91 98430 11113", "+91 98430 11113", "No"],
    ],
    notes: ["A contact with the same name or email on the same customer is skipped."],
  },
  items: {
    title: "Import items",
    back: "/items",
    permission: "items.manage",
    columns: [
      { key: "name", label: "Name", required: true, aliases: ["item", "item name", "description"], hint: "Process or product name" },
      { key: "description", label: "Description", aliases: ["long description"], hint: "" },
      { key: "hsnSac", label: "HSN/SAC", aliases: ["hsn", "sac", "hsn code"], hint: "4–8 digits" },
      { key: "unit", label: "Unit", hint: "pcs, mtr, kg … (default pcs)" },
      { key: "rate", label: "Rate", required: true, aliases: ["price", "unit price"], hint: "Default rate before GST" },
      { key: "taxRate", label: "GST %", required: true, aliases: ["gst", "gst rate", "tax", "tax rate"], hint: "0, 5, 12, 18 or 28" },
      { key: "active", label: "Active", hint: "Yes / No (default Yes)" },
    ],
    sample: [
      ["Name", "Description", "HSN/SAC", "Unit", "Rate", "GST %", "Active"],
      ["Silicon HD – Glossy", "Raised flexible print", "4908", "pcs", "16.00", "18", "Yes"],
      ["Embossing only", "Embossing press job work", "9988", "pcs", "8.00", "5", "Yes"],
    ],
    notes: ["Items whose name already exists are skipped."],
  },
  vendors: {
    title: "Import vendors",
    back: "/purchase/vendors",
    permission: "purchase.create",
    columns: [
      { key: "name", label: "Name", required: true, aliases: ["vendor", "vendor name", "company", "supplier"], hint: "Supplier name" },
      { key: "gstin", label: "GSTIN", aliases: ["gst number", "gst no"], hint: "" },
      { key: "phone", label: "Phone", aliases: ["mobile"], hint: "" },
      { key: "email", label: "Email", hint: "" },
      { key: "address", label: "Address", hint: "" },
      { key: "active", label: "Active", hint: "Yes / No (default Yes)" },
    ],
    sample: [
      ["Name", "GSTIN", "Phone", "Email", "Address", "Active"],
      ["HD Dyes", "", "+91 90000 00001", "", "Tiruppur", "Yes"],
    ],
    notes: ["Vendors whose GSTIN or name already exists are skipped."],
  },
  expense_categories: {
    title: "Import expense categories",
    back: "/settings/expense-categories",
    permission: "expense_categories.create",
    columns: [
      { key: "name", label: "Name", required: true, aliases: ["category", "category name"], hint: "Category name" },
      { key: "description", label: "Description", hint: "" },
      { key: "active", label: "Active", hint: "Yes / No (default Yes)" },
    ],
    sample: [["Name", "Description", "Active"], ["Fuel", "Petrol and diesel", "Yes"], ["Bank charges", "", "Yes"]],
    notes: ["Categories whose name already exists are skipped."],
  },
  invoices: {
    title: "Import invoices",
    back: "/invoices",
    permission: "invoices.create",
    customFields: "invoices",
    linesPerRow: true,
    columns: [
      { key: "number", label: "Invoice #", required: true, aliases: ["invoice number", "invoice no", "number"], hint: "Kept exactly as given. Repeat it on every line of the same invoice" },
      { key: "date", label: "Date", required: true, aliases: ["invoice date"], hint: "16-08-2026, 16/08/2026 or 16-Aug-2026" },
      { key: "dueDate", label: "Due date", aliases: ["due"], hint: "Default: date + the customer's payment terms" },
      { key: "customer", label: "Customer", required: true, aliases: ["company", "customer name", "client"], hint: CUSTOMER_REF },
      { key: "status", label: "Status", hint: "Issued / Unpaid (default), Paid, Draft or Cancelled. Paid records a full payment on the invoice date" },
      { key: "orderRef", label: "Order ref", aliases: ["po", "po number", "order", "order no"], hint: "Customer PO / order number" },
      { key: "tags", label: "Tags", hint: "Separate several with ;" },
      ...OPTIONAL_LINES,
      ...DOC_TAIL.map((c) => (c.key === "total" ? { ...c, aliases: [...(c.aliases ?? []), "amount"], hint: "Invoice total incl. GST. With line items it is a check (±₹1); in a summary file it is the amount" } : c)),
      ...SUMMARY_COLUMNS,
    ],
    sample: [
      ["Invoice #", "Date", "Customer", "Description", "HSN/SAC", "Qty", "Unit", "Rate", "GST %", "Total"],
      ["TE-25-26-SI-000101", "05-04-2025", "Sri Murugan Knits", "Silicon HD – Glossy", "4908", "500", "pcs", "16.00", "18", "10856.00"],
      ["TE-25-26-SI-000101", "05-04-2025", "Sri Murugan Knits", "Screen / die charges", "9988", "1", "nos", "750.00", "18", "10856.00"],
      ["TE-25-26-SI-000102", "07-04-2025", "Bengaluru Sportswear Co", "DTF printing", "4908", "300", "pcs", "14.00", "18", "4956.00"],
    ],
    notes: [
      "Either one row per line item (Description, Qty, Rate, GST %) — rows with the same Invoice # become one invoice —",
      "or one row per invoice with only Amount and Total tax (the Perfex Invoices list export, .xlsx or .csv): the invoice gets one summary line and its GST rate is worked out from the tax.",
      "Customers not found by name or GSTIN are created (name only) when “Create missing customers” is ticked.",
      "Invoices are saved with their own number. Invoice numbers that already exist are skipped.",
      "GST (CGST/SGST or IGST) and the rupee round-off are calculated like a new invoice. Fill Total to check them against the old system.",
      "Record payments afterwards with Payments → Import.",
      "Imported numbers do not move the numbering. Set the next number in Setup → Company.",
    ],
  },
  payments: {
    title: "Import payments",
    back: "/payments",
    permission: "payments.create",
    customFields: "payments",
    columns: [
      { key: "invoice", label: "Invoice #", required: true, aliases: ["invoice number", "invoice no", "invoice"], hint: "Number of an issued invoice" },
      { key: "date", label: "Date", required: true, aliases: ["payment date"], hint: "16-08-2026, 16/08/2026 or 16-Aug-2026" },
      { key: "amount", label: "Amount", required: true, aliases: ["amount received", "payment amount"], hint: "Cannot exceed the invoice balance" },
      { key: "mode", label: "Mode", aliases: ["payment mode", "payment method"], hint: "Bank, UPI, Cash, Cheque or Card (default Bank)" },
      { key: "reference", label: "Reference", aliases: ["transaction id", "utr", "reference no", "cheque no"], hint: "UTR / cheque number" },
      { key: "note", label: "Note", aliases: ["notes"], hint: "" },
    ],
    sample: [
      ["Invoice #", "Date", "Amount", "Mode", "Reference", "Note"],
      ["TE-25-26-SI-000101", "20-04-2025", "10856.00", "Bank", "UTR123456789", ""],
      ["TE-25-26-SI-000102", "25-04-2025", "2000.00", "UPI", "UPI-622599144778", "Part payment"],
    ],
    notes: ["A payment with the same invoice, date, amount and reference is skipped."],
  },
  quotations: {
    title: "Import quotations",
    back: "/quotations",
    permission: "quotations.create",
    customFields: "quotations",
    linesPerRow: true,
    columns: [
      { key: "number", label: "Quotation #", required: true, aliases: ["number", "quotation number", "estimate number", "estimate #"], hint: "Kept exactly as given. Repeat it on every line" },
      { key: "date", label: "Date", required: true, hint: "16-08-2026, 16/08/2026 or 16-Aug-2026" },
      { key: "customer", label: "Customer", aliases: ["company", "client"], hint: `${CUSTOMER_REF}. Leave empty for a prospect and fill To` },
      { key: "toName", label: "To", aliases: ["to name", "prospect"], hint: "Who it is for, when there is no customer" },
      { key: "subject", label: "Subject", hint: "Default: the first line's description" },
      { key: "status", label: "Status", hint: "Draft, Sent, Open, Revised, Declined or Accepted (default Sent)" },
      { key: "openTill", label: "Open till", aliases: ["valid till", "expiry date"], hint: "" },
      ...LINE_COLUMNS,
      ...DOC_TAIL,
    ],
    sample: [
      ["Quotation #", "Date", "Customer", "Subject", "Status", "Description", "Qty", "Rate", "GST %"],
      ["QUOTATION-000250", "02-09-2026", "Sri Murugan Knits", "Silicon HD for SS27", "Sent", "Silicon HD – Glossy", "1000", "15.50", "18"],
    ],
    notes: ["One row per line item. Rows with the same number become one quotation.", "Numbers that already exist are skipped."],
  },
  proforma: {
    title: "Import proforma invoices",
    back: "/proforma-invoices",
    permission: "proforma_invoices.create",
    customFields: "proforma_invoices",
    linesPerRow: true,
    columns: [
      { key: "number", label: "Proforma #", required: true, aliases: ["number", "proforma number", "proforma invoice #"], hint: "Kept exactly as given. Repeat it on every line" },
      { key: "date", label: "Date", required: true, hint: "16-08-2026, 16/08/2026 or 16-Aug-2026" },
      { key: "customer", label: "Customer", required: true, aliases: ["company", "client"], hint: CUSTOMER_REF },
      { key: "subject", label: "Subject", hint: "Default: the first line's description" },
      { key: "status", label: "Status", hint: "Draft, Sent, Open, Revised, Declined or Accepted (default Sent)" },
      { key: "openTill", label: "Open till", aliases: ["valid till"], hint: "" },
      ...LINE_COLUMNS,
      ...DOC_TAIL,
    ],
    sample: [
      ["Proforma #", "Date", "Customer", "Description", "Qty", "Rate", "GST %"],
      ["TE-26-27-PI-000005", "10-09-2026", "Sri Murugan Knits", "DTF printing", "200", "14.00", "18"],
    ],
    notes: ["One row per line item. Rows with the same number become one proforma invoice.", "Numbers that already exist are skipped."],
  },
};

export function isImportEntity(v: string): v is ImportEntity {
  return Object.hasOwn(IMPORT_DEFS, v);
}

/** CSV text → rows for readImportFile. */
export const csvTable = (text: string) => parseCsv(text, { keepBlankLines: true });

export function sampleCsv(entity: ImportEntity): string {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return IMPORT_DEFS[entity].sample.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

// ─── Reading a file ──────────────────────────────────────────────────────────

export type ImportRow = { line: number; values: Record<string, string>; extra: Record<string, string> };
export type ImportFile =
  | { ok: true; rows: ImportRow[]; ignored: string[] }
  | { ok: false; error: string };

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9%]/g, "");

/**
 * Matches the header row to the definition's columns (case, spaces and punctuation ignored; known
 * aliases accepted). `extraLabels` (custom field labels) are kept in `extra`; other columns are ignored.
 */
export function readImportFile(table: string[][], columns: ImportColumn[], extraLabels: string[] = []): ImportFile {
  const all = table;
  if (!all.some((r) => r.some((c) => (c ?? "").trim() !== ""))) return { ok: false, error: "The file is empty." };

  const byName = new Map<string, string>();
  for (const c of columns) for (const n of [c.label, c.key, ...(c.aliases ?? [])]) if (!byName.has(norm(n))) byName.set(norm(n), c.key);
  // The heading row is the one (within the first 10) naming the most known columns — exports often start with a title row
  let headerIdx = -1;
  let best = 0;
  all.slice(0, 10).forEach((r, i) => {
    const hits = new Set(r.map((h) => byName.get(norm(h ?? ""))).filter(Boolean)).size;
    if (hits > best) [best, headerIdx] = [hits, i];
  });
  if (headerIdx < 0) return { ok: false, error: "No heading row found. The first row must name the columns — download the sample file to see them." };
  const header = all[headerIdx]!.map((h) => (h ?? "").trim());
  const extraByName = new Map(extraLabels.map((l) => [norm(l), l]));

  const colKey: (string | null)[] = [];
  const extraKey: (string | null)[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();
  header.forEach((h) => {
    const key = byName.get(norm(h)) ?? null;
    if (key && !seen.has(key)) {
      seen.add(key);
      colKey.push(key);
      extraKey.push(null);
    } else {
      colKey.push(null);
      const extra = !key ? (extraByName.get(norm(h)) ?? null) : null;
      extraKey.push(extra);
      if (!extra && h) ignored.push(h);
    }
  });
  const missing = columns.filter((c) => c.required && !seen.has(c.key)).map((c) => c.label);
  if (missing.length) return { ok: false, error: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the sample file to see the headings.` };

  const rows: ImportRow[] = [];
  all.slice(headerIdx + 1).forEach((r, i) => {
    if (!r.some((c) => (c ?? "").trim() !== "")) return;
    const values: Record<string, string> = {};
    const extra: Record<string, string> = {};
    r.forEach((cell, j) => {
      const v = (cell ?? "").trim().replace(/^'(?=[=+\-@])/, ""); // undo spreadsheet formula escaping
      if (colKey[j]) values[colKey[j]!] = v;
      else if (extraKey[j]) extra[extraKey[j]!] = v;
    });
    rows.push({ line: headerIdx + i + 2, values, extra });
  });
  if (rows.length === 0) return { ok: false, error: "No rows found below the heading row." };
  return { ok: true, rows, ignored };
}

// ─── Value parsers ───────────────────────────────────────────────────────────

/** "1,23,456.70" / "₹500" / "Rs. 500" → "123456.70"; null when empty or not a number. */
export const parseAmount = (v: string | undefined): string | null => (v ? parseBankAmount(v) : null);

/** 16-08-2026, 16/08/2026, 16-Aug-2026, 2026-08-16 (time part ignored) → ISO date. */
export function parseDate(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  // Excel serial day when the cell was not formatted as a date (20000 = 1954, 80000 = 2119)
  if (/^\d{5}(\.\d+)?$/.test(s) && Number(s) >= 20000 && Number(s) <= 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 864e5).toISOString().slice(0, 10);
  }
  return parseBankDate(s.replace(/T.*$/, ""));
}

/** "18", "18%", "18.00" → "18"; null when not 0–100. */
export function parsePercent(v: string | undefined): string | null {
  const s = (v ?? "").trim().replace(/%$/, "").trim();
  if (!/^\d+(\.\d+)?$/.test(s) || Number(s) > 100) return null;
  return String(Number(s));
}

/** Positive quantity with up to 3 decimals; null otherwise. */
export function parseQty(v: string | undefined): string | null {
  const s = (v ?? "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(s) || Number(s) <= 0) return null;
  return s;
}

/** Yes/No, Y/N, True/False, 1/0, Active/Inactive; `fallback` when empty, null when unrecognised. */
export function parseYesNo(v: string | undefined, fallback: boolean): boolean | null {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return fallback;
  if (["yes", "y", "true", "1", "active", "on"].includes(s)) return true;
  if (["no", "n", "false", "0", "inactive", "off", "hidden"].includes(s)) return false;
  return null;
}

/** "33", "Tamil Nadu", "33-Tamil Nadu", "TN" is not supported → GST state code or null. */
export function parseStateCode(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const code = /^(\d{1,2})\b/.exec(s)?.[1]?.padStart(2, "0");
  if (code && INDIAN_STATES.some((st) => st.code === code)) return code;
  const n = norm(s.replace(/^\d+\s*[-–:]?\s*/, ""));
  return INDIAN_STATES.find((st) => norm(st.name) === n || norm(st.name.replace("&", "and")) === n)?.code ?? null;
}

/** Bank transfer / NEFT / RTGS / IMPS → bank, UPI / GPay → upi, … ; "bank" when empty, null when unknown. */
export function parsePaymentMode(v: string | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return "bank";
  if (PAYMENT_MODES.some((m) => m.value === s)) return s;
  if (/neft|rtgs|imps|bank|transfer|online/.test(s)) return "bank";
  if (/upi|gpay|google pay|phonepe|paytm/.test(s)) return "upi";
  if (/cash/.test(s)) return "cash";
  if (/che(que|ck)|chq|dd|demand draft/.test(s)) return "cheque";
  if (/card|credit|debit|pos/.test(s)) return "card";
  return null;
}

/** Perfex/TE-CRM invoice status → stored status; "paid" also asks for a full payment on import. */
export function parseInvoiceStatus(v: string | undefined): { status: "issued" | "draft" | "cancelled"; paid: boolean } | null {
  const s = (v ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!s || ["issued", "unpaid", "partially paid", "overdue", "sent", "due"].includes(s)) return { status: "issued", paid: false };
  if (s === "paid") return { status: "issued", paid: true };
  if (s === "draft") return { status: "draft", paid: false };
  if (["cancelled", "canceled", "void"].includes(s)) return { status: "cancelled", paid: false };
  return null;
}

export function parseQuotationStatus(v: string | undefined): (typeof QUOTATION_STATUSES)[number] | null {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return "sent";
  if (s === "expired") return "open";
  return (QUOTATION_STATUSES as readonly string[]).includes(s) ? (s as (typeof QUOTATION_STATUSES)[number]) : null;
}

/** "Exporter; VIP" or "Exporter, VIP" → unique trimmed list. */
export function parseList(v: string | undefined): string[] {
  return [...new Set((v ?? "").split(/[;,|]/).map((s) => s.trim()).filter(Boolean))].slice(0, 20);
}

/** Groups rows of a lines-per-row file by document number, keeping file order. */
export function groupByNumber(rows: ImportRow[]): { number: string; rows: ImportRow[] }[] {
  const groups = new Map<string, ImportRow[]>();
  for (const r of rows) {
    const n = (r.values.number ?? "").trim();
    const key = n.toUpperCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return [...groups.entries()].map(([, rs]) => ({ number: rs[0]!.values.number!.trim(), rows: rs }));
}
