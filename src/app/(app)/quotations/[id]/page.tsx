import { QuotationDetailView } from "@/app/(app)/quotations/views";

export const metadata = { title: "Quotations" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <QuotationDetailView kind="quotation" params={params} />;
}
