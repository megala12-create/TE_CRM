import { QuotationEditView } from "@/app/(app)/quotations/views";

export const metadata = { title: "Quotations" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <QuotationEditView kind="quotation" params={params} />;
}
