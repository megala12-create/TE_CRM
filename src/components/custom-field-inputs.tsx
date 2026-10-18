import { FieldError } from "./action-form";
import {
  FORM_PREFIX,
  canEditField,
  displayCustomValue,
  type CustomFieldDef,
  type FieldViewer,
} from "@/lib/custom-fields";

/** Renders admin-defined fields inside a form. Read-only fields are shown as text. */
export function CustomFieldInputs({
  fields,
  values,
  viewer,
}: {
  fields: CustomFieldDef[];
  values: Record<string, unknown>;
  viewer: FieldViewer;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        const name = FORM_PREFIX + f.key;
        const value = values[f.key] ?? (f.defaultValue || null);
        const editable = canEditField(f, viewer);
        return (
          <div key={f.id} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
            <label htmlFor={name} className="label">
              {f.label}
              {f.required && editable ? <span className="text-red-500"> *</span> : null}
            </label>
            {editable ? <Input f={f} name={name} value={value} /> : (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {displayCustomValue(f, value) || <span className="text-slate-400">—</span>}
              </p>
            )}
            {f.helpText ? <p className="mt-1 text-xs text-slate-500">{f.helpText}</p> : null}
            <FieldError name={name} />
          </div>
        );
      })}
    </div>
  );
}

function Input({ f, name, value }: { f: CustomFieldDef; name: string; value: unknown }) {
  const str = value === null || value === undefined ? "" : String(value);
  switch (f.type) {
    case "textarea":
      return <textarea id={name} name={name} rows={3} defaultValue={str} className="input" />;
    case "number":
      return <input id={name} name={name} type="number" step="any" defaultValue={str} className="input" />;
    case "currency":
      return <input id={name} name={name} type="number" step="0.01" defaultValue={str} className="input" />;
    case "date":
      return <input id={name} name={name} type="date" defaultValue={str} className="input" />;
    case "email":
      return <input id={name} name={name} type="email" defaultValue={str} className="input" />;
    case "phone":
      return <input id={name} name={name} type="tel" defaultValue={str} className="input" />;
    case "url":
      return <input id={name} name={name} type="url" defaultValue={str} placeholder="https://" className="input" />;
    case "checkbox":
      return (
        <div className="pt-1">
          <input id={name} name={name} type="checkbox" defaultChecked={value === true} className="size-4 accent-brand-600" />
        </div>
      );
    case "select":
      return (
        <select id={name} name={name} defaultValue={str} className="input">
          <option value="">— Select —</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-slate-300 bg-white px-3 py-2">
          {f.options.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" name={name} value={o} defaultChecked={selected.includes(o)} className="accent-brand-600" />
              {o}
            </label>
          ))}
        </div>
      );
    }
    default:
      return <input id={name} name={name} type="text" defaultValue={str} className="input" />;
  }
}

/** Read-only display of custom values on a detail page. */
export function customFieldItems(fields: CustomFieldDef[], values: Record<string, unknown>) {
  return fields.map((f) => ({ label: f.label, value: displayCustomValue(f, values[f.key]) }));
}

export type { FieldViewer };
