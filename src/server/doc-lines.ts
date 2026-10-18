import "server-only";
import { z } from "zod";
import { computeInvoiceTotals, type InvoiceTotals } from "@/lib/gst";
import { fromPaise, toPaise } from "@/lib/money";
import { str } from "@/lib/utils";

const decimal = (max: number) =>
  z.string().trim().regex(/^\d+(\.\d+)?$/, "Enter a number").refine((v) => Number(v) <= max, "Too large");

export const lineSchema = z.object({
  itemId: z.coerce.number().int().positive().nullable(),
  description: z.string().trim().min(1, "Description is required").max(500),
  hsnSac: z.string().trim().max(10).nullable(),
  qty: decimal(1e9).refine((v) => Number(v) > 0, "Qty must be more than 0"),
  unit: z.string().trim().max(20).default("pcs"),
  rate: decimal(1e10),
  taxRate: decimal(100),
});
export type DocLine = z.infer<typeof lineSchema>;

/** Reads the `lines` JSON + `discount` fields posted by <LineItemsEditor>. */
export function parseDocLines(form: FormData):
  | { ok: true; lines: DocLine[]; discount: string }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  let raw: unknown;
  try {
    raw = JSON.parse(str(form, "lines") || "[]");
  } catch {
    raw = [];
  }
  const lines = z.array(lineSchema).min(1, "Add at least one line").max(200).safeParse(raw);
  if (!lines.success) errors.lines = lines.error.issues[0]?.message ?? "Check the line items";
  const discount = str(form, "discount") || "0";
  if (!/^\d+(\.\d{1,2})?$/.test(discount)) errors.discount = "Enter an amount";
  if (!lines.success || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, lines: lines.data, discount };
}

/** GST totals + the column values shared by invoices, quotations and credit notes. */
export function docTotals(lines: DocLine[], discount: string, interstate: boolean) {
  const totals = computeInvoiceTotals(lines, { interstate, discount });
  if (totals.discount < toPaise(discount)) {
    return { ok: false as const, errors: { discount: "Discount cannot exceed the subtotal" } as Record<string, string> };
  }
  return {
    ok: true as const,
    totals,
    columns: {
      isInterstate: interstate,
      subtotal: fromPaise(totals.subtotal),
      discount: fromPaise(totals.discount),
      cgst: fromPaise(totals.cgst),
      sgst: fromPaise(totals.sgst),
      igst: fromPaise(totals.igst),
      roundOff: fromPaise(totals.roundOff),
      total: fromPaise(totals.total),
    },
  };
}

/** Rows for a *_lines table (add the parent id column). */
export function lineRows(lines: DocLine[], totals: InvoiceTotals) {
  return lines.map((l, idx) => ({
    sortOrder: idx,
    itemId: l.itemId,
    description: l.description,
    hsnSac: l.hsnSac || null,
    qty: l.qty,
    unit: l.unit || "pcs",
    rate: l.rate,
    taxRate: l.taxRate,
    taxableAmount: fromPaise(totals.lines[idx]!.taxablePaise),
    taxAmount: fromPaise(totals.lines[idx]!.taxPaise),
  }));
}

export function parseTags(form: FormData): string[] {
  return [...new Set(str(form, "tags").split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 20);
}
