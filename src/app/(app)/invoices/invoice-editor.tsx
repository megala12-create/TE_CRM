"use client";

import { useState, type ReactNode } from "react";
import { ActionForm, FieldError } from "@/components/action-form";
import { Combobox } from "@/components/combobox";
import { LineItemsEditor, type CatalogItem, type EditorLine } from "@/components/line-items-editor";
import { INDIAN_STATES } from "@/lib/gst";
import { REPEAT_OPTIONS } from "@/lib/recurrence";
import { addDays } from "@/lib/format";
import type { ActionState } from "@/lib/utils";

type Customer = { id: number; company: string; stateCode: string | null; paymentTermsDays: number };

export type InvoiceEditorInitial = {
  customerId: number | null;
  date: string;
  dueDate: string;
  placeOfSupply: string | null;
  salesAgentId: number | null;
  orderRef: string;
  tags: string[];
  repeatEvery: string | null;
  discount: string;
  notes: string;
  terms: string;
  lines: EditorLine[];
};

export function InvoiceEditor({
  action,
  initial,
  customers,
  items,
  staff,
  taxRates,
  companyStateCode,
  canAssignAgent,
  customFields,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  initial: InvoiceEditorInitial;
  customers: Customer[];
  items: CatalogItem[];
  staff: { id: number; name: string }[];
  taxRates: number[];
  companyStateCode: string;
  canAssignAgent: boolean;
  customFields: ReactNode;
}) {
  const [customerId, setCustomerId] = useState<number | null>(initial.customerId);
  const [date, setDate] = useState(initial.date);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [pos, setPos] = useState(initial.placeOfSupply ?? "");

  const customer = customers.find((c) => c.id === customerId);
  const placeOfSupply = pos || customer?.stateCode || companyStateCode;
  const interstate = placeOfSupply !== companyStateCode;

  const onCustomer = (v: string) => {
    const id = Number(v) || null;
    setCustomerId(id);
    setPos("");
    const c = customers.find((x) => x.id === id);
    if (c) setDueDate(addDays(date, c.paymentTermsDays));
  };

  return (
    <ActionForm action={action} className="space-y-5">
      <section className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="customerId" className="label">Customer <span className="text-red-500">*</span></label>
          <Combobox id="customerId" name="customerId" defaultValue={customerId ? String(customerId) : ""} onChange={onCustomer}
            options={customers.map((c) => ({ value: String(c.id), label: c.company }))} />
          <FieldError name="customerId" />
        </div>
        <div>
          <label htmlFor="date" className="label">Invoice date</label>
          <input id="date" name="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          <FieldError name="date" />
        </div>
        <div>
          <label htmlFor="dueDate" className="label">Due date</label>
          <input id="dueDate" name="dueDate" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
          <FieldError name="dueDate" />
        </div>
        <div>
          <label htmlFor="placeOfSupply" className="label">Place of supply</label>
          <select id="placeOfSupply" name="placeOfSupply" value={placeOfSupply} onChange={(e) => setPos(e.target.value)} className="input">
            {INDIAN_STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.code} · {s.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{interstate ? "Inter-state: IGST applies" : "Intra-state: CGST + SGST apply"}</p>
        </div>
        <div>
          <label htmlFor="orderRef" className="label">Order (customer PO #)</label>
          <input id="orderRef" name="orderRef" defaultValue={initial.orderRef} className="input" />
        </div>
        <div>
          <label htmlFor="tags" className="label">Tags</label>
          <input id="tags" name="tags" defaultValue={initial.tags.join(", ")} className="input" placeholder="Comma separated" />
        </div>
        {canAssignAgent ? (
          <div>
            <label htmlFor="salesAgentId" className="label">Sales agent</label>
            <select id="salesAgentId" name="salesAgentId" defaultValue={initial.salesAgentId ?? ""} className="input">
              <option value="">— None —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label htmlFor="repeatEvery" className="label">Recurring invoice?</label>
          <select id="repeatEvery" name="repeatEvery" defaultValue={initial.repeatEvery ?? ""} className="input">
            <option value="">No</option>
            {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>Every {o.label.toLowerCase()}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">A draft copy is created on each repeat date for you to review and issue.</p>
          <FieldError name="repeatEvery" />
        </div>
      </section>

      <LineItemsEditor items={items} taxRates={taxRates} interstate={interstate} initialLines={initial.lines} initialDiscount={initial.discount} />

      <section className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="notes" className="label">Notes to customer</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={initial.notes} className="input" />
        </div>
        <div>
          <label htmlFor="terms" className="label">Terms &amp; conditions</label>
          <textarea id="terms" name="terms" rows={3} defaultValue={initial.terms} className="input" />
        </div>
      </section>

      {customFields}

      <div className="flex flex-wrap justify-end gap-2">
        <button type="submit" name="intent" value="draft" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50">
          Save as draft
        </button>
        <button type="submit" name="intent" value="issue" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-brand-700">
          Save &amp; issue
        </button>
      </div>
    </ActionForm>
  );
}
