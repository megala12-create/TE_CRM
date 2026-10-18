import type { CompanySettings } from "@/server/settings";
import { SalesDocument, type DocLineView, type DocTotalsView } from "@/components/sales-document";
import { formatDate } from "@/lib/format";
import { stateName } from "@/lib/gst";

type CreditNote = DocTotalsView & {
  number: string;
  status: string;
  date: string;
  reference: string | null;
  placeOfSupply: string | null;
  notes: string | null;
  terms: string | null;
};
type Customer = { company: string; gstin: string | null; address: string | null; city: string | null; state: string | null; pincode: string | null; phone: string | null };

export function CreditNoteDocument({ creditNote: cn, customer, lines, company }: { creditNote: CreditNote; customer: Customer; lines: DocLineView[]; company: CompanySettings }) {
  return (
    <SalesDocument
      company={company}
      title="CREDIT NOTE"
      stamp={cn.status === "void" ? <div className="font-bold text-red-600">VOID</div> : null}
      meta={[
        { label: "Credit note no.", value: cn.number },
        { label: "Date", value: formatDate(cn.date) },
        ...(cn.reference ? [{ label: "Against invoice", value: cn.reference }] : []),
        { label: "Place of supply", value: `${cn.placeOfSupply} - ${stateName(cn.placeOfSupply)}` },
      ]}
      partyTitle="Credit to"
      party={{
        name: customer.company,
        gstin: customer.gstin,
        address: [customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(", "),
        phone: customer.phone,
      }}
      lines={lines}
      totals={cn}
      notes={cn.notes}
      terms={cn.terms}
      showBank={false}
    />
  );
}
