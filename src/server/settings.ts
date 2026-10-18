import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { DEFAULT_NUMBER_FORMATS, formatDocNumber, seriesKey, type DocType } from "@/lib/numbering";

export type CompanySettings = {
  name: string;
  legalName: string;
  gstin: string;
  pan: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  numberFormats: Record<DocType, string>;
  invoiceTerms: string;
  quotationTerms: string;
  quotationValidDays: number;
  creditNoteTerms: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  upiId: string;
  taxRates: number[];
};

export const DEFAULT_COMPANY: CompanySettings = {
  name: "Tiruppur Embossing",
  legalName: "Tiruppur Embossing",
  gstin: "",
  pan: "",
  address: "Ammapalayam",
  city: "Tiruppur",
  state: "Tamil Nadu",
  stateCode: "33",
  pincode: "",
  phone: "+91 98403 37054",
  email: "tiruppurembossing@gmail.com",
  website: "www.tiruppurembossing.com",
  numberFormats: { ...DEFAULT_NUMBER_FORMATS },
  invoiceTerms: "Goods once processed will not be taken back. Subject to Tiruppur jurisdiction.",
  quotationTerms: "Prices valid till the date shown. GST extra as applicable. Delivery after artwork and sample approval.",
  quotationValidDays: 7,
  creditNoteTerms: "",
  bankName: "",
  bankAccount: "",
  bankIfsc: "",
  upiId: "",
  taxRates: [0, 5, 12, 18, 28, 40],
};

export async function getCompany(): Promise<CompanySettings> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "company") });
  const saved = (row?.value as Partial<CompanySettings>) ?? {};
  return { ...DEFAULT_COMPANY, ...saved, numberFormats: { ...DEFAULT_NUMBER_FORMATS, ...(saved.numberFormats ?? {}) } };
}

export async function saveCompany(value: CompanySettings) {
  await db
    .insert(schema.settings)
    .values({ key: "company", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
}

/** Atomically takes the next number of a series (row-locked upsert). */
export async function nextNumber(tx: Tx, key: string): Promise<number> {
  const rows = await tx
    .insert(schema.numberSeries)
    .values({ key, next: 2 })
    .onConflictDoUpdate({ target: schema.numberSeries.key, set: { next: sql`${schema.numberSeries.next} + 1` } })
    .returning({ next: schema.numberSeries.next });
  return rows[0]!.next - 1;
}

/** Takes the next document number for a doc type, formatted with the company's template. */
export async function assignDocNumber(tx: Tx, doc: DocType, isoDate: string): Promise<string> {
  const company = await getCompany();
  const template = company.numberFormats[doc];
  const seq = await nextNumber(tx, seriesKey(doc, template, isoDate));
  return formatDocNumber(template, isoDate, seq);
}

/** The number the next document will get (for the settings screen). */
export async function peekNextNumber(doc: DocType, isoDate: string): Promise<number> {
  const company = await getCompany();
  const row = await db.query.numberSeries.findFirst({ where: eq(schema.numberSeries.key, seriesKey(doc, company.numberFormats[doc], isoDate)) });
  return row?.next ?? 1;
}

/** Lets an admin continue numbering from the old system (e.g. next quotation = 262). Never moves backwards. */
export async function setNextNumber(doc: DocType, isoDate: string, next: number) {
  const company = await getCompany();
  const key = seriesKey(doc, company.numberFormats[doc], isoDate);
  await db
    .insert(schema.numberSeries)
    .values({ key, next })
    .onConflictDoUpdate({ target: schema.numberSeries.key, set: { next: sql`greatest(${schema.numberSeries.next}, ${next})` } });
}
