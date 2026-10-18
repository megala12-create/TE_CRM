"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CircleHelp, FileText, Paperclip, Plus } from "lucide-react";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Combobox } from "@/components/combobox";
import { CategoryQuickAdd } from "@/components/category-quick-add";
import { expenseTotals, REPEAT_OPTIONS, type TaxOption } from "@/lib/expense";
import { PAYMENT_MODES } from "@/lib/invoice-status";
import { formatPaise } from "@/lib/money";
import type { ActionState } from "@/lib/utils";

export type ExpenseFormValues = {
  name: string;
  categoryId: number | null;
  date: string;
  amount: string;
  tax1: string;
  tax2: string;
  paymentMode: string | null;
  vendorId: number | null;
  reference: string | null;
  customerId: number | null;
  billable: boolean;
  note: string | null;
  project: string | null;
  repeatEvery: string | null;
  receipt: { name: string; url: string; type: string } | null;
};

export function ExpenseForm({
  action,
  canAddCategory,
  initial,
  categories: initialCategories,
  customers,
  vendors,
  taxOptions,
  customFields,
  isNew,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  canAddCategory: boolean;
  initial: ExpenseFormValues;
  categories: { id: number; name: string }[];
  customers: { id: number; company: string }[];
  vendors: { id: number; name: string; gstin: string | null }[];
  taxOptions: TaxOption[];
  customFields: ReactNode;
  isNew: boolean;
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState(initial.categoryId ? String(initial.categoryId) : "");
  const [customerId, setCustomerId] = useState(initial.customerId ? String(initial.customerId) : "");
  const [amount, setAmount] = useState(initial.amount);
  const [tax1, setTax1] = useState(initial.tax1);
  const [tax2, setTax2] = useState(initial.tax2);
  const [fileName, setFileName] = useState<string | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);

  const rate = (v: string) => taxOptions.find((t) => t.value === v)?.rate ?? 0;
  const totals = useMemo(() => {
    try {
      return /^\d+(\.\d{1,2})?$/.test(amount) ? expenseTotals(amount, [rate(tax1), tax1 ? rate(tax2) : 0]) : null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, tax1, tax2]);

  return (
    <ActionForm action={action} className="space-y-5">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Left: expense ─────────────────────────────── */}
        <div>
          <h2 className="mb-3 text-base font-semibold text-slate-900">{isNew ? "Add new expense" : "Edit expense"}</h2>
          <section className="card">
            <div className="border-b border-slate-200 p-5">
              {initial.receipt && !removeReceipt && !fileName ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <a href={initial.receipt.url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-2">
                    <FileText className="size-4" /> {initial.receipt.name}
                  </a>
                  <label className="flex items-center gap-1.5 text-red-600">
                    <input type="checkbox" name="removeReceipt" onChange={(e) => setRemoveReceipt(e.target.checked)} className="accent-red-600" />
                    Remove
                  </label>
                </div>
              ) : null}
              <label
                className={`relative mt-0 flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-brand-200 px-4 py-6 text-sm text-brand-600 hover:border-brand-500 hover:bg-brand-50 ${initial.receipt && !removeReceipt && !fileName ? "mt-3" : ""}`}
              >
                <input
                  type="file"
                  name="receipt"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                  aria-label="Attach receipt"
                />
                <Paperclip className="mb-1 size-5" aria-hidden />
                {fileName ? <span className="font-medium text-slate-800">{fileName}</span> : <span>{initial.receipt ? "Replace receipt" : "Attach receipt"}</span>}
                <span className="mt-0.5 text-xs text-slate-400">PDF, JPG, PNG or WEBP · max 10 MB · drop a file here</span>
              </label>
              <FieldError name="receipt" />
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label htmlFor="vendorId" className="label">Vendors</label>
                <Combobox id="vendorId" name="vendorId" emptyLabel="None" defaultValue={initial.vendorId ? String(initial.vendorId) : ""}
                  options={vendors.map((v) => ({ value: String(v.id), label: v.name, hint: v.gstin ?? undefined }))} />
                <FieldError name="vendorId" />
              </div>

              <div>
                <label htmlFor="name" className="label inline-flex items-center gap-1">
                  <span title="A short name for this expense, e.g. “DTF film roll”. Shown in lists instead of the category."><CircleHelp className="size-3.5 text-slate-400" /></span>
                  Name
                </label>
                <input id="name" name="name" defaultValue={initial.name} className="input" maxLength={200} />
              </div>

              <div>
                <label htmlFor="note" className="label inline-flex items-center gap-1">
                  <span title="Internal note — not shown to customers."><CircleHelp className="size-3.5 text-slate-400" /></span>
                  Note
                </label>
                <textarea id="note" name="note" rows={4} defaultValue={initial.note ?? ""} className="input" />
              </div>

              <div>
                <label htmlFor="categoryId" className="label"><span className="text-red-500">* </span>Expense category</label>
                <div className="flex">
                  <select id="categoryId" name="categoryId" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={canAddCategory ? "input rounded-r-none" : "input"}>
                    <option value="">None selected</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {canAddCategory ? (
                    <CategoryQuickAdd
                      attached
                      onAdded={(res) => {
                        setCategories((cs) => (cs.some((c) => c.id === res.id) ? cs : [...cs, res].sort((x, y) => x.name.localeCompare(y.name))));
                        setCategoryId(String(res.id));
                      }}
                    />
                  ) : null}
                </div>
                <FieldError name="categoryId" />
              </div>

              <div>
                <label htmlFor="date" className="label"><span className="text-red-500">* </span>Expense date</label>
                <input id="date" name="date" type="date" required defaultValue={initial.date} className="input" />
                <FieldError name="date" />
              </div>

              <div>
                <label htmlFor="amount" className="label"><span className="text-red-500">* </span>Amount</label>
                <input id="amount" name="amount" type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
                <FieldError name="amount" />
              </div>

              <div>
                <label htmlFor="customerId" className="label">Customer</label>
                <Combobox id="customerId" name="customerId" defaultValue={customerId} onChange={setCustomerId}
                  options={customers.map((c) => ({ value: String(c.id), label: c.company }))} />
                <FieldError name="customerId" />
                {customerId ? (
                  <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="billable" defaultChecked={initial.billable} className="size-4 accent-brand-600" />
                    Billable to this customer
                  </label>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        {/* ── Right: advanced options ───────────────────── */}
        <div>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Advanced options</h2>
          <section className="card space-y-4 p-5">
            <div>
              <label htmlFor="currency" className="label"><span className="text-red-500">* </span>Currency</label>
              <select id="currency" disabled className="input" defaultValue="INR">
                <option value="INR">INR ₹</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tax1" className="label">Tax 1</label>
                <select id="tax1" name="tax1" value={tax1} onChange={(e) => { setTax1(e.target.value); if (!e.target.value) setTax2(""); }} className="input">
                  <option value="">No tax</option>
                  {taxOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <FieldError name="tax1" />
              </div>
              <div>
                <label htmlFor="tax2" className="label">Tax 2</label>
                <select id="tax2" name="tax2" value={tax1 ? tax2 : ""} onChange={(e) => setTax2(e.target.value)} disabled={!tax1} className="input">
                  <option value="">No tax</option>
                  {taxOptions.filter((t) => t.value !== tax1).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <FieldError name="tax2" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="paymentMode" className="label">Payment mode</label>
                <select id="paymentMode" name="paymentMode" defaultValue={initial.paymentMode ?? ""} className="input">
                  <option value="">None selected</option>
                  {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <FieldError name="paymentMode" />
              </div>
              <div>
                <label htmlFor="reference" className="label">Reference #</label>
                <input id="reference" name="reference" defaultValue={initial.reference ?? ""} className="input" />
              </div>
            </div>
            <div>
              <label htmlFor="project" className="label">Project</label>
              <input id="project" name="project" defaultValue={initial.project ?? ""} className="input" />
            </div>
            <div>
              <label htmlFor="repeatEvery" className="label">Repeat every</label>
              <select id="repeatEvery" name="repeatEvery" defaultValue={initial.repeatEvery ?? ""} className="input">
                <option value="">None selected</option>
                {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-slate-500">A copy of this expense is created automatically on each repeat date.</p>
              <FieldError name="repeatEvery" />
            </div>

            <dl className="space-y-1 rounded-md bg-slate-50 p-3 text-sm">
              <div className="flex justify-between"><dt className="text-slate-600">Amount</dt><dd className="tabular-nums">{totals ? formatPaise(totals.amountPaise) : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">Tax</dt><dd className="tabular-nums">{totals ? formatPaise(totals.taxPaise) : "—"}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{totals ? formatPaise(totals.totalPaise) : "—"}</dd></div>
            </dl>
          </section>

          {customFields ? <div className="mt-5">{customFields}</div> : null}
        </div>
      </div>

      <div className="flex justify-end">
        <SubmitButton>{isNew ? "Save expense" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
