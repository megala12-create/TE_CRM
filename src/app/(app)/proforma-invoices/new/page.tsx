import { QuotationNewView } from "@/app/(app)/quotations/views";

export const metadata = { title: "Proforma invoices" };

export default function Page({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  return <QuotationNewView kind="proforma" searchParams={searchParams} />;
}
