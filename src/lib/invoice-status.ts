import { toPaise } from "./money";
import type { Tone } from "@/components/ui";

export type InvoiceState = "draft" | "unpaid" | "partially_paid" | "paid" | "overdue" | "cancelled";

export const INVOICE_STATE_LABEL: Record<InvoiceState, string> = {
  draft: "Draft",
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

export const INVOICE_STATE_TONE: Record<InvoiceState, Tone> = {
  draft: "slate",
  unpaid: "amber",
  partially_paid: "blue",
  paid: "green",
  overdue: "red",
  cancelled: "slate",
};

/** Derives the display state from stored status, amounts and due date. */
export function invoiceState(
  inv: { status: string; total: string; amountPaid: string; dueDate: string },
  today: string,
): InvoiceState {
  if (inv.status === "draft") return "draft";
  if (inv.status === "cancelled") return "cancelled";
  const balance = toPaise(inv.total) - toPaise(inv.amountPaid);
  if (balance <= 0) return "paid";
  if (inv.dueDate < today) return "overdue";
  return toPaise(inv.amountPaid) > 0 ? "partially_paid" : "unpaid";
}

export const PAYMENT_MODES = [
  { value: "bank", label: "Bank transfer (NEFT/RTGS/IMPS)" },
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
] as const;

export function paymentModeLabel(mode: string) {
  return PAYMENT_MODES.find((m) => m.value === mode)?.label.split(" (")[0] ?? mode;
}
