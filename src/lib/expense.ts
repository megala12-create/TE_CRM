import { mulPaise, toPaise } from "./money";

export type TaxOption = { value: string; label: string; name: string; rate: number };

/**
 * Tax choices for expenses, built from the company's GST rates:
 * full GST / IGST at each rate, plus the CGST and SGST halves so that
 * Tax 1 = CGST 9% and Tax 2 = SGST 9% can be recorded separately.
 */
export function expenseTaxOptions(gstRates: number[]): TaxOption[] {
  const out: TaxOption[] = [];
  for (const r of [...gstRates].filter((r) => r > 0).sort((a, b) => a - b)) {
    const half = r / 2;
    out.push(
      { value: `GST@${r}`, label: `GST ${r}%`, name: "GST", rate: r },
      { value: `IGST@${r}`, label: `IGST ${r}%`, name: "IGST", rate: r },
      { value: `CGST@${half}`, label: `CGST ${half}%`, name: "CGST", rate: half },
      { value: `SGST@${half}`, label: `SGST ${half}%`, name: "SGST", rate: half },
    );
  }
  return out;
}

export function parseTaxValue(v: string): { name: string; rate: number } | null {
  const m = /^(GST|IGST|CGST|SGST)@(\d+(?:\.\d+)?)$/.exec(v);
  return m ? { name: m[1]!, rate: Number(m[2]) } : null;
}

/** Tax is added on top of the amount (as in the previous CRM). All values in paise. */
export function expenseTotals(amount: string, taxRates: number[]) {
  const amountPaise = toPaise(amount);
  const taxPaise = taxRates.reduce((sum, r) => sum + mulPaise(amountPaise, r / 100), 0);
  return { amountPaise, taxPaise, totalPaise: amountPaise + taxPaise };
}

export { REPEAT_OPTIONS, repeatLabel, nextOccurrence } from "./recurrence";
