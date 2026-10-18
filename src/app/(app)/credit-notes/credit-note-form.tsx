"use client";

import { useState, type ReactNode } from "react";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Combobox } from "@/components/combobox";
import { LineItemsEditor, type CatalogItem, type EditorLine } from "@/components/line-items-editor";
import { INDIAN_STATES } from "@/lib/gst";
import type { ActionState } from "@/lib/utils";

export type CreditNoteFormInitial = {
  customerId: number | null;
  date: string;
  invoiceId: number | null;
  reference: string;
  project: string;
  placeOfSupply: string | null;
  discount: string;
  notes: string;
  terms: string;
  lines: EditorLine[];
};

export function CreditNoteForm({
  action,
  initial,
  isNew,
  customers,
  invoices,
  items,
  taxRates,
  companyStateCode,
  customFields,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  initial: CreditNoteFormInitial;
  isNew: boolean;
  customers: { id: number; company: string; stateCode: string | null }[];
  invoices: { id: number; number: string | null; customerId: number }[];
  items: CatalogItem[];
  taxRates: number[];
  companyStateCode: string;
  customFields: ReactNode;
}) {
  const [customerId, setCustomerId] = useState(initial.customerId ? String(initial.customerId) : "");
  const [pos, setPos] = useState(initial.placeOfSupply ?? "");
  const customer = customers.find((c) => String(c.id) === customerId);
  const placeOfSupply = pos || customer?.stateCode || companyStateCode;
  const interstate = placeOfSupply !== companyStateCode;
  const customerInvoices = invoices.filter((i) => String(i.customerId) === customerId);

  return (
    <ActionForm action={action} className="space-y-5">
      <section className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="customerId" className="label"><span className="text-red-500">* </span>Customer</label>
          <Combobox id="customerId" name="customerId" defaultValue={customerId} onChange={(v) => { setCustomerId(v); setPos(""); }}
            options={customers.map((c) => ({ value: String(c.id), label: c.company }))} />
          <FieldError name="customerId" />
        </div>
        <div>
          <label htmlFor="date" className="label"><span className="text-red-500">* </span>Credit note date</label>
          <input id="date" name="date" type="date" required defaultValue={initial.date} className="input" />
          <FieldError name="date" />
        </div>
        <div>
          <label htmlFor="invoiceId" className="label">Against invoice</label>
          <select id="invoiceId" name="invoiceId" defaultValue={initial.invoiceId ?? ""} className="input" disabled={!customerId}>
            <option value="">— None —</option>
            {customerInvoices.map((i) => <option key={i.id} value={i.id}>{i.number}</option>)}
          </select>
          <FieldError name="invoiceId" />
        </div>
        <div>
          <label htmlFor="reference" className="label">Reference #</label>
          <input id="reference" name="reference" defaultValue={initial.reference} className="input" placeholder="Defaults to the invoice number" />
        </div>
        <div>
          <label htmlFor="project" className="label">Project</label>
          <input id="project" name="project" defaultValue={initial.project} className="input" />
        </div>
        <div>
          <label htmlFor="placeOfSupply" className="label">Place of supply</label>
          <select id="placeOfSupply" name="placeOfSupply" value={placeOfSupply} onChange={(e) => setPos(e.target.value)} className="input">
            {INDIAN_STATES.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">{interstate ? "Inter-state: IGST applies" : "Intra-state: CGST + SGST apply"}</p>
        </div>
      </section>

      <LineItemsEditor items={items} taxRates={taxRates} interstate={interstate} initialLines={initial.lines} initialDiscount={initial.discount} />

      <section className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="notes" className="label">Notes</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={initial.notes} className="input" placeholder="Reason for the credit, e.g. rejected pieces returned" />
        </div>
        <div>
          <label htmlFor="terms" className="label">Terms &amp; conditions</label>
          <textarea id="terms" name="terms" rows={3} defaultValue={initial.terms} className="input" />
        </div>
      </section>

      {customFields}

      <div className="flex justify-end">
        <SubmitButton>{isNew ? "Save credit note" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
