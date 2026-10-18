import { requirePermission } from "@/server/auth";
import { getCompany } from "@/server/settings";
import { InvoiceDocument } from "@/app/(app)/invoices/invoice-document";
import { loadInvoiceDetail } from "@/app/(app)/invoices/load";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Print invoice" };

export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("invoices.view", "invoices.view_own");
  const { invoice, customer, lines } = await loadInvoiceDetail(user, (await params).id);
  const company = await getCompany();
  return (
    <div className="mx-auto max-w-4xl bg-white print:max-w-none">
      <div className="no-print flex justify-end gap-2 p-4">
        <PrintButton />
      </div>
      <InvoiceDocument invoice={invoice} customer={customer} lines={lines} company={company} />
    </div>
  );
}
