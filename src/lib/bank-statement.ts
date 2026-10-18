import { parseCsv } from "./csv";

/**
 * Expense import template (any order; headings matched ignoring case, spaces and punctuation):
 *   Sl. No. | Value Date | Description | Chq /Ref No. | Amount | Category
 * Category is optional (column and cell); it is matched by name to the company's expense categories.
 * Every row is one expense dated by its Value Date. Pure — no DB access.
 */
export const IMPORT_COLUMNS = ["Sl. No.", "Value Date", "Description", "Chq /Ref No.", "Amount", "Category"] as const;

export type StatementRow = {
  line: number; // line number in the file (1-based), for messages
  slNo: string;
  date: string; // ISO value date
  description: string;
  reference: string;
  amount: string; // rupees, 2 decimals
  category: string; // category name as written in the file ("" when blank)
};

export type StatementParse = { rows: StatementRow[]; errors: string[]; headerLine: number };

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");
const KEYS: Record<string, (typeof IMPORT_COLUMNS)[number]> = {
  slno: "Sl. No.",
  valuedate: "Value Date",
  description: "Description",
  chqrefno: "Chq /Ref No.",
  amount: "Amount",
  category: "Category",
};
const OPTIONAL = new Set(["category"]);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Bank date formats: 16-08-2026, 16/08/2026, 16-08-26, 16-Aug-2026, 16 Aug 2026, 2026-08-16. */
export function parseBankDate(v: string): string | null {
  const s = v.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i, "");
  let d: number, m: number, y: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/.exec(s))) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ,]+(\d{2}|\d{4})$/.exec(s))) {
    d = Number(r[1]);
    m = MONTHS.indexOf(r[2]!.toLowerCase()) + 1;
    y = Number(r[3]);
    if (m === 0) return null;
  } else return null;
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** "1,23,456.70" / "Rs. 500" / "(500.00)" → "123456.70"; null when not a number. */
export function parseBankAmount(v: string): string | null {
  const s = v.trim().replace(/^rs\.?\s*/i, "").replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "$1").replace(/^-/, "");
  if (s === "" || !/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s).toFixed(2);
}

export function parseBankStatement(text: string): StatementParse {
  const all = parseCsv(text, { keepBlankLines: true }); // keep blank lines so line numbers match the file
  const headerIdx = all.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIdx < 0) return { rows: [], errors: ["The file is empty."], headerLine: 0 };
  const header = all[headerIdx]!.map((h) => h.trim()).filter((h, i, arr) => h !== "" || i < arr.length - 1);
  const keys = header.map(norm);
  const missing = Object.entries(KEYS).filter(([k]) => !OPTIONAL.has(k) && !keys.includes(k)).map(([, label]) => label);
  const extra = header.filter((h, i) => !Object.hasOwn(KEYS, keys[i]!) && h !== "");
  const dupes = Object.values(KEYS).filter((label) => keys.filter((k) => KEYS[k] === label).length > 1);
  if (missing.length || extra.length || dupes.length) {
    const parts = [
      missing.length ? `missing: ${missing.join(", ")}` : "",
      extra.length ? `not allowed: ${extra.join(", ")}` : "",
      dupes.length ? `repeated: ${dupes.join(", ")}` : "",
    ].filter(Boolean);
    return {
      rows: [],
      errors: [`The first row must have exactly these columns: ${IMPORT_COLUMNS.join(" | ")} (${parts.join("; ")}).`],
      headerLine: headerIdx + 1,
    };
  }
  const col = (k: string) => keys.indexOf(k);
  const cell = (r: string[], k: string) => (col(k) < 0 ? "" : (r[col(k)] ?? "").trim());
  const rows: StatementRow[] = [];
  const errors: string[] = [];

  all.slice(headerIdx + 1).forEach((r, idx) => {
    const line = headerIdx + idx + 2;
    if (!r.some((c) => c.trim() !== "")) return; // blank line
    const rawDate = cell(r, "valuedate");
    const rawAmount = cell(r, "amount");
    const description = cell(r, "description").replace(/\s+/g, " ");
    // Total / closing-balance lines without a date and amount are skipped quietly
    if (!rawDate && !/\d/.test(cell(r, "slno"))) return;
    const date = parseBankDate(rawDate);
    if (!date) {
      errors.push(`Line ${line}: invalid Value Date "${rawDate}"`);
      return;
    }
    const amount = parseBankAmount(rawAmount);
    if (!amount || Number(amount) <= 0) {
      errors.push(`Line ${line}: invalid Amount "${rawAmount}"`);
      return;
    }
    if (!description) {
      errors.push(`Line ${line}: Description is empty`);
      return;
    }
    rows.push({ line, slNo: cell(r, "slno"), date, description, reference: cell(r, "chqrefno").replace(/^'/, ""), amount, category: cell(r, "category").replace(/\s+/g, " ") });
  });
  return { rows, errors, headerLine: headerIdx + 1 };
}

/** Payment mode from the bank narration. */
export function paymentModeFromNarration(description: string, reference: string): "upi" | "bank" | "cheque" | "cash" | "card" {
  const d = description.toUpperCase();
  if (/\bUPI\b|UPI\/|@/.test(d)) return "upi";
  if (/\b(ATM|CASH WDL|CSH WDL|CASH WITHDRAWAL|SELF)\b/.test(d)) return "cash";
  if (/\b(CHQ|CHEQUE|CLG|CLEARING)\b/.test(d) || /^\d{6}$/.test(reference.trim())) return "cheque";
  if (/\b(POS|ECOM|CARD|VISA|MASTER|RUPAY)\b/.test(d)) return "card";
  return "bank";
}

/** Keyword hints → words that appear in category names (matched against the company's own categories). */
const HINTS: [RegExp, string[]][] = [
  [/\b(SALARY|SAL|WAGES|PAYROLL|ADVANCE)\b/, ["salary", "advance", "wages"]],
  [/\b(PETROL|DIESEL|FUEL|HPCL|BPCL|IOCL|INDIAN OIL|HP PAY|BHARAT PETROLEUM)\b/, ["petrol", "fuel"]],
  [/\b(RENT)\b/, ["rent"]],
  [/\b(TNEB|TANGEDCO|EB BILL|ELECTRICITY|POWER)\b/, ["electricity", "eb"]],
  [/\b(GST|GSTN|TDS|INCOME TAX|ITD|CBDT|AUDIT)\b/, ["gst", "audit", "tax"]],
  [/\b(AIRTEL|JIO|BSNL|ACT FIBERNET|BROADBAND|INTERNET|VODAFONE|VI )\b/, ["internet", "phone"]],
  [/\b(COURIER|TRANSPORT|LORRY|LOGISTICS|PARCEL|DTDC|BLUEDART|PROFESSIONAL COURIER)\b/, ["transport", "courier"]],
  [/\b(SWIGGY|ZOMATO|HOTEL|CANTEEN|TEA|SNACKS|FOOD)\b/, ["food", "canteen", "snacks"]],
  [/\b(STATIONERY|STATIONARY|XEROX|PRINTOUT)\b/, ["stationary", "stationery"]],
  [/\b(SERVICE|REPAIR|SPARES|MAINTENANCE)\b/, ["service", "maintenance"]],
  [/\b(JOB ?WORK)\b/, ["jobwork", "job work"]],
  [/\b(IRCTC|REDBUS|MAKEMYTRIP|TRAVEL|BUS|TRAIN|FLIGHT|UBER|OLA)\b/, ["travel"]],
  [/\b(INK|FILM|DYE|DYES|GEL|FOIL|SILICONE|TPU|ROLL|RAW)\b/, ["raw material", "raw materials"]],
];

/** Finds the category named in the file (case, spacing and punctuation ignored); null when blank or unknown. */
export function matchCategory(name: string, categories: { id: number; name: string }[]): number | null {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!n) return null;
  return categories.find((c) => c.name.toLowerCase().replace(/[^a-z0-9]/g, "") === n)?.id ?? null;
}

/** Suggests a category id for a narration using keyword hints; null when nothing matches. */
export function suggestCategory(description: string, categories: { id: number; name: string }[]): number | null {
  const d = ` ${description.toUpperCase()} `;
  for (const [re, words] of HINTS) {
    if (!re.test(d)) continue;
    const hit = categories.find((c) => words.some((w) => c.name.toLowerCase().includes(w)));
    if (hit) return hit.id;
  }
  // A category whose name appears in the narration ("... RENT AUG", "... SALARY")
  const direct = categories.find((c) => c.name.length >= 3 && d.includes(` ${c.name.toUpperCase()} `));
  return direct?.id ?? null;
}

/** Sample file in the bank format, for the "Download sample" button. */
export const BANK_SAMPLE_CSV = [
  "Sl. No.,Value Date,Description,Chq /Ref No.,Amount,Category",
  "1,16-08-2026,UPI/622812345678/SARAVANA/SALARY,622812345678,2250.00,Salary",
  "2,18-08-2026,UPI/622845678901/HD DYES/INK,622845678901,2242.00,Raw Materials",
  "3,20-08-2026,POS HPCL PETROL BUNK TIRUPPUR,,550.00,Petrol",
  '4,21-08-2026,CHQ PAID-RENT AUG-KUMAR,000123,"50,000.00",Rent',
].join("\r\n");
