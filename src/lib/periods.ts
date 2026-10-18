import { addDays } from "./format";

export const PERIODS = [
  { value: "this_month", label: "This month" },
  { value: "this_week", label: "This week" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "last_12_months", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolves a named period (or custom from/to) to an inclusive ISO date range.
 * "Last N months" follows the previous CRM: N whole calendar months ending with the current month
 * (on 2026-10-14, last 3 months = 2026-08-01 … 2026-10-31).
 * "this_fy" / "last_fy" are not in the menu any more but are still accepted for old links.
 */
export function resolvePeriod(period: string, today: string, from?: string, to?: string): { from: string; to: string; period: string } {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const monthStart = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  const monthsBack = (n: number) => {
    const t = y * 12 + (m - 1) - n;
    return monthStart(Math.floor(t / 12), (t % 12) + 1);
  };
  const monthEnd = addDays(monthsBack(-1), -1); // last day of the current month
  const fyStart = m >= 4 ? y : y - 1;
  switch (period) {
    case "last_3_months":
      return { from: monthsBack(2), to: monthEnd, period };
    case "last_6_months":
      return { from: monthsBack(5), to: monthEnd, period };
    case "last_12_months":
      return { from: monthsBack(11), to: monthEnd, period };
    case "last_month":
      return { from: monthsBack(1), to: addDays(monthsBack(0), -1), period };
    case "this_week": {
      const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
      return { from: addDays(today, -dow), to: addDays(today, 6 - dow), period };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31`, period };
    case "last_year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, period };
    case "this_fy":
      return { from: `${fyStart}-04-01`, to: `${fyStart + 1}-03-31`, period };
    case "last_fy":
      return { from: `${fyStart - 1}-04-01`, to: `${fyStart}-03-31`, period };
    case "custom":
      if (from && to && DATE.test(from) && DATE.test(to) && from <= to) return { from, to, period };
      return { from: monthStart(y, m), to: today, period: "this_month" };
    default:
      return { from: monthsBack(0), to: monthEnd, period: "this_month" };
  }
}
