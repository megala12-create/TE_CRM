import { QuotationNewView } from "@/app/(app)/quotations/views";

export const metadata = { title: "Quotations" };

export default function Page({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  return <QuotationNewView kind="quotation" searchParams={searchParams} />;
}
