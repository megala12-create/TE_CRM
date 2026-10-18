"use client";

/** Header checkbox that ticks/unticks every `name` checkbox belonging to the form `formId` (including inputs linked with the form= attribute). */
export function SelectAll({ formId, name, label = "Select all" }: { formId: string; name: string; label?: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="size-4 accent-brand-600"
      onChange={(e) => {
        const form = document.getElementById(formId) as HTMLFormElement | null;
        if (!form) return;
        for (const el of Array.from(form.elements)) {
          if (el instanceof HTMLInputElement && el.type === "checkbox" && el.name === name) el.checked = e.currentTarget.checked;
        }
      }}
    />
  );
}
