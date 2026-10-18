import { QuotationPrintView } from "@/app/(app)/quotations/views";

export const metadata = { title: "Print quotation" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <QuotationPrintView kind="quotation" params={params} />;
}
