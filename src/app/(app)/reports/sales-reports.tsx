import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { BarChart3, ChevronDown, CircleAlert, FileText } from "lucide-react";
import { db, schema } from "@/db";
import { activeStaff } from "@/server/lookups";
import { customerScope, invoiceScope, quotationScope } from "@/server/scope";
import type { CurrentUser } from "@/server/auth";
import { Badge, Card, EmptyState } from "@/components/ui";
import { ColumnChart } from "@/components/column-chart";
import { PeriodPicker } from "@/components/period-picker";
import { Pagination, buildHref, pageSizeParam } from "@/components/list-tools";
import { ToolbarSelect } from "@/components/list-toolbar";
import { INVOICE_STATE_LABEL, INVOICE_STATE_TONE, PAYMENT_MODES, invoiceState, paymentModeLabel, type InvoiceState } from "@/lib/invoice-status";
import { CREDIT_NOTE_STATUS_LABEL, QUOTATION_STATUS_LABEL, isQuotationStatus } from "@/lib/doc-status";
import { invoiceStateWhere } from "@/server/invoice-queries";
import { can } from "@/lib/permissions";
import { formatINR, formatPaise, fromPaise, toPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { ALL_FROM, ALL_TO, periodText, resolvePeriod } from "@/lib/periods";
import { cn, intParam } from "@/lib/utils";

export const SALES_REPORTS = [
  { key: "invoices", label: "Invoices report" },
  { key: "services", label: "Services report" },
  { key: "payments", label: "Payments received" },
  { key: "credit_notes", label: "Credit notes report" },
  { key: "quotations", label: "Quotations report" },
  { key: "estimates", label: "Estimates report" },
  { key: "customers", label: "Customers report" },
] as const;
export const CHART_REPORTS = [
  { key: "total_income", label: "Total income" },
  { key: "payment_modes", label: "Payment modes (transactions)" },
  { key: "customer_groups", label: "Total value by customer groups" },
] as const;

type SP = Record<string, string>;
const n2 = (paise: number) => fromPaise(paise);

/** Reports → Sales: menu of reports + the generated report below (like the previous CRM). */
export async function SalesReports({ user, sp, today }: { user: CurrentUser; sp: SP; today: string }) {
  const report = sp.report ?? "";
  const range = resolvePeriod(sp.period || "this_month", today, sp.from, sp.to);
  const link = (key: string) => buildHref("/reports/sales", { report: key, period: sp.period, from: sp.from, to: sp.to });

  return (
    <>
      <div className="card mb-5 grid gap-6 p-5 lg:grid-cols-[1fr_1fr_1.2fr]">
        <nav aria-label="Sales reports">
          <h1 className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-900"><FileText className="size-4 text-slate-400" /> Sales report</h1>
          <ul className="space-y-0.5">
            {SALES_REPORTS.map((r) => (
              <li key={r.key}>
                <Link href={link(r.key)} className={cn("flex items-center gap-2 rounded px-2 py-1.5 text-sm", report === r.key ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50")}>
                  <ChevronDown className="size-3.5 -rotate-90 text-slate-400" /> {r.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600"><CircleAlert className="size-3.5" /> Cancelled invoices are excluded from the report</p>
        </nav>
        <nav aria-label="Chart reports" className="lg:border-l lg:border-slate-200 lg:pl-6">
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-900"><BarChart3 className="size-4 text-slate-400" /> Charts based report</h2>
          <ul className="space-y-0.5">
            {CHART_REPORTS.map((r) => (
              <li key={r.key}>
                <Link href={link(r.key)} className={cn("flex items-center gap-2 rounded px-2 py-1.5 text-sm", report === r.key ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50")}>
                  <ChevronDown className="size-3.5 -rotate-90 text-slate-400" /> {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="lg:border-l lg:border-slate-200 lg:pl-6">
          {report ? <PeriodPicker action="/reports/sales" period={range.period} from={range.from} to={range.to} hidden={{ report }} /> : <p className="text-sm text-slate-500">Choose a report on the left.</p>}
        </div>
      </div>

      {report ? <h2 className="mb-3 text-base font-semibold text-slate-900">Generated report <span className="font-normal text-slate-500">· {periodText(range, formatDate)}</span></h2> : null}
      {report === "invoices" ? <InvoicesReport user={user} sp={sp} from={range.from} to={range.to} today={today} /> : null}
      {report === "services" ? <ServicesReport user={user} from={range.from} to={range.to} /> : null}
      {report === "payments" ? <PaymentsReport user={user} from={range.from} to={range.to} /> : null}
      {report === "credit_notes" ? <CreditNotesReport user={user} from={range.from} to={range.to} /> : null}
      {report === "quotations" ? <QuotationsReport user={user} from={range.from} to={range.to} /> : null}
      {report === "estimates" ? <Card><EmptyState title="Estimates report">Available once the Estimates module is built. Use the Quotations report meanwhile.</EmptyState></Card> : null}
      {report === "customers" ? <CustomersReport user={user} from={range.from} to={range.to} /> : null}
      {report === "total_income" ? <TotalIncomeChart user={user} from={range.from} to={range.to} /> : null}
      {report === "payment_modes" ? <PaymentModesChart user={user} from={range.from} to={range.to} /> : null}
      {report === "customer_groups" ? <CustomerGroupsChart user={user} from={range.from} to={range.to} /> : null}
    </>
  );
}

// ─── Invoices report ─────────────────────────────────────────────────────────

async function InvoicesReport({ user, sp, from, to, today }: { user: CurrentUser; sp: SP; from: string; to: string; today: string }) {
  const i = schema.invoices;
  const statuses = ["unpaid", "partially_paid", "overdue", "paid", "draft"] as InvoiceState[];
  const status = (statuses as string[]).includes(sp.status ?? "") ? (sp.status as InvoiceState) : "";
  const agent = intParam(sp.agent, 0);
  const page = intParam(sp.page, 1);
  const size = pageSizeParam(sp.size);
  const where = and(
    ne(i.status, "cancelled"),
    gte(i.date, from),
    lte(i.date, to),
    invoiceScope(user),
    status ? invoiceStateWhere(status, today) : undefined,
    agent ? eq(i.salesAgentId, agent) : undefined,
  );

  const [rows, staff] = await Promise.all([
    db
      .select({
        id: i.id, number: i.number, status: i.status, date: i.date, dueDate: i.dueDate, subtotal: i.subtotal, discount: i.discount,
        cgst: i.cgst, sgst: i.sgst, igst: i.igst, roundOff: i.roundOff, total: i.total, amountPaid: i.amountPaid, isInterstate: i.isInterstate,
        customerId: i.customerId, customer: schema.customers.company, gstin: schema.customers.gstin,
        credits: sql<string>`(select coalesce(sum(ca.amount), 0) from credit_applications ca where ca.invoice_id = "invoices"."id")`,
        count: sql<number>`count(*) over()::int`,
      })
      .from(i)
      .innerJoin(schema.customers, eq(schema.customers.id, i.customerId))
      .where(where)
      .orderBy(desc(i.date), desc(i.id))
      .limit(size)
      .offset((page - 1) * size),
    activeStaff(),
  ]);

  // Tax broken down by type and rate (e.g. CGST 9%), from the invoice lines
  const ids = rows.map((r) => r.id);
  const lineTax = ids.length
    ? await db
        .select({ invoiceId: schema.invoiceLines.invoiceId, rate: schema.invoiceLines.taxRate, tax: sql<string>`sum(${schema.invoiceLines.taxAmount})` })
        .from(schema.invoiceLines)
        .where(inArray(schema.invoiceLines.invoiceId, ids))
        .groupBy(schema.invoiceLines.invoiceId, schema.invoiceLines.taxRate)
    : [];
  const breakdown = new Map<number, Map<string, number>>();
  const columns = new Set<string>();
  for (const lt of lineTax) {
    const inv = rows.find((r) => r.id === lt.invoiceId)!;
    const rate = Number(lt.rate);
    if (rate === 0) continue;
    const m = breakdown.get(lt.invoiceId) ?? new Map<string, number>();
    const tax = toPaise(lt.tax);
    if (inv.isInterstate) {
      const k = `IGST ${rate}%`;
      columns.add(k);
      m.set(k, (m.get(k) ?? 0) + tax);
    } else {
      const half = rate / 2;
      for (const t of ["CGST", "SGST"]) {
        const k = `${t} ${half}%`;
        columns.add(k);
        m.set(k, (m.get(k) ?? 0) + tax / 2);
      }
    }
    breakdown.set(lt.invoiceId, m);
  }
  const taxCols = [...columns].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const total = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const taxable = (r: (typeof rows)[number]) => toPaise(r.subtotal) - toPaise(r.discount);
  const taxOf = (r: (typeof rows)[number]) => toPaise(r.cgst) + toPaise(r.sgst) + toPaise(r.igst);
  const open = (r: (typeof rows)[number]) => (r.status === "issued" ? toPaise(r.total) - toPaise(r.amountPaid) : 0);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 p-3 text-sm">
        <label className="flex items-center gap-2">Status
          <ToolbarSelect name="status" label="Status" options={[{ value: "", label: "All" }, ...statuses.map((s) => ({ value: s, label: INVOICE_STATE_LABEL[s] }))]} />
        </label>
        <label className="flex items-center gap-2">Marketing by
          <ToolbarSelect name="agent" label="Marketing by" options={[{ value: "", label: "All" }, ...staff.map((s) => ({ value: String(s.id), label: s.name }))]} />
        </label>
        <ToolbarSelect name="size" label="Rows per page" options={[10, 25, 50, 100].map((n) => ({ value: n === 25 ? "" : String(n), label: `${n} rows` }))} />
        <Link className="link ml-auto" href={buildHref("/api/export/invoices", {})} prefetch={false}>Export all invoices</Link>
      </div>
      {rows.length === 0 ? <EmptyState title="No invoices in this period" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="th">Invoice #</th>
                <th className="th">Customer</th>
                <th className="th">Date</th>
                <th className="th">Due date</th>
                <th className="th text-right">Amount</th>
                <th className="th text-right">Amount with tax</th>
                <th className="th text-right">Total tax</th>
                {taxCols.map((c) => <th key={c} className="th text-right">{c}</th>)}
                <th className="th text-right">Discount</th>
                <th className="th text-right">Adjustment</th>
                <th className="th text-right">Applied credits</th>
                <th className="th text-right">Amount open</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = invoiceState(r, today);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap"><Link href={`/invoices/${r.id}`} className="link">{r.number ?? `DRAFT-${r.id}`}</Link></td>
                    <td className="td min-w-56"><Link href={`/customers/${r.customerId}`} className="link font-normal">{r.customer}</Link>{r.gstin ? <span className="text-slate-400"> ({r.gstin})</span> : null}</td>
                    <td className="td whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="td whitespace-nowrap">{formatDate(r.dueDate)}</td>
                    <td className="td text-right tabular-nums">{n2(taxable(r))}</td>
                    <td className="td text-right tabular-nums">{r.total}</td>
                    <td className="td text-right tabular-nums">{n2(taxOf(r))}</td>
                    {taxCols.map((c) => <td key={c} className="td text-right tabular-nums">{n2(Math.round(breakdown.get(r.id)?.get(c) ?? 0))}</td>)}
                    <td className="td text-right tabular-nums">{r.discount}</td>
                    <td className="td text-right tabular-nums">{r.roundOff}</td>
                    <td className="td text-right tabular-nums">{n2(toPaise(r.credits))}</td>
                    <td className="td text-right tabular-nums">{n2(open(r))}</td>
                    <td className="td"><Badge tone={INVOICE_STATE_TONE[st]}>{INVOICE_STATE_LABEL[st]}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="td" colSpan={4}>Total (per page)</td>
                <td className="td text-right tabular-nums">{n2(total(taxable))}</td>
                <td className="td text-right tabular-nums">{n2(total((r) => toPaise(r.total)))}</td>
                <td className="td text-right tabular-nums">{n2(total(taxOf))}</td>
                {taxCols.map((c) => <td key={c} className="td text-right tabular-nums">{n2(Math.round(rows.reduce((s, r) => s + (breakdown.get(r.id)?.get(c) ?? 0), 0)))}</td>)}
                <td className="td text-right tabular-nums">{n2(total((r) => toPaise(r.discount)))}</td>
                <td className="td text-right tabular-nums">{n2(total((r) => toPaise(r.roundOff)))}</td>
                <td className="td text-right tabular-nums">{n2(total((r) => toPaise(r.credits)))}</td>
                <td className="td text-right tabular-nums">{n2(total(open))}</td>
                <td className="td" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <Pagination base="/reports/sales" page={page} pageSize={size} total={rows[0]?.count ?? 0} params={{ ...sp, page: undefined }} />
    </Card>
  );
}

// ─── Other tabular reports ───────────────────────────────────────────────────

async function ServicesReport({ user, from, to }: { user: CurrentUser; from: string; to: string }) {
  const l = schema.invoiceLines;
  const i = schema.invoices;
  const rows = await db
    .select({
      name: sql<string>`coalesce(${schema.items.name}, ${l.description})`,
      hsn: sql<string>`max(${l.hsnSac})`,
      qty: sql<string>`sum(${l.qty})`,
      amount: sql<string>`sum(${l.taxableAmount})`,
      tax: sql<string>`sum(${l.taxAmount})`,
      invoices: sql<number>`count(distinct ${i.id})::int`,
    })
    .from(l)
    .innerJoin(i, eq(i.id, l.invoiceId))
    .leftJoin(schema.items, eq(schema.items.id, l.itemId))
    .where(and(eq(i.status, "issued"), gte(i.date, from), lte(i.date, to), invoiceScope(user)))
    .groupBy(sql`coalesce(${schema.items.name}, ${l.description})`)
    .orderBy(desc(sql`sum(${l.taxableAmount})`));
  return (
    <SimpleTable
      empty="No services invoiced in this period"
      head={["Service / item", "HSN/SAC", "Invoices", "Quantity", "Taxable amount", "Tax", "Avg. rate"]}
      right={[2, 3, 4, 5, 6]}
      rows={rows.map((r) => [r.name, r.hsn, r.invoices, Number(r.qty).toLocaleString("en-IN"), formatINR(r.amount), formatINR(r.tax), formatINR(Number(r.qty) ? Number(r.amount) / Number(r.qty) : 0)])}
      foot={["Total", "", rows.reduce((s, r) => s + r.invoices, 0), "", formatPaise(rows.reduce((s, r) => s + toPaise(r.amount), 0)), formatPaise(rows.reduce((s, r) => s + toPaise(r.tax), 0)), ""]}
    />
  );
}

async function PaymentsReport({ user, from, to }: { user: CurrentUser; from: string; to: string }) {
  if (!can(user, "payments.view")) return <Card><EmptyState title="You don’t have permission to view payments" /></Card>;
  const p = schema.payments;
  const rows = await db
    .select({ id: p.id, date: p.date, amount: p.amount, mode: p.mode, reference: p.reference, invoiceId: p.invoiceId, number: schema.invoices.number, customer: schema.customers.company })
    .from(p)
    .innerJoin(schema.customers, eq(schema.customers.id, p.customerId))
    .innerJoin(schema.invoices, eq(schema.invoices.id, p.invoiceId))
    .where(and(gte(p.date, from), lte(p.date, to), invoiceScope(user)))
    .orderBy(desc(p.date), desc(p.id))
    .limit(2000);
  return (
    <SimpleTable
      empty="No payments in this period"
      head={["Payment #", "Date", "Invoice #", "Customer", "Payment mode", "Reference", "Amount"]}
      right={[6]}
      rows={rows.map((r) => [r.id, formatDate(r.date), r.invoiceId ? <Link key="i" href={`/invoices/${r.invoiceId}`} className="link">{r.number}</Link> : "", r.customer, paymentModeLabel(r.mode), r.reference, formatINR(r.amount)])}
      foot={["Total", "", "", "", "", "", formatPaise(rows.reduce((s, r) => s + toPaise(r.amount), 0))]}
    />
  );
}

async function CreditNotesReport({ user, from, to }: { user: CurrentUser; from: string; to: string }) {
  const c = schema.creditNotes;
  const rows = await db
    .select({ c, customer: schema.customers.company })
    .from(c)
    .innerJoin(schema.customers, eq(schema.customers.id, c.customerId))
    .where(and(gte(c.date, from), lte(c.date, to), ne(c.status, "void"), customerScope(user)))
    .orderBy(desc(c.date));
  const rem = (r: (typeof rows)[number]["c"]) => toPaise(r.total) - toPaise(r.amountApplied) - toPaise(r.amountRefunded);
  return (
    <SimpleTable
      empty="No credit notes in this period"
      head={["Credit note #", "Date", "Customer", "Reference #", "Taxable", "Tax", "Amount", "Remaining", "Status"]}
      right={[4, 5, 6, 7]}
      rows={rows.map(({ c: r, customer }) => [
        <Link key="c" href={`/credit-notes/${r.id}`} className="link">{r.number}</Link>, formatDate(r.date), customer, r.reference,
        formatPaise(toPaise(r.subtotal) - toPaise(r.discount)), formatPaise(toPaise(r.cgst) + toPaise(r.sgst) + toPaise(r.igst)), formatINR(r.total),
        formatPaise(rem(r)), CREDIT_NOTE_STATUS_LABEL[r.status as "open"] ?? r.status,
      ])}
      foot={["Total", "", "", "", "", "", formatPaise(rows.reduce((s, r) => s + toPaise(r.c.total), 0)), formatPaise(rows.reduce((s, r) => s + rem(r.c), 0)), ""]}
    />
  );
}

async function QuotationsReport({ user, from, to }: { user: CurrentUser; from: string; to: string }) {
  const q = schema.quotations;
  const rows = await db
    .select({ status: q.status, n: sql<number>`count(*)::int`, total: sql<string>`sum(${q.total})` })
    .from(q)
    .where(and(gte(q.date, from), lte(q.date, to), quotationScope(user, "quotation")))
    .groupBy(q.status)
    .orderBy(asc(q.status));
  const all = rows.reduce((s, r) => s + r.n, 0);
  const won = rows.find((r) => r.status === "accepted")?.n ?? 0;
  return (
    <>
      <p className="mb-3 text-sm text-slate-600">Win rate: <strong>{all ? ((won / all) * 100).toFixed(1) : "0.0"}%</strong> ({won} of {all} quotations accepted)</p>
      <SimpleTable
        empty="No quotations in this period"
        head={["Status", "Quotations", "Value"]}
        right={[1, 2]}
        rows={rows.map((r) => [isQuotationStatus(r.status) ? QUOTATION_STATUS_LABEL[r.status] : r.status, r.n, formatINR(r.total)])}
        foot={["Total", all, formatPaise(rows.reduce((s, r) => s + toPaise(r.total), 0))]}
      />
    </>
  );
}

async function CustomersReport({ user, from, to }: { user: CurrentUser; from: string; to: string }) {
  const i = schema.invoices;
  const rows = await db
    .select({
      id: schema.customers.id,
      company: schema.customers.company,
      invoices: sql<number>`count(${i.id})::int`,
      invoiced: sql<string>`coalesce(sum(${i.total}), 0)`,
      paid: sql<string>`coalesce(sum(${i.amountPaid}), 0)`,
    })
    .from(i)
    .innerJoin(schema.customers, eq(schema.customers.id, i.customerId))
    .where(and(eq(i.status, "issued"), gte(i.date, from), lte(i.date, to), invoiceScope(user)))
    .groupBy(schema.customers.id, schema.customers.company)
    .orderBy(desc(sql`sum(${i.total})`));
  return (
    <SimpleTable
      empty="No sales in this period"
      head={["Customer", "Invoices", "Invoiced", "Paid / credited", "Balance"]}
      right={[1, 2, 3, 4]}
      rows={rows.map((r) => [<Link key="c" href={`/customers/${r.id}`} className="link">{r.company}</Link>, r.invoices, formatINR(r.invoiced), formatINR(r.paid), formatPaise(toPaise(r.invoiced) - toPaise(r.paid))])}
      foot={["Total", rows.reduce((s, r) => s + r.invoices, 0), formatPaise(rows.reduce((s, r) => s + toPaise(r.invoiced), 0)), formatPaise(rows.reduce((s, r) => s + toPaise(r.paid), 0)), formatPaise(rows.reduce((s, r) => s + toPaise(r.invoiced) - toPaise(r.paid), 0))]}
    />
  );
}

// ─── Chart reports ───────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function TotalIncomeChart({ user, from, to }: { user: CurrentUser; from: string; to: string }) {
  const p = schema.payments;
  const rows = await db
    .select({ m: sql<string>`to_char(${p.date}, 'YYYY-MM')`, amount: sql<string>`sum(${p.amount})` })
    .from(p)
    .innerJoin(schema.invoices, eq(schema.invoices.id, p.invoiceId))
    .where(and(gte(p.date, from), lte(p.date, to), invoiceScope(user)))
    .groupBy(sql`to_char(${p.date}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${p.date}, 'YYYY-MM')`);
  const months: string[] = [];
  // "All": run from the first to the last month with payments instead of the open-ended bounds
  const start = from === ALL_FROM ? (rows[0]?.m ?? to.slice(0, 7)) : from.slice(0, 7);
  const end = to === ALL_TO ? (rows.at(-1)?.m ?? start) : to.slice(0, 7);
  for (let d = start; d <= end; ) {
    months.push(d);
    const [y, m] = d.split("-").map(Number) as [number, number];
    d = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  const total = rows.reduce((s, r) => s + toPaise(r.amount), 0);
  return (
    <Card title={`Total income (payments received) · ${formatPaise(total)}`}>
      <div className="p-4">
        <ColumnChart
          ariaLabel="Payments received by month"
          categories={months.map((m) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`)}
          series={[{ name: "Income", values: months.map((m) => toPaise(rows.find((r) => r.m === m)?.amount) / 100) }]}
        />
      </div>
    </Card>
  );
}

async function PaymentModesChart({ user, from, to }: { user: CurrentUser; from: string; to: string }) {
  const p = schema.payments;
  const rows = await db
    .select({ mode: p.mode, n: sql<number>`count(*)::int`, amount: sql<string>`sum(${p.amount})` })
    .from(p)
    .innerJoin(schema.invoices, eq(schema.invoices.id, p.invoiceId))
    .where(and(gte(p.date, from), lte(p.date, to), invoiceScope(user)))
    .groupBy(p.mode);
  const modes = PAYMENT_MODES.map((m) => m.value);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Amount by payment mode">
        <div className="p-4">
          <ColumnChart ariaLabel="Amount received by payment mode" categories={modes.map(paymentModeLabel)}
            series={[{ name: "Amount", values: modes.map((m) => toPaise(rows.find((r) => r.mode === m)?.amount) / 100) }]} />
        </div>
      </Card>
      <Card title="Transactions by payment mode">
        <div className="p-4">
          <ColumnChart ariaLabel="Number of payments by payment mode" format="count" categories={modes.map(paymentModeLabel)}
            series={[{ name: "Transactions", values: modes.map((m) => rows.find((r) => r.mode === m)?.n ?? 0) }]} />
        </div>
      </Card>
    </div>
  );
}

async function CustomerGroupsChart({ user, from, to }: { user: CurrentUser; from: string; to: string }) {
  const i = schema.invoices;
  const rows = await db
    .select({ group: sql<string>`coalesce(g.grp, 'No group')`, total: sql<string>`sum(${i.total})` })
    .from(i)
    .innerJoin(schema.customers, eq(schema.customers.id, i.customerId))
    .leftJoin(sql`lateral unnest(${schema.customers.groups}) as g(grp)`, sql`true`)
    .where(and(eq(i.status, "issued"), gte(i.date, from), lte(i.date, to), invoiceScope(user)))
    .groupBy(sql`coalesce(g.grp, 'No group')`)
    .orderBy(desc(sql`sum(${i.total})`));
  return (
    <Card title="Total invoiced value by customer group">
      <div className="p-4">
        {rows.length === 0 ? <EmptyState title="No sales in this period" /> : (
          <ColumnChart ariaLabel="Invoiced value by customer group" categories={rows.map((r) => r.group)} rotateLabels={rows.length > 6}
            series={[{ name: "Invoiced", values: rows.map((r) => toPaise(r.total) / 100) }]} />
        )}
        <p className="mt-2 text-xs text-slate-500">A customer in several groups counts towards each of them.</p>
      </div>
    </Card>
  );
}

function SimpleTable({ head, rows, foot, right = [], empty }: { head: string[]; rows: React.ReactNode[][]; foot?: React.ReactNode[]; right?: number[]; empty: string }) {
  if (rows.length === 0) return <Card><EmptyState title={empty} /></Card>;
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr>{head.map((h, i) => <th key={h} className={cn("th", right.includes(i) && "text-right")}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="hover:bg-slate-50">
                {r.map((c, ci) => <td key={ci} className={cn("td", right.includes(ci) && "text-right tabular-nums")}>{c}</td>)}
              </tr>
            ))}
          </tbody>
          {foot ? (
            <tfoot><tr className="font-semibold">{foot.map((c, ci) => <td key={ci} className={cn("td", right.includes(ci) && "text-right tabular-nums")}>{c}</td>)}</tr></tfoot>
          ) : null}
        </table>
      </div>
    </Card>
  );
}
