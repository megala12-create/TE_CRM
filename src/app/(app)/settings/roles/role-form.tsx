"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, FieldError } from "@/components/action-form";
import { PERMISSION_MODULES, ACTION_LABELS, ALL_ACTIONS } from "@/lib/permissions";
import type { ActionState } from "@/lib/utils";

export function RoleForm({
  action,
  initial,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  initial: { name: string; description: string; permissions: string[] };
}) {
  const [granted, setGranted] = useState(() => new Set(initial.permissions));

  const toggle = (perm: string, on: boolean) =>
    setGranted((prev) => {
      const next = new Set(prev);
      if (on) next.add(perm);
      else next.delete(perm);
      return next;
    });

  const setModule = (module: string, actions: readonly string[], on: boolean) =>
    setGranted((prev) => {
      const next = new Set(prev);
      for (const a of actions) {
        if (on) next.add(`${module}.${a}`);
        else next.delete(`${module}.${a}`);
      }
      // "view" and "view_own" together is redundant; keep only "view"
      if (on && actions.includes("view_own")) next.delete(`${module}.view_own`);
      return next;
    });

  return (
    <ActionForm action={action} className="space-y-5">
      <section className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label">Role name <span className="text-red-500">*</span></label>
          <input id="name" name="name" required defaultValue={initial.name} className="input" placeholder="e.g. Production Supervisor" />
          <FieldError name="name" />
        </div>
        <div>
          <label htmlFor="description" className="label">Description</label>
          <input id="description" name="description" defaultValue={initial.description} className="input" />
        </div>
      </section>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Permissions</h2>
          <div className="flex gap-3 text-sm">
            <button type="button" className="link" onClick={() => setGranted(new Set(PERMISSION_MODULES.flatMap((m) => m.actions.filter((a) => a !== "view_own").map((a) => `${m.module}.${a}`))))}>
              Select all
            </button>
            <button type="button" className="link" onClick={() => setGranted(new Set())}>
              Clear
            </button>
          </div>
        </div>
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="th">Module</th>
              {ALL_ACTIONS.map((a) => (
                <th key={a} className="th text-center">{ACTION_LABELS[a]}</th>
              ))}
              <th className="th text-center">All</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MODULES.map((m) => {
              const actions = m.actions as readonly string[];
              const allOn = actions.filter((a) => a !== "view_own").every((a) => granted.has(`${m.module}.${a}`));
              return (
                <tr key={m.module} className="hover:bg-slate-50">
                  <td className="td font-medium text-slate-800">
                    {m.label}
                    {"planned" in m && m.planned ? <span className="ml-2 text-xs font-normal text-amber-600">planned</span> : null}
                  </td>
                  {ALL_ACTIONS.map((a) => {
                    const perm = `${m.module}.${a}`;
                    return (
                      <td key={a} className="td text-center">
                        {actions.includes(a) ? (
                          <input
                            type="checkbox"
                            name="permissions"
                            value={perm}
                            checked={granted.has(perm)}
                            onChange={(e) => toggle(perm, e.target.checked)}
                            aria-label={`${m.label}: ${ACTION_LABELS[a]}`}
                            className="size-4 accent-brand-600"
                          />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="td text-center">
                    <input
                      type="checkbox"
                      checked={allOn}
                      onChange={(e) => setModule(m.module, actions.filter((a) => a !== "view_own"), e.target.checked)}
                      aria-label={`All ${m.label} permissions`}
                      className="size-4 accent-brand-600"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-slate-500">
          <strong>View (own)</strong> lets a user see only records they own: customers where they are the account owner, invoices where they are the sales agent or creator, and expenses they recorded.
        </p>
      </section>

      <div className="flex justify-end gap-2">
        <SubmitButton>Save role</SubmitButton>
      </div>
    </ActionForm>
  );
}
