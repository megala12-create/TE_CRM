import { QuotationDetailView } from "@/app/(app)/quotations/views";

export const metadata = { title: "Proforma invoices" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <QuotationDetailView kind="proforma" params={params} />;
}
