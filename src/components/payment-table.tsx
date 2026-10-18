import Link from "next/link";
import { EmptyState } from "./ui";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { paymentModeLabel } from "@/lib/invoice-status";

export type PaymentRow = {
  id: number;
  date: string;
  amount: string;
  mode: string;
  reference: string | null;
  invoiceId: number | null;
  invoiceNumber: string | null;
  customerId: number;
  customerName: string;
};

export function PaymentTable({ rows, showCustomer = true }: { rows: PaymentRow[]; showCustomer?: boolean }) {
  if (rows.length === 0) return <EmptyState title="No payments found" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="th">#</th>
            <th className="th">Date</th>
            {showCustomer && <th className="th">Customer</th>}
            <th className="th">Invoice</th>
            <th className="th">Mode</th>
            <th className="th">Reference</th>
            <th className="th text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="td text-slate-400 tabular-nums">{p.id}</td>
              <td className="td whitespace-nowrap">{formatDate(p.date)}</td>
              {showCustomer && <td className="td"><Link className="hover:underline" href={`/customers/${p.customerId}`}>{p.customerName}</Link></td>}
              <td className="td">{p.invoiceId ? <Link className="link" href={`/invoices/${p.invoiceId}`}>{p.invoiceNumber}</Link> : "—"}</td>
              <td className="td">{paymentModeLabel(p.mode)}</td>
              <td className="td">{p.reference}</td>
              <td className="td text-right font-medium tabular-nums">{formatINR(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
