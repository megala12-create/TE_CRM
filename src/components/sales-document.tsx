import Image from "next/image";
import type { ReactNode } from "react";
import type { CompanySettings } from "@/server/settings";
import { formatINR, toPaise } from "@/lib/money";
import { rupeesInWords } from "@/lib/words";

export type DocParty = { name: string; gstin?: string | null; address?: string | null; phone?: string | null; email?: string | null };
export type DocLineView = { id: number; description: string; hsnSac: string | null; qty: string; unit: string; rate: string; taxRate: string; taxableAmount: string; taxAmount: string };
export type DocTotalsView = { subtotal: string; discount: string; isInterstate: boolean; cgst: string; sgst: string; igst: string; roundOff: string; total: string };

/** Printable GST document (tax invoice, quotation, credit note) with the company letterhead. */
export function SalesDocument({
  company,
  title,
  stamp,
  meta,
  partyTitle,
  party,
  lines,
  totals,
  extraTotals = [],
  notes,
  terms,
  showBank = true,
}: {
  company: CompanySettings;
  title: string;
  stamp?: ReactNode;
  meta: { label: string; value: ReactNode }[];
  partyTitle: string;
  party: DocParty;
  lines: DocLineView[];
  totals: DocTotalsView;
  extraTotals?: { label: string; value: string; strong?: boolean }[];
  notes?: string | null;
  terms?: string | null;
  showBank?: boolean;
}) {
  return (
    <article className="bg-white p-6 text-sm text-slate-800 sm:p-10 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-brand-600 pb-5">
        <div className="flex items-start gap-3">
          <Image src="/logo.png" alt="" width={64} height={64} />
          <div>
            <div className="text-lg font-bold text-slate-900">{company.legalName || company.name}</div>
            <div className="whitespace-pre-line text-slate-600">
              {[company.address, [company.city, company.pincode].filter(Boolean).join(" - "), company.state].filter(Boolean).join("\n")}
            </div>
            <div className="text-slate-600">{[company.phone, company.email].filter(Boolean).join(" · ")}</div>
            {company.gstin ? <div className="mt-1 font-semibold">GSTIN: {company.gstin}</div> : null}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tracking-wide text-brand-700">{title}</div>
          {stamp}
          <table className="ml-auto mt-2 text-left">
            <tbody>
              {meta.map((m) => (
                <tr key={m.label}>
                  <td className="pr-3 text-slate-500">{m.label}</td>
                  <td className="font-medium">{m.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </header>

      <section className="py-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{partyTitle}</div>
        <div className="font-semibold text-slate-900">{party.name}</div>
        {party.address ? <div className="whitespace-pre-line text-slate-600">{party.address}</div> : null}
        {party.gstin ? <div>GSTIN: <span className="font-mono">{party.gstin}</span></div> : null}
        {party.phone || party.email ? <div className="text-slate-600">{[party.phone, party.email].filter(Boolean).join(" · ")}</div> : null}
      </section>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100 text-left text-xs uppercase text-slate-600">
            <th className="border border-slate-200 px-2 py-1.5">#</th>
            <th className="border border-slate-200 px-2 py-1.5">Description</th>
            <th className="border border-slate-200 px-2 py-1.5">HSN/SAC</th>
            <th className="border border-slate-200 px-2 py-1.5 text-right">Qty</th>
            <th className="border border-slate-200 px-2 py-1.5 text-right">Rate</th>
            <th className="border border-slate-200 px-2 py-1.5 text-right">Taxable</th>
            <th className="border border-slate-200 px-2 py-1.5 text-right">GST</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id}>
              <td className="border border-slate-200 px-2 py-1.5">{i + 1}</td>
              <td className="whitespace-pre-line border border-slate-200 px-2 py-1.5">{l.description}</td>
              <td className="border border-slate-200 px-2 py-1.5">{l.hsnSac}</td>
              <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">{Number(l.qty)} {l.unit}</td>
              <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">{formatINR(l.rate)}</td>
              <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">{formatINR(l.taxableAmount)}</td>
              <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">
                {Number(l.taxRate)}%<div className="text-xs text-slate-500">{formatINR(l.taxAmount)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-4 flex flex-wrap justify-between gap-6">
        <div className="max-w-md space-y-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount in words</div>
            <div className="font-medium">{rupeesInWords(toPaise(totals.total))}</div>
          </div>
          {showBank && company.bankAccount ? (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bank details</div>
              <div>{company.bankName}</div>
              <div>A/c {company.bankAccount} · IFSC {company.bankIfsc}</div>
              {company.upiId ? <div>UPI: {company.upiId}</div> : null}
            </div>
          ) : null}
          {notes ? <div className="whitespace-pre-line text-slate-600">{notes}</div> : null}
        </div>
        <table className="w-full max-w-xs text-sm">
          <tbody>
            <Tr label="Subtotal" value={totals.subtotal} />
            {toPaise(totals.discount) > 0 ? <Tr label="Discount" value={`-${totals.discount}`} /> : null}
            {totals.isInterstate ? <Tr label="IGST" value={totals.igst} /> : (
              <>
                <Tr label="CGST" value={totals.cgst} />
                <Tr label="SGST" value={totals.sgst} />
              </>
            )}
            {toPaise(totals.roundOff) !== 0 ? <Tr label="Round off" value={totals.roundOff} /> : null}
            <tr className="border-t-2 border-slate-800 text-base font-bold">
              <td className="py-1.5">Total</td>
              <td className="py-1.5 text-right tabular-nums">{formatINR(totals.total)}</td>
            </tr>
            {extraTotals.map((t) => (
              <tr key={t.label} className={t.strong ? "font-semibold text-red-700" : ""}>
                <td className="py-1">{t.label}</td>
                <td className="py-1 text-right tabular-nums">{formatINR(t.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="mt-8 flex flex-wrap items-end justify-between gap-6 border-t border-slate-200 pt-4">
        <div className="max-w-md whitespace-pre-line text-xs text-slate-500">{terms}</div>
        <div className="text-center text-xs text-slate-600">
          <div className="mb-10">For {company.legalName || company.name}</div>
          <div className="border-t border-slate-400 pt-1">Authorised signatory</div>
        </div>
      </footer>
    </article>
  );
}

function Tr({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="py-1 text-slate-600">{label}</td>
      <td className="py-1 text-right tabular-nums">{formatINR(value)}</td>
    </tr>
  );
}
