import { mulPaise, toPaise } from "./money";

export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu & Kashmir" }, { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" }, { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" }, { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" }, { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" }, { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" }, { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" }, { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" }, { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" }, { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" }, { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" }, { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" }, { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" }, { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" }, { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" }, { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" }, { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman & Nicobar Islands" }, { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" }, { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
];

export function stateName(code: string | null | undefined): string {
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? "";
}

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Validates GSTIN format and its mod-36 checksum digit. */
export function isValidGstin(gstin: string): boolean {
  const g = gstin.trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(g[i]!);
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  const check = GSTIN_CHARS[(36 - (sum % 36)) % 36];
  return g[14] === check;
}

export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  const m = gstin?.trim().match(/^(\d{2})/);
  return m ? m[1]! : null;
}

export type LineInput = { qty: string | number; rate: string | number; taxRate: string | number };

export type LineTotals = { taxablePaise: number; taxPaise: number };

export type InvoiceTotals = {
  lines: LineTotals[];
  subtotal: number;
  discount: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
};

/**
 * Computes GST invoice totals in paise.
 * - Intra-state supply → tax split equally into CGST + SGST.
 * - Inter-state supply → IGST.
 * - Discount is applied proportionally to taxable values before tax.
 * - Total is rounded to the nearest rupee; the difference is reported as round-off.
 */
export function computeInvoiceTotals(
  lines: LineInput[],
  opts: { interstate: boolean; discount?: string | number; roundToRupee?: boolean },
): InvoiceTotals {
  const gross = lines.map((l) => mulPaise(toPaise(l.rate), l.qty));
  const grossSum = gross.reduce((a, b) => a + b, 0);
  const discount = Math.min(toPaise(opts.discount ?? 0), grossSum);

  // Allocate the discount across lines; the last line absorbs rounding remainder.
  let allocated = 0;
  const taxable = gross.map((g, i) => {
    if (grossSum === 0) return g;
    const share = i === gross.length - 1 ? discount - allocated : Math.round((discount * g) / grossSum);
    allocated += share;
    return g - share;
  });

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const lineTotals = taxable.map((t, i) => {
    const rate = Number(lines[i]!.taxRate);
    if (opts.interstate) {
      const tax = mulPaise(t, rate / 100);
      igst += tax;
      return { taxablePaise: t, taxPaise: tax };
    }
    const half = mulPaise(t, rate / 200);
    cgst += half;
    sgst += half;
    return { taxablePaise: t, taxPaise: half * 2 };
  });

  const subtotal = grossSum;
  const exact = subtotal - discount + cgst + sgst + igst;
  const total = opts.roundToRupee === false ? exact : Math.round(exact / 100) * 100;
  return { lines: lineTotals, subtotal, discount, cgst, sgst, igst, roundOff: total - exact, total };
}

/** Indian financial year label, e.g. 2026-10-12 → "2026-27". */
export function financialYear(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number) as [number, number];
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
