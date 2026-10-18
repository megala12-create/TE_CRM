import { z } from "zod";

export const CUSTOM_FIELD_ENTITIES = [
  { value: "customers", label: "Customers" },
  { value: "contacts", label: "Contacts" },
  { value: "invoices", label: "Invoices" },
  { value: "quotations", label: "Quotations" },
  { value: "proforma_invoices", label: "Proforma invoices" },
  { value: "credit_notes", label: "Credit notes" },
  { value: "payments", label: "Payments" },
  { value: "expenses", label: "Expenses" },
] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number]["value"];

export const CUSTOM_FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Amount (₹)" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "multiselect", label: "Multi-select" },
  { value: "checkbox", label: "Yes / No" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "Link (URL)" },
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]["value"];

export type CustomFieldDef = {
  id: number;
  entity: string;
  key: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  showInList: boolean;
  helpText: string | null;
  defaultValue: string | null;
  sortOrder: number;
  active: boolean;
  visibleRoleIds: number[] | null;
  editableRoleIds: number[] | null;
};

export type FieldViewer = { isAdmin: boolean; roleId: number | null };

export function canSeeField(f: Pick<CustomFieldDef, "visibleRoleIds">, u: FieldViewer): boolean {
  if (u.isAdmin || !f.visibleRoleIds || f.visibleRoleIds.length === 0) return true;
  return u.roleId !== null && f.visibleRoleIds.includes(u.roleId);
}

export function canEditField(f: Pick<CustomFieldDef, "visibleRoleIds" | "editableRoleIds">, u: FieldViewer): boolean {
  if (!canSeeField(f, u)) return false;
  if (u.isAdmin || !f.editableRoleIds || f.editableRoleIds.length === 0) return true;
  return u.roleId !== null && f.editableRoleIds.includes(u.roleId);
}

/** Turns a label into a stable storage key: "Brand Name" → "brand_name". */
export function slugifyKey(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field"
  );
}

export const FORM_PREFIX = "cf__";

function valueSchema(f: CustomFieldDef): z.ZodType<unknown> {
  const req = (s: z.ZodString) => (f.required ? s.min(1, `${f.label} is required`) : s);
  switch (f.type) {
    case "number":
    case "currency":
      return z
        .string()
        .trim()
        .refine((v) => (v === "" ? !f.required : Number.isFinite(Number(v))), `${f.label} must be a number`)
        .transform((v) => (v === "" ? null : f.type === "currency" ? Number(v).toFixed(2) : Number(v)));
    case "date":
      return req(z.string().trim())
        .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), `${f.label} must be a date`)
        .transform((v) => v || null);
    case "checkbox":
      return z.string().optional().transform((v) => v === "on" || v === "true");
    case "select":
      return req(z.string().trim())
        .refine((v) => v === "" || f.options.includes(v), `${f.label}: choose a listed option`)
        .transform((v) => v || null);
    case "multiselect":
      return z
        .array(z.string())
        .refine((v) => v.every((x) => f.options.includes(x)), `${f.label}: invalid option`)
        .refine((v) => !f.required || v.length > 0, `${f.label} is required`);
    case "email":
      return req(z.string().trim())
        .refine((v) => v === "" || z.email().safeParse(v).success, `${f.label} must be an email`)
        .transform((v) => v || null);
    case "url":
      return req(z.string().trim())
        .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), `${f.label} must start with http(s)://`)
        .transform((v) => v || null);
    default:
      return req(z.string().trim().max(5000)).transform((v) => v || null);
  }
}

/**
 * Reads custom-field values from submitted FormData, validates them against the
 * definitions the user may edit, and merges onto the previous values so that
 * fields hidden from (or read-only for) this user are preserved untouched.
 */
export function parseCustomFields(
  defs: CustomFieldDef[],
  form: FormData,
  viewer: FieldViewer,
  previous: Record<string, unknown> = {},
): { ok: true; value: Record<string, unknown> } | { ok: false; errors: Record<string, string> } {
  const result: Record<string, unknown> = { ...previous };
  const errors: Record<string, string> = {};
  for (const f of defs) {
    if (!f.active || !canEditField(f, viewer)) continue;
    const name = FORM_PREFIX + f.key;
    const raw = f.type === "multiselect" ? form.getAll(name).map(String) : (form.get(name) ?? "").toString();
    const parsed = valueSchema(f).safeParse(f.type === "checkbox" && raw === "" ? undefined : raw);
    if (parsed.success) result[f.key] = parsed.data;
    else errors[name] = parsed.error.issues[0]?.message ?? "Invalid value";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: result };
}

export function displayCustomValue(f: Pick<CustomFieldDef, "type">, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (f.type === "checkbox") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  if (f.type === "currency") {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(v));
  }
  if (f.type === "date" && typeof v === "string") return formatDateStr(v);
  return String(v);
}

function formatDateStr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}-${m}-${y}` : iso;
}
