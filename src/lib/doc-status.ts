import type { Tone } from "@/components/ui";

// Quotation statuses (same as the previous CRM's quotation overview)
export const QUOTATION_STATUSES = ["draft", "sent", "open", "revised", "declined", "accepted"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  open: "Open",
  revised: "Revised",
  declined: "Declined",
  accepted: "Accepted",
};

export const QUOTATION_STATUS_TONE: Record<QuotationStatus, Tone> = {
  draft: "slate",
  sent: "blue",
  open: "blue",
  revised: "amber",
  declined: "red",
  accepted: "green",
};

export function isQuotationStatus(v: string): v is QuotationStatus {
  return (QUOTATION_STATUSES as readonly string[]).includes(v);
}

// Credit notes: open while credit remains, closed when fully used, void when cancelled
export const CREDIT_NOTE_STATUSES = ["open", "closed", "void"] as const;
export type CreditNoteStatus = (typeof CREDIT_NOTE_STATUSES)[number];

export const CREDIT_NOTE_STATUS_LABEL: Record<CreditNoteStatus, string> = { open: "Open", closed: "Closed", void: "Void" };
export const CREDIT_NOTE_STATUS_TONE: Record<CreditNoteStatus, Tone> = { open: "blue", closed: "green", void: "slate" };
