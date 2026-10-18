import { revalidatePath } from "next/cache";
import { assertPermission, requirePermission } from "@/server/auth";
import { audit } from "@/server/audit";
import { getCompany, peekNextNumber, saveCompany, setNextNumber, type CompanySettings } from "@/server/settings";
import { PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormGrid, FormSection, SelectField, TextAreaField, TextField } from "@/components/fields";
import { INDIAN_STATES, isValidGstin, stateName } from "@/lib/gst";
import { formatDocNumber, isValidFormat, type DocType } from "@/lib/numbering";
import { todayISO } from "@/lib/format";
import { str, type ActionState } from "@/lib/utils";

export const metadata = { title: "Company settings" };

const DOCS: { type: DocType; label: string }[] = [
  { type: "invoice", label: "Invoices" },
  { type: "proforma", label: "Proforma invoices" },
  { type: "quotation", label: "Quotations" },
  { type: "credit_note", label: "Credit notes" },
];

async function save(_prev: ActionState, form: FormData): Promise<ActionState> {
  "use server";
  const user = await assertPermission("settings.manage");
  const errors: Record<string, string> = {};
  const gstin = str(form, "gstin").toUpperCase();
  const stateCode = str(form, "stateCode");
  const taxRates = [...new Set(str(form, "taxRates").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 0 && n <= 100))].sort((a, b) => a - b);
  const validDays = Number(str(form, "quotationValidDays") || "7");
  if (!str(form, "name")) errors.name = "Company name is required";
  if (gstin && !isValidGstin(gstin)) errors.gstin = "This GSTIN is not valid";
  if (gstin && gstin.slice(0, 2) !== stateCode) errors.stateCode = "State must match the GSTIN";
  if (!INDIAN_STATES.some((s) => s.code === stateCode)) errors.stateCode = "Choose your state";
  if (taxRates.length === 0) errors.taxRates = "Enter at least one rate";
  if (!Number.isInteger(validDays) || validDays < 0 || validDays > 365) errors.quotationValidDays = "0–365 days";

  const formats = {} as Record<DocType, string>;
  const nexts: { doc: DocType; next: number }[] = [];
  for (const d of DOCS) {
    const f = str(form, `format_${d.type}`);
    if (!isValidFormat(f)) errors[`format_${d.type}`] = "Must contain {SEQ} or {SEQ:n}; letters, digits, - _ / only";
    formats[d.type] = f;
    const n = str(form, `next_${d.type}`);
    if (n) {
      if (!/^\d{1,9}$/.test(n) || Number(n) < 1) errors[`next_${d.type}`] = "Enter a positive number";
      else nexts.push({ doc: d.type, next: Number(n) });
    }
  }
  if (Object.keys(errors).length) return { errors, message: "Please fix the highlighted fields." };

  const prev = await getCompany();
  const value: CompanySettings = {
    ...prev,
    name: str(form, "name"),
    legalName: str(form, "legalName"),
    gstin,
    pan: str(form, "pan").toUpperCase(),
    address: str(form, "address"),
    city: str(form, "city"),
    state: stateName(stateCode),
    stateCode,
    pincode: str(form, "pincode"),
    phone: str(form, "phone"),
    email: str(form, "email"),
    website: str(form, "website"),
    numberFormats: formats,
    invoiceTerms: str(form, "invoiceTerms"),
    quotationTerms: str(form, "quotationTerms"),
    quotationValidDays: validDays,
    creditNoteTerms: str(form, "creditNoteTerms"),
    bankName: str(form, "bankName"),
    bankAccount: str(form, "bankAccount"),
    bankIfsc: str(form, "bankIfsc").toUpperCase(),
    upiId: str(form, "upiId"),
    taxRates,
  };
  await saveCompany(value);
  // Applied after saving formats so the series key matches the new format
  for (const n of nexts) await setNextNumber(n.doc, todayISO(), n.next);
  await audit({ userId: user.id, action: "update", entity: "settings", entityId: "company", data: { ...value, nextNumbers: nexts } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

export default async function CompanySettingsPage() {
  await requirePermission("settings.manage");
  const c = await getCompany();
  const today = todayISO();
  const next = Object.fromEntries(await Promise.all(DOCS.map(async (d) => [d.type, await peekNextNumber(d.type, today)] as const))) as Record<DocType, number>;
  return (
    <>
      <PageHeader title="Company settings" subtitle="Shown on invoices, quotations, credit notes and statements." />
      <ActionForm action={save} className="space-y-5">
        <FormSection title="Business">
          <FormGrid>
            <TextField name="name" label="Display name" required defaultValue={c.name} />
            <TextField name="legalName" label="Legal name (on documents)" defaultValue={c.legalName} />
            <TextField name="gstin" label="GSTIN" defaultValue={c.gstin} maxLength={15} />
            <TextField name="pan" label="PAN" defaultValue={c.pan} maxLength={10} />
            <TextField name="phone" label="Phone" defaultValue={c.phone} />
            <TextField name="email" label="Email" type="email" defaultValue={c.email} />
            <TextField name="website" label="Website" defaultValue={c.website} />
          </FormGrid>
        </FormSection>
        <FormSection title="Address">
          <FormGrid>
            <TextAreaField name="address" label="Address" defaultValue={c.address} className="sm:col-span-2" rows={2} />
            <TextField name="city" label="City" defaultValue={c.city} />
            <SelectField name="stateCode" label="State" defaultValue={c.stateCode} options={INDIAN_STATES.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))} />
            <TextField name="pincode" label="PIN code" defaultValue={c.pincode} />
          </FormGrid>
        </FormSection>
        <FormSection title="Document numbering">
          <p className="mb-4 text-sm text-slate-500">
            Tokens: <code>{"{FYS}"}</code> = 25-26, <code>{"{FY}"}</code> = 2025-26, <code>{"{SEQ:6}"}</code> = 000001. Formats with a financial-year token restart at 1 every April.
            Set <strong>Next number</strong> once to continue from your old CRM — it can only move forward.
          </p>
          <div className="space-y-4">
            {DOCS.map((d) => (
              <div key={d.type} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
                <TextField name={`format_${d.type}`} label={`${d.label} format`} defaultValue={c.numberFormats[d.type]} required />
                <TextField name={`next_${d.type}`} label="Next number" type="number" min="1" placeholder={String(next[d.type])} />
                <p className="pb-2 text-sm text-slate-600">
                  Next: <span className="font-mono font-medium">{formatDocNumber(c.numberFormats[d.type], today, next[d.type])}</span>
                </p>
              </div>
            ))}
          </div>
        </FormSection>
        <FormSection title="Defaults">
          <FormGrid>
            <TextField name="taxRates" label="GST rates offered (%)" defaultValue={c.taxRates.join(", ")} hint="Comma separated, e.g. 0, 5, 18, 40" />
            <TextField name="quotationValidDays" label="Quotation valid for (days)" type="number" min="0" max="365" defaultValue={c.quotationValidDays} />
            <TextAreaField name="invoiceTerms" label="Invoice terms" defaultValue={c.invoiceTerms} />
            <TextAreaField name="quotationTerms" label="Quotation terms" defaultValue={c.quotationTerms} />
            <TextAreaField name="creditNoteTerms" label="Credit note terms" defaultValue={c.creditNoteTerms} />
          </FormGrid>
        </FormSection>
        <FormSection title="Bank & UPI (printed on documents)">
          <FormGrid>
            <TextField name="bankName" label="Bank name" defaultValue={c.bankName} />
            <TextField name="bankAccount" label="Account number" defaultValue={c.bankAccount} />
            <TextField name="bankIfsc" label="IFSC" defaultValue={c.bankIfsc} />
            <TextField name="upiId" label="UPI ID" defaultValue={c.upiId} />
          </FormGrid>
        </FormSection>
        <div className="flex justify-end">
          <SubmitButton>Save settings</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
