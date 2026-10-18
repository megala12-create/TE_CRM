"use client";

import { useState } from "react";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES, slugifyKey } from "@/lib/custom-fields";
import type { ActionState } from "@/lib/utils";

type Initial = {
  entity: string;
  key: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  showInList: boolean;
  active: boolean;
  helpText: string;
  defaultValue: string;
  sortOrder: number;
  visibleRoleIds: number[];
  editableRoleIds: number[];
};

export function CustomFieldForm({
  action,
  initial,
  roles,
  isNew,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  initial: Initial;
  roles: { id: number; name: string }[];
  isNew: boolean;
}) {
  const [type, setType] = useState(initial.type);
  const [label, setLabel] = useState(initial.label);
  const [keyTouched, setKeyTouched] = useState(!isNew);
  const [key, setKey] = useState(initial.key);
  const hasOptions = type === "select" || type === "multiselect";

  return (
    <ActionForm action={action} className="space-y-5">
      <section className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="entity" className="label">Show on</label>
          <select id="entity" name="entity" defaultValue={initial.entity} disabled={!isNew} className="input">
            {CUSTOM_FIELD_ENTITIES.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
          <FieldError name="entity" />
        </div>
        <div>
          <label htmlFor="type" className="label">Field type</label>
          <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)} className="input">
            {CUSTOM_FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <FieldError name="type" />
        </div>
        <div>
          <label htmlFor="label" className="label">Label <span className="text-red-500">*</span></label>
          <input
            id="label"
            name="label"
            required
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              if (!keyTouched) setKey(slugifyKey(e.target.value));
            }}
            className="input"
            placeholder="e.g. Preferred process"
          />
          <FieldError name="label" />
        </div>
        <div>
          <label htmlFor="key" className="label">Internal key</label>
          <input
            id="key"
            name="key"
            value={key}
            disabled={!isNew}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(slugifyKey(e.target.value));
            }}
            className="input font-mono"
          />
          <p className="mt-1 text-xs text-slate-500">Used in exports and the API. Cannot be changed later.</p>
          <FieldError name="key" />
        </div>
        {hasOptions ? (
          <div className="sm:col-span-2">
            <label htmlFor="options" className="label">Options (one per line)</label>
            <textarea id="options" name="options" rows={4} defaultValue={initial.options.join("\n")} className="input" placeholder={"DTF\nSilicon HD\nEmbossing"} />
            <FieldError name="options" />
          </div>
        ) : null}
        <div>
          <label htmlFor="defaultValue" className="label">Default value</label>
          <input id="defaultValue" name="defaultValue" defaultValue={initial.defaultValue} className="input" />
        </div>
        <div>
          <label htmlFor="helpText" className="label">Help text</label>
          <input id="helpText" name="helpText" defaultValue={initial.helpText} className="input" />
        </div>
        <div>
          <label htmlFor="sortOrder" className="label">Order</label>
          <input id="sortOrder" name="sortOrder" type="number" defaultValue={initial.sortOrder} className="input" />
        </div>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <Check name="required" label="Required" defaultChecked={initial.required} />
          <Check name="showInList" label="Show as a column in list tables" defaultChecked={initial.showInList} />
          <Check name="active" label="Active (uncheck to hide without deleting data)" defaultChecked={initial.active} />
        </div>
      </section>

      <section className="card grid grid-cols-1 gap-6 p-5 sm:grid-cols-2">
        <RolePicker name="visibleRoleIds" title="Visible to" roles={roles} selected={initial.visibleRoleIds} />
        <RolePicker name="editableRoleIds" title="Editable by" roles={roles} selected={initial.editableRoleIds} />
        <p className="text-xs text-slate-500 sm:col-span-2">
          Leave all unticked to allow every role. Administrators always see and edit every field. Use this for sensitive
          fields like cost price or bank details.
        </p>
      </section>

      <div className="flex justify-end">
        <SubmitButton>{isNew ? "Add field" : "Save field"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-brand-600" />
      {label}
    </label>
  );
}

function RolePicker({ name, title, roles, selected }: { name: string; title: string; roles: { id: number; name: string }[]; selected: number[] }) {
  return (
    <fieldset>
      <legend className="label">{title}</legend>
      <div className="space-y-1.5">
        {roles.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name={name} value={r.id} defaultChecked={selected.includes(r.id)} className="size-4 accent-brand-600" />
            {r.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
