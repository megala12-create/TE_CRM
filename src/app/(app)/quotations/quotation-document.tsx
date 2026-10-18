import type { CompanySettings } from "@/server/settings";
import { SalesDocument, type DocLineView, type DocTotalsView } from "@/components/sales-document";
import { formatDate } from "@/lib/format";
import { stateName } from "@/lib/gst";

type Quotation = DocTotalsView & {
  number: string;
  subject: string;
  date: string;
  openTill: string | null;
  placeOfSupply: string | null;
  toName: string;
  toEmail: string | null;
  toPhone: string | null;
  toAddress: string | null;
  notes: string | null;
  terms: string | null;
};

export function QuotationDocument({
  quotation: q,
  lines,
  company,
  title = "QUOTATION",
  partyTitle = "Quotation to",
  showBank = false,
}: {
  quotation: Quotation;
  lines: DocLineView[];
  company: CompanySettings;
  title?: string;
  partyTitle?: string;
  showBank?: boolean;
}) {
  return (
    <SalesDocument
      company={company}
      title={title}
      meta={[
        { label: title === "QUOTATION" ? "Quotation no." : "Proforma no.", value: q.number },
        { label: "Subject", value: q.subject },
        { label: "Date", value: formatDate(q.date) },
        ...(q.openTill ? [{ label: "Valid till", value: formatDate(q.openTill) }] : []),
        { label: "Place of supply", value: `${q.placeOfSupply} - ${stateName(q.placeOfSupply)}` },
      ]}
      partyTitle={partyTitle}
      party={{ name: q.toName, address: q.toAddress, phone: q.toPhone, email: q.toEmail }}
      lines={lines}
      totals={q}
      notes={q.notes}
      terms={q.terms}
      showBank={showBank}
    />
  );
}
