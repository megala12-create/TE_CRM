"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FieldError } from "./action-form";
import { computeInvoiceTotals } from "@/lib/gst";
import { formatPaise } from "@/lib/money";

export type CatalogItem = { id: number; name: string; description: string | null; hsnSac: string | null; unit: string; rate: string; taxRate: string };
export type EditorLine = { itemId: number | null; description: string; hsnSac: string; qty: string; unit: string; rate: string; taxRate: string };
type Line = EditorLine & { key: number };

let keySeq = 1;

/**
 * Line items + GST totals, shared by invoices, quotations and credit notes.
 * Posts `lines` (JSON) and `discount`; the server re-validates and recomputes everything.
 */
export function LineItemsEditor({
  items,
  taxRates,
  interstate,
  initialLines,
  initialDiscount,
}: {
  items: CatalogItem[];
  taxRates: number[];
  interstate: boolean;
  initialLines: EditorLine[];
  initialDiscount: string;
}) {
  const defaultTax = taxRates.includes(18) ? "18" : String(taxRates[0] ?? 0);
  const blank = (): Line => ({ key: keySeq++, itemId: null, description: "", hsnSac: "", qty: "1", unit: "pcs", rate: "0", taxRate: defaultTax });
  const [lines, setLines] = useState<Line[]>(() => (initialLines.length ? initialLines.map((l) => ({ ...l, key: keySeq++ })) : [blank()]));
  const [discount, setDiscount] = useState(initialDiscount);

  const totals = useMemo(() => {
    try {
      return computeInvoiceTotals(
        lines.map((l) => ({ qty: Number(l.qty) || 0, rate: l.rate || "0", taxRate: l.taxRate || "0" })),
        { interstate, discount: discount || "0" },
      );
    } catch {
      return null;
    }
  }, [lines, interstate, discount]);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickItem = (key: number, itemId: string) => {
    const it = items.find((i) => i.id === Number(itemId));
    if (!it) return update(key, { itemId: null });
    update(key, { itemId: it.id, description: it.description || it.name, hsnSac: it.hsnSac ?? "", unit: it.unit, rate: it.rate, taxRate: String(Number(it.taxRate)) });
  };

  const payload = JSON.stringify(
    lines
      .filter((l) => l.description.trim() || Number(l.rate) > 0)
      .map((l) => ({ itemId: l.itemId, description: l.description, hsnSac: l.hsnSac || null, qty: l.qty, unit: l.unit, rate: l.rate || "0", taxRate: l.taxRate || "0" })),
  );

  return (
    <section className="card overflow-x-auto">
      <input type="hidden" name="lines" value={payload} />
      <table className="w-full min-w-[900px]">
        <thead>
          <tr>
            <th className="th w-48">Item</th>
            <th className="th">Description</th>
            <th className="th w-24">HSN/SAC</th>
            <th className="th w-24">Qty</th>
            <th className="th w-20">Unit</th>
            <th className="th w-28">Rate (₹)</th>
            <th className="th w-24">GST %</th>
            <th className="th w-32 text-right">Amount</th>
            <th className="th w-10" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => (
            <tr key={l.key} className="align-top">
              <td className="td">
                <select value={l.itemId ?? ""} onChange={(e) => pickItem(l.key, e.target.value)} className="input" aria-label={`Line ${idx + 1} item`}>
                  <option value="">— Custom —</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </td>
              <td className="td">
                <textarea rows={1} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} className="input" aria-label={`Line ${idx + 1} description`} />
              </td>
              <td className="td"><input value={l.hsnSac} onChange={(e) => update(l.key, { hsnSac: e.target.value })} className="input" aria-label="HSN/SAC" /></td>
              <td className="td"><input type="number" min="0" step="any" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} className="input" aria-label="Quantity" /></td>
              <td className="td"><input value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })} className="input" aria-label="Unit" /></td>
              <td className="td"><input type="number" min="0" step="0.01" value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value })} className="input" aria-label="Rate" /></td>
              <td className="td">
                <select value={l.taxRate} onChange={(e) => update(l.key, { taxRate: e.target.value })} className="input" aria-label="GST rate">
                  {[...new Set([...taxRates.map(String), l.taxRate])].map((r) => (
                    <option key={r} value={r}>{r}%</option>
                  ))}
                </select>
              </td>
              <td className="td text-right tabular-nums">{totals ? formatPaise(totals.lines[idx]?.taxablePaise ?? 0) : "—"}</td>
              <td className="td">
                <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove line">
                  <Trash2 className="size-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-start justify-between gap-6 p-4">
        <div>
          <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
            <Plus className="size-4" /> Add line
          </button>
          <FieldError name="lines" />
        </div>
        <dl className="w-full max-w-xs space-y-1.5 text-sm">
          <Row label="Subtotal" value={totals?.subtotal} />
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-600"><label htmlFor="discount">Discount (₹)</label></dt>
            <dd><input id="discount" name="discount" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="input w-32 text-right" /></dd>
          </div>
          <FieldError name="discount" />
          {interstate ? <Row label="IGST" value={totals?.igst} /> : (
            <>
              <Row label="CGST" value={totals?.cgst} />
              <Row label="SGST" value={totals?.sgst} />
            </>
          )}
          <Row label="Round off" value={totals?.roundOff} />
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
            <dt>Total</dt>
            <dd className="tabular-nums">{totals ? formatPaise(totals.total) : "—"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className="tabular-nums text-slate-800">{value === undefined ? "—" : formatPaise(value)}</dd>
    </div>
  );
}
