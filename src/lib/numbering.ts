import { financialYear } from "./gst";

export type DocType = "invoice" | "proforma" | "quotation" | "credit_note";

export const DEFAULT_NUMBER_FORMATS: Record<DocType, string> = {
  invoice: "TE-{FYS}-SI-{SEQ:6}",
  proforma: "TE-{FYS}-PI-{SEQ:6}",
  quotation: "QUOTATION-{SEQ:6}",
  credit_note: "CN-{SEQ:6}",
};

const TOKEN = /\{(FY|FYS|SEQ(?::(\d))?)\}/g;

/**
 * Number templates. Tokens:
 *   {FY}    financial year, e.g. 2025-26
 *   {FYS}   short financial year, e.g. 25-26
 *   {SEQ:n} running number padded to n digits (default 4)
 * A template containing {FY}/{FYS} restarts numbering every financial year.
 */
export function isValidFormat(template: string): boolean {
  return template.length <= 40 && /\{SEQ(?::\d)?\}/.test(template) && !/[^A-Za-z0-9\-_/{}:]/.test(template);
}

export function resetsYearly(template: string): boolean {
  return /\{FYS?\}/.test(template);
}

/** Key in number_series for this doc type + date (per-FY when the template is yearly). */
export function seriesKey(doc: DocType, template: string, isoDate: string): string {
  return resetsYearly(template) ? `${doc}:${financialYear(isoDate)}` : doc;
}

export function formatDocNumber(template: string, isoDate: string, seq: number): string {
  const fy = financialYear(isoDate); // 2025-26
  const [a, b] = fy.split("-") as [string, string];
  return template.replace(TOKEN, (_m, token: string, pad?: string) => {
    if (token === "FY") return fy;
    if (token === "FYS") return `${a.slice(2)}-${b}`;
    return String(seq).padStart(Number(pad ?? 4), "0");
  });
}
