import Link from "next/link";
import { requirePermission } from "@/server/auth";
import { loadCustomer } from "@/server/scope";
import { customerStatement } from "@/server/statement";
import { getCompany } from "@/server/settings";
import { Card } from "@/components/ui";
import { PeriodPicker } from "@/components/period-picker";
import { PrintButton } from "@/components/print-button";
import { formatPaise } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/format";
import { periodText, resolvePeriod } from "@/lib/periods";
import { strParam } from "@/lib/utils";

type SP = { period?: string; from?: string; to?: string };

export default async function StatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePermission("reports.view");
  const customer = await loadCustomer(user, Number((await params).id));
  const sp = await searchParams;
  const range = resolvePeriod(strParam(sp.period), todayISO(), strParam(sp.from), strParam(sp.to));
  const [st, company] = await Promise.all([customerStatement(customer.id, range.from, range.to), getCompany()]);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <PeriodPicker action={`/customers/${customer.id}/statement`} period={range.period} from={range.from} to={range.to} />
        <PrintButton />
      </div>
      <Card>
        <div className="p-6">
          <div className="flex flex-wrap justify-between gap-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Statement of account</h2>
              <div className="mt-2 text-sm text-slate-500">To</div>
              <div className="font-medium">{customer.company}</div>
              <div className="text-sm text-slate-600">{[customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(", ")}</div>
              {customer.gstin ? <div className="text-sm">GSTIN: {customer.gstin}</div> : null}
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold">{company.legalName || company.name}</div>
              <div className="text-slate-600">{[company.address, company.city, company.state].filter(Boolean).join(", ")}</div>
              {company.gstin ? <div>GSTIN: {company.gstin}</div> : null}
              <dl className="mt-4 space-y-1">
                <div className="text-xs text-slate-500">{periodText(range, formatDate)}</div>
                <Row label="Opening balance" value={st.opening} />
                <Row label="Invoiced amount" value={st.invoiced} />
                <Row label="Amount paid" value={st.paid} />
                <div className="flex justify-between gap-8 border-t border-slate-300 pt-1 font-semibold">
                  <dt>Balance due</dt>
                  <dd className="tabular-nums">{formatPaise(st.closing)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th">Details</th>
                <th className="th text-right">Amount</th>
                <th className="th text-right">Payments</th>
                <th className="th text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="td">{range.period === "all" ? "" : formatDate(range.from)}</td>
                <td className="td">Opening balance</td>
                <td className="td" />
                <td className="td" />
                <td className="td text-right tabular-nums">{formatPaise(st.opening)}</td>
              </tr>
              {st.lines.map((l, idx) => (
                <tr key={idx}>
                  <td className="td whitespace-nowrap">{formatDate(l.date)}</td>
                  <td className="td"><Link href={l.link} className="link">{l.detail}</Link></td>
                  <td className="td text-right tabular-nums">{l.debit ? formatPaise(l.debit) : ""}</td>
                  <td className="td text-right tabular-nums">{l.credit ? formatPaise(l.credit) : ""}</td>
                  <td className="td text-right tabular-nums">{formatPaise(l.balance)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="td" colSpan={4}>Balance due</td>
                <td className="td text-right tabular-nums">{formatPaise(st.closing)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-8">
      <dt className="text-slate-600">{label}</dt>
      <dd className="tabular-nums">{formatPaise(value)}</dd>
    </div>
  );
}
