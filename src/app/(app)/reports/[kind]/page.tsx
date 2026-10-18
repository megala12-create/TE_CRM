import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { todayISO } from "@/lib/format";
import { intParam, strParam } from "@/lib/utils";
import { ReportView } from "../report-view";
import { SalesReports } from "../sales-reports";
import { ExpensesReport } from "../expenses-report";

export const metadata = { title: "Reports" };

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("reports.view");
  const { kind } = await params;
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, strParam(v)]).filter(([, v]) => v !== "")) as Record<string, string>;
  const today = todayISO();
  switch (kind) {
    case "sales":
      return <SalesReports user={user} sp={sp} today={today} />;
    case "expenses":
      return <ExpensesReport user={user} year={sp.year === "all" ? 0 : intParam(sp.year, Number(today.slice(0, 4)))} excludeBillable={sp.exclude_billable === "1"} />;
    case "income-expense":
      return <ReportView kind="income-expense" user={user} today={today} sp={{ period: sp.period ?? "", from: sp.from ?? "", to: sp.to ?? "" }} />;
    default:
      notFound();
  }
}
