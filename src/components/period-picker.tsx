import Form from "next/form";
import { PERIODS } from "@/lib/periods";

export function PeriodPicker({
  action,
  period,
  from,
  to,
  hidden = {},
}: {
  action: string;
  period: string;
  from: string;
  to: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <Form action={action} className="no-print flex flex-wrap items-end gap-2">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div>
        <label htmlFor="period" className="label">Period</label>
        <select id="period" name="period" defaultValue={period} className="input">
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="from" className="label">From</label>
        <input id="from" name="from" type="date" defaultValue={period === "all" ? "" : from} className="input" />
      </div>
      <div>
        <label htmlFor="to" className="label">To</label>
        <input id="to" name="to" type="date" defaultValue={period === "all" ? "" : to} className="input" />
      </div>
      <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
        Apply
      </button>
      <p className="w-full text-xs text-slate-500">From/To are used when “Custom range” is selected.</p>
    </Form>
  );
}
