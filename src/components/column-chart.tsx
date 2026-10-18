"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Grouped column chart (SVG). Follows the dataviz rules used across the app:
 * thin columns (≤24px) with 4px rounded tops, 2px gap between grouped columns,
 * hairline grid, one y-axis, legend for ≥2 series, per-category hover/focus tooltip
 * listing every series, and a "Show table" view so values are never hover-only.
 *
 * Series colours are the validated categorical slots (blue, orange) — never status colours.
 */
export const SERIES_COLORS = ["#2a78d6", "#eb6834"] as const;

export type ChartSeries = { name: string; values: number[] };

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

/** A round tick step (1, 2, 5 × 10ⁿ) giving about four gridlines. */
function niceStep(max: number) {
  if (max <= 0) return 1;
  const raw = max / 4;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

export function ColumnChart({
  categories,
  series,
  format = "inr",
  height = 300,
  ariaLabel,
  rotateLabels = false,
}: {
  categories: string[];
  series: ChartSeries[];
  format?: "inr" | "count";
  height?: number;
  ariaLabel: string;
  rotateLabels?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fmt = (v: number) => (format === "inr" ? inr.format(v) : v.toLocaleString("en-IN"));
  const tick = (v: number) => (format === "inr" ? `₹${compact.format(v)}` : compact.format(v));

  const margin = { top: 12, right: 12, bottom: rotateLabels ? 78 : 28, left: 56 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const dataMax = Math.max(0, ...series.flatMap((s) => s.values));
  const step = niceStep(dataMax);
  const max = Math.max(step, Math.ceil(dataMax / step) * step);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, k) => k * step);
  const band = plotW / Math.max(1, categories.length);
  const gap = 2;
  const barW = Math.max(3, Math.min(24, (band * 0.7 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);
  const y = (v: number) => plotH - (v / max) * plotH;

  const colPath = (x: number, v: number) => {
    const h = plotH - y(v);
    if (h <= 0) return "";
    const r = Math.min(4, barW / 2, h);
    const top = plotH - h;
    return `M${x},${plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${plotH} Z`;
  };

  return (
    <div ref={wrapRef} className="relative">
      {series.length > 1 ? (
        <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-slate-600" aria-hidden>
          {series.map((s, i) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: SERIES_COLORS[i] }} />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block max-w-full overflow-visible">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#c3c2b7" : "#e1e0d9"} strokeWidth={1} />
              <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#898781" style={{ fontVariantNumeric: "tabular-nums" }}>
                {tick(t)}
              </text>
            </g>
          ))}
          {categories.map((c, ci) => {
            const gx = ci * band + (band - groupW) / 2;
            const isActive = active === ci;
            return (
              <g key={c}>
                {series.map((s, si) => (
                  <path
                    key={s.name}
                    d={colPath(gx + si * (barW + gap), s.values[ci] ?? 0)}
                    fill={SERIES_COLORS[si]}
                    opacity={active === null || isActive ? 1 : 0.45}
                  />
                ))}
                <text
                  x={ci * band + band / 2}
                  y={plotH + 16}
                  fontSize={11}
                  fill="#52514e"
                  textAnchor={rotateLabels ? "end" : "middle"}
                  transform={rotateLabels ? `rotate(-40 ${ci * band + band / 2} ${plotH + 16})` : undefined}
                >
                  {c}
                </text>
                {/* Hit target: the whole band, bigger than the marks */}
                <rect
                  x={ci * band}
                  y={0}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${c}: ${series.map((s) => `${s.name} ${fmt(s.values[ci] ?? 0)}`).join(", ")}`}
                  onPointerEnter={() => setActive(ci)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(ci)}
                  onBlur={() => setActive(null)}
                  className="cursor-default outline-none focus-visible:stroke-brand-500"
                />
              </g>
            );
          })}
        </g>
      </svg>
      {active !== null ? (
        <div
          className="pointer-events-none absolute z-10 min-w-36 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(width - 170, Math.max(0, margin.left + active * band + band / 2 - 70)),
            top: series.length > 1 ? 28 : 4,
          }}
        >
          <div className="mb-1 font-medium text-slate-500">{categories[active]}</div>
          {series.map((s, i) => (
            <div key={s.name} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <span className="inline-block h-0.5 w-3" style={{ background: SERIES_COLORS[i] }} />
                {s.name}
              </span>
              <span className="font-semibold tabular-nums text-slate-900">{fmt(s.values[active] ?? 0)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <button type="button" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} aria-controls={tableId} className="mt-1 text-xs font-medium text-brand-600 hover:underline">
        {showTable ? "Hide table" : "Show table"}
      </button>
      {showTable ? (
        <div id={tableId} className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="th">Period</th>
                {series.map((s) => <th key={s.name} className="th text-right">{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {categories.map((c, ci) => (
                <tr key={c}>
                  <td className="td">{c}</td>
                  {series.map((s) => <td key={s.name} className="td text-right tabular-nums">{fmt(s.values[ci] ?? 0)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
