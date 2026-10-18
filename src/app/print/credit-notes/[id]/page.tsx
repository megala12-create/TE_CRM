import { requirePermission } from "@/server/auth";
import { getCompany } from "@/server/settings";
import { CreditNoteDocument } from "@/app/(app)/credit-notes/credit-note-document";
import { loadCreditNoteDetail } from "@/app/(app)/credit-notes/load";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Print credit note" };

export default async function PrintCreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("credit_notes.view");
  const { creditNote, customer, lines } = await loadCreditNoteDetail(user, (await params).id);
  const company = await getCompany();
  return (
    <div className="mx-auto max-w-4xl bg-white print:max-w-none">
      <div className="no-print flex justify-end gap-2 p-4">
        <PrintButton />
      </div>
      <CreditNoteDocument creditNote={creditNote} customer={customer} lines={lines} company={company} />
    </div>
  );
}
