import { QuotationListView } from "@/app/(app)/quotations/views";

export const metadata = { title: "Quotations" };

export default function Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; size?: string }> }) {
  return <QuotationListView kind="quotation" searchParams={searchParams} />;
}
