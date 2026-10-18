import { QuotationListView } from "@/app/(app)/quotations/views";

export const metadata = { title: "Proforma invoices" };

export default function Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; size?: string }> }) {
  return <QuotationListView kind="proforma" searchParams={searchParams} />;
}
