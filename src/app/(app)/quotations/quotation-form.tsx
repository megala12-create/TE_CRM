"use client";

import { useState, type ReactNode } from "react";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Combobox } from "@/components/combobox";
import { LineItemsEditor, type CatalogItem, type EditorLine } from "@/components/line-items-editor";
import { INDIAN_STATES } from "@/lib/gst";
import { QUOTATION_STATUSES, QUOTATION_STATUS_LABEL } from "@/lib/doc-status";
import { addDays } from "@/lib/format";
import type { ActionState } from "@/lib/utils";

export type QuotationCustomer = { id: number; company: string; stateCode: string | null; email: string | null; phone: string | null; address: string };

export type QuotationFormInitial = {
  subject: string;
  customerId: number | null;
  toName: string;
  toEmail: string;
  toPhone: string;
  toAddress: string;
  status: string;
  date: string;
  openTill: string;
  project: string;
  tags: string[];
  placeOfSupply: string | null;
  salesAgentId: number | null;
  discount: string;
  notes: string;
  terms: string;
  lines: EditorLine[];
};

export function QuotationForm({
  action,
  initial,
  isNew,
  customers,
  items,
  staff,
  taxRates,
  companyStateCode,
  validDays,
  canAssignAgent,
  customFields,
  label = "Quotation",
  requireCustomer = false,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  initial: QuotationFormInitial;
  isNew: boolean;
  customers: QuotationCustomer[];
  items: CatalogItem[];
  staff: { id: number; name: string }[];
  taxRates: number[];
  companyStateCode: string;
  validDays: number;
  canAssignAgent: boolean;
  customFields: ReactNode;
  label?: string;
  requireCustomer?: boolean;
}) {
  const [customerId, setCustomerId] = useState(initial.customerId ? String(initial.customerId) : "");
  const [to, setTo] = useState({ name: initial.toName, email: initial.toEmail, phone: initial.toPhone, address: initial.toAddress });
  const [date, setDate] = useState(initial.date);
  const [openTill, setOpenTill] = useState(initial.openTill);
  const [pos, setPos] = useState(initial.placeOfSupply ?? "");

  const customer = customers.find((c) => String(c.id) === customerId);
  const placeOfSupply = pos || customer?.stateCode || companyStateCode;
  const interstate = placeOfSupply !== companyStateCode;

  const onCustomer = (v: string) => {
    setCustomerId(v);
    setPos("");
    const c = customers.find((x) => String(x.id) === v);
    if (c) setTo({ name: c.company, email: c.email ?? "", phone: c.phone ?? "", address: c.address });
  };

  return (
    <ActionForm action={action} className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <div>
            <label htmlFor="subject" className="label"><span className="text-red-500">* </span>Subject</label>
            <input id="subject" name="subject" required defaultValue={initial.subject} className="input" placeholder="e.g. HD Stickers, Embossing with Print" />
            <FieldError name="subject" />
          </div>
          <div>
            <label htmlFor="customerId" className="label">{requireCustomer ? <span className="text-red-500">* </span> : null}Customer</label>
            <Combobox id="customerId" name="customerId" defaultValue={customerId} onChange={onCustomer} emptyLabel={requireCustomer ? undefined : "— Prospect (not yet a customer) —"}
              options={customers.map((c) => ({ value: String(c.id), label: c.company }))} />
            <p className="mt-1 text-xs text-slate-500">{requireCustomer ? "The customer’s billing details are filled in below." : "Pick a customer to fill the details below, or leave empty and type a prospect’s details."}</p>
            <FieldError name="customerId" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="date" className="label"><span className="text-red-500">* </span>Date</label>
              <input id="date" name="date" type="date" required value={date}
                onChange={(e) => { setDate(e.target.value); if (isNew) setOpenTill(addDays(e.target.value, validDays)); }} className="input" />
              <FieldError name="date" />
            </div>
            <div>
              <label htmlFor="openTill" className="label">Open till</label>
              <input id="openTill" name="openTill" type="date" value={openTill} onChange={(e) => setOpenTill(e.target.value)} className="input" />
              <FieldError name="openTill" />
            </div>
            <div>
              <label htmlFor="status" className="label">Status</label>
              <select id="status" name="status" defaultValue={initial.status} className="input">
                {QUOTATION_STATUSES.map((s) => <option key={s} value={s}>{QUOTATION_STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            {canAssignAgent ? (
              <div>
                <label htmlFor="salesAgentId" className="label">Assigned (marketing by)</label>
                <select id="salesAgentId" name="salesAgentId" defaultValue={initial.salesAgentId ?? ""} className="input">
                  <option value="">— None —</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            ) : null}
            <div>
              <label htmlFor="tags" className="label">Tags</label>
              <input id="tags" name="tags" defaultValue={initial.tags.join(", ")} className="input" placeholder="Comma separated" />
            </div>
            <div>
              <label htmlFor="project" className="label">Project</label>
              <input id="project" name="project" defaultValue={initial.project} className="input" />
            </div>
          </div>
        </section>

        <section className="card space-y-4 p-5">
          <div>
            <label htmlFor="toName" className="label"><span className="text-red-500">* </span>To</label>
            <input id="toName" name="toName" required value={to.name} onChange={(e) => setTo({ ...to, name: e.target.value })} className="input" />
            <FieldError name="toName" />
          </div>
          <div>
            <label htmlFor="toAddress" className="label">Address</label>
            <textarea id="toAddress" name="toAddress" rows={3} value={to.address} onChange={(e) => setTo({ ...to, address: e.target.value })} className="input" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="toEmail" className="label">Email</label>
              <input id="toEmail" name="toEmail" type="email" value={to.email} onChange={(e) => setTo({ ...to, email: e.target.value })} className="input" />
              <FieldError name="toEmail" />
            </div>
            <div>
              <label htmlFor="toPhone" className="label">Phone</label>
              <input id="toPhone" name="toPhone" type="tel" value={to.phone} onChange={(e) => setTo({ ...to, phone: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label htmlFor="placeOfSupply" className="label">Place of supply</label>
            <select id="placeOfSupply" name="placeOfSupply" value={placeOfSupply} onChange={(e) => setPos(e.target.value)} className="input">
              {INDIAN_STATES.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">{interstate ? "Inter-state: IGST applies" : "Intra-state: CGST + SGST apply"}</p>
          </div>
        </section>
      </div>

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

      <div className="flex justify-end">
        <SubmitButton>{isNew ? `Save ${label.toLowerCase()}` : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
