import type { CompanySettings } from "@/server/settings";
import { SalesDocument, type DocLineView, type DocTotalsView } from "@/components/sales-document";
import { fromPaise, toPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { stateName } from "@/lib/gst";

type Invoice = DocTotalsView & {
  number: string | null;
  status: string;
  date: string;
  dueDate: string;
  placeOfSupply: string | null;
  orderRef: string | null;
  amountPaid: string;
  notes: string | null;
  terms: string | null;
};
type Customer = { company: string; gstin: string | null; address: string | null; city: string | null; state: string | null; pincode: string | null; phone: string | null };

/** Printable GST tax invoice. */
export function InvoiceDocument({ invoice, customer, lines, company }: { invoice: Invoice; customer: Customer; lines: DocLineView[]; company: CompanySettings }) {
  const paid = toPaise(invoice.amountPaid);
  const balance = toPaise(invoice.total) - paid;
  return (
    <SalesDocument
      company={company}
      title={invoice.status === "draft" ? "DRAFT INVOICE" : "TAX INVOICE"}
      stamp={invoice.status === "cancelled" ? <div className="font-bold text-red-600">CANCELLED</div> : null}
      meta={[
        { label: "Invoice no.", value: invoice.number ?? "—" },
        { label: "Date", value: formatDate(invoice.date) },
        { label: "Due date", value: formatDate(invoice.dueDate) },
        ...(invoice.orderRef ? [{ label: "Order / PO", value: invoice.orderRef }] : []),
        { label: "Place of supply", value: `${invoice.placeOfSupply} - ${stateName(invoice.placeOfSupply)}` },
      ]}
      partyTitle="Bill to"
      party={{
        name: customer.company,
        gstin: customer.gstin,
        address: [customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(", "),
        phone: customer.phone,
      }}
      lines={lines}
      totals={invoice}
      extraTotals={
        paid > 0
          ? [
              { label: "Paid / credited", value: invoice.amountPaid },
              { label: "Balance due", value: fromPaise(balance), strong: true },
            ]
          : []
      }
      notes={invoice.notes}
      terms={invoice.terms}
    />
  );
}
