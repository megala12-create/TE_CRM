// Money is handled as integer paise to avoid floating-point errors.
// DB numeric values arrive as strings ("1234.50"); convert with toPaise / fromPaise.

export function toPaise(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const s = typeof value === "number" ? value.toFixed(2) : String(value).trim().replace(/,/g, "");
  if (!/^-?\d*(\.\d*)?$/.test(s)) throw new Error(`Invalid amount: ${value}`);
  const negative = s.startsWith("-");
  const [whole = "0", frac = ""] = s.replace("-", "").split(".");
  const paise = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  // Round half-up on the third decimal
  const third = Number(frac[2] ?? "0");
  const rounded = paise + (third >= 5 ? 1 : 0);
  return negative ? -rounded : rounded;
}

export function fromPaise(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${s}` : s;
}

/** Multiply a paise amount by a decimal quantity/percentage, rounding half-up to the paisa. */
export function mulPaise(paise: number, factor: string | number): number {
  const f = Number(factor);
  if (!Number.isFinite(f)) throw new Error(`Invalid factor: ${factor}`);
  // Scale to avoid binary float drift on common inputs like 0.1, 2.5, 18
  return Math.round(Number((paise * f).toFixed(6)));
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

export function formatINR(value: string | number | null | undefined): string {
  const paise = typeof value === "number" ? Math.round(value * 100) : toPaise(value);
  return inr.format(paise / 100);
}

export function formatPaise(paise: number): string {
  return inr.format(paise / 100);
}
