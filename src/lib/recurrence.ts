import { addDays } from "./format";

// Shared repeat schedules for recurring expenses and invoices.
export const REPEAT_OPTIONS = [
  { value: "1:week", label: "Week" },
  { value: "2:week", label: "2 weeks" },
  { value: "1:month", label: "1 month" },
  { value: "2:month", label: "2 months" },
  { value: "3:month", label: "3 months" },
  { value: "6:month", label: "6 months" },
  { value: "1:year", label: "1 year" },
] as const;

export function repeatLabel(v: string | null) {
  return REPEAT_OPTIONS.find((o) => o.value === v)?.label ?? null;
}

/** Next occurrence after `iso` for a "N:unit" schedule. Month ends are clamped (31 Jan + 1 month = 28/29 Feb). */
export function nextOccurrence(iso: string, repeat: string): string {
  const [nStr, unit] = repeat.split(":");
  const n = Number(nStr);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid repeat: ${repeat}`);
  if (unit === "week") return addDays(iso, 7 * n);
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const months = unit === "year" ? 12 * n : unit === "month" ? n : NaN;
  if (Number.isNaN(months)) throw new Error(`Invalid repeat: ${repeat}`);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}
