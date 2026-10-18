import { QuotationPrintView } from "@/app/(app)/quotations/views";

export const metadata = { title: "Print proforma invoice" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <QuotationPrintView kind="proforma" params={params} />;
}
