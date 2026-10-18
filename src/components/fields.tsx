import type { ReactNode } from "react";
import { FieldError } from "./action-form";
import { cn } from "@/lib/utils";

type Common = { name: string; label: string; required?: boolean; hint?: ReactNode; className?: string };

export function TextField({
  name,
  label,
  required,
  hint,
  className,
  type = "text",
  defaultValue,
  placeholder,
  ...rest
}: Common & {
  type?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  step?: string;
  min?: string;
  max?: string;
  autoComplete?: string;
  maxLength?: number;
  readOnly?: boolean;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? undefined}
        placeholder={placeholder}
        className="input"
        {...rest}
      />
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      <FieldError name={name} />
    </div>
  );
}

export function TextAreaField({
  name,
  label,
  required,
  hint,
  className,
  defaultValue,
  rows = 3,
}: Common & { defaultValue?: string | null; rows?: number }) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <textarea id={name} name={name} rows={rows} required={required} defaultValue={defaultValue ?? ""} className="input" />
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      <FieldError name={name} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  required,
  hint,
  className,
  defaultValue,
  options,
  placeholder,
}: Common & {
  defaultValue?: string | number | null;
  options: { value: string | number; label: string }[];
  placeholder?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <select id={name} name={name} required={required} defaultValue={defaultValue ?? ""} className="input">
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      <FieldError name={name} />
    </div>
  );
}

export function CheckboxField({
  name,
  label,
  defaultChecked,
  hint,
  className,
}: Omit<Common, "required"> & { defaultChecked?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <input id={name} name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-0.5 size-4 rounded border-slate-300 accent-brand-600" />
      <div>
        <label htmlFor={name} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
        <FieldError name={name} />
      </div>
    </div>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}
