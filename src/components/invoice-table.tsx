import Link from "next/link";
import { Repeat } from "lucide-react";
import { Badge, EmptyState } from "./ui";
import { formatINR, fromPaise, toPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { INVOICE_STATE_LABEL, INVOICE_STATE_TONE, invoiceState } from "@/lib/invoice-status";
import { displayCustomValue, type CustomFieldDef } from "@/lib/custom-fields";

export type InvoiceRow = {
  id: number;
  number: string | null;
  status: string;
  date: string;
  dueDate: string;
  total: string;
  amountPaid: string;
  cgst: string;
  sgst: string;
  igst: string;
  customerId: number;
  customerName: string;
  orderRef?: string | null;
  tags?: string[];
  repeatEvery?: string | null;
  custom: Record<string, unknown>;
};

/** Columns follow the previous CRM: Invoice # · Amount · Total Tax · Date · Customer · Order · Tags · Due Date · Status. */
export function InvoiceTable({
  rows,
  today,
  showCustomer = true,
  show = () => true,
  customColumns = [],
}: {
  rows: InvoiceRow[];
  today: string;
  showCustomer?: boolean;
  show?: (key: string) => boolean;
  customColumns?: CustomFieldDef[];
}) {
  if (rows.length === 0) return <EmptyState title="No invoices found" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="th">Invoice #</th>
            <th className="th text-right">Amount</th>
            {show("tax") && <th className="th text-right">Total tax</th>}
            {show("date") && <th className="th">Date</th>}
            {showCustomer && <th className="th">Customer</th>}
            {show("order") && <th className="th">Order</th>}
            {show("tags") && <th className="th">Tags</th>}
            {show("due") && <th className="th">Due date</th>}
            {show("balance") && <th className="th text-right">Balance</th>}
            {customColumns.map((f) => <th key={f.key} className="th">{f.label}</th>)}
            <th className="th">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const state = invoiceState(r, today);
            const tax = toPaise(r.cgst) + toPaise(r.sgst) + toPaise(r.igst);
            const balance = r.status === "issued" ? toPaise(r.total) - toPaise(r.amountPaid) : 0;
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="td whitespace-nowrap">
                  <Link href={`/invoices/${r.id}`} className="link">{r.number ?? `DRAFT-${r.id}`}</Link>
                  {r.repeatEvery ? <Repeat className="ml-1.5 inline size-3.5 text-brand-500" aria-label="Recurring" /> : null}
                </td>
                <td className="td whitespace-nowrap text-right font-medium tabular-nums">{formatINR(r.total)}</td>
                {show("tax") && <td className="td whitespace-nowrap text-right tabular-nums">{formatINR(fromPaise(tax))}</td>}
                {show("date") && <td className="td whitespace-nowrap">{formatDate(r.date)}</td>}
                {showCustomer && (
                  <td className="td"><Link href={`/customers/${r.customerId}`} className="link font-normal">{r.customerName}</Link></td>
                )}
                {show("order") && <td className="td">{r.orderRef}</td>}
                {show("tags") && (
                  <td className="td">
                    <div className="flex flex-wrap gap-1">{(r.tags ?? []).map((t) => <Badge key={t}>{t}</Badge>)}</div>
                  </td>
                )}
                {show("due") && <td className="td whitespace-nowrap">{formatDate(r.dueDate)}</td>}
                {show("balance") && <td className="td whitespace-nowrap text-right tabular-nums">{balance > 0 ? formatINR(fromPaise(balance)) : "—"}</td>}
                {customColumns.map((f) => <td key={f.key} className="td">{displayCustomValue(f, r.custom[f.key])}</td>)}
                <td className="td"><Badge tone={INVOICE_STATE_TONE[state]}>{INVOICE_STATE_LABEL[state]}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
