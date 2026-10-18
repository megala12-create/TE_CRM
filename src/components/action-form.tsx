"use client";

import { createContext, useActionState, useContext, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/utils";
import { cn } from "@/lib/utils";

const ErrorsContext = createContext<Record<string, string>>({});

/**
 * Form wrapper for server actions. Submits via a transition so React does not
 * reset the inputs when validation fails, and exposes field errors to <FieldError>.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  id,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  confirm?: string;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const [pending, startTransition] = useTransition();
  return (
    <ErrorsContext.Provider value={state.errors ?? {}}>
      <form
        id={id}
        className={cn(className, pending && "opacity-80")}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm && !window.confirm(confirm)) return;
          // Include the clicked button's name/value (e.g. intent=issue)
          const submitter = (e.nativeEvent as SubmitEvent).submitter;
          const data = new FormData(e.currentTarget, submitter);
          startTransition(() => formAction(data));
        }}
      >
        {state.message ? (
          <div
            role="status"
            className={cn(
              "mb-4 whitespace-pre-line rounded-md px-3 py-2 text-sm",
              state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700",
            )}
          >
            {state.message}
          </div>
        ) : null}
        <fieldset disabled={pending} className="contents">
          {children}
        </fieldset>
      </form>
    </ErrorsContext.Provider>
  );
}

export function FieldError({ name }: { name: string }) {
  const errors = useContext(ErrorsContext);
  const msg = errors[name];
  return msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null;
}

export function SubmitButton({ children, variant = "primary" }: { children: ReactNode; variant?: "primary" | "danger" | "secondary" }) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    danger: "bg-crimson-600 text-white hover:bg-maroon-600",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
  }[variant];
  return (
    <button
      type="submit"
      className={cn("inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium shadow-xs disabled:opacity-60", styles)}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
