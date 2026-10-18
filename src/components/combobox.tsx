"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string; hint?: string };

/**
 * Searchable single-select ("Select and begin typing"). Submits its value through
 * a hidden input named `name`, so it works inside ordinary server-action forms.
 */
export function Combobox({
  name,
  options,
  defaultValue = "",
  placeholder = "Select and begin typing",
  emptyLabel,
  onChange,
  id,
}: {
  name: string;
  options: ComboOption[];
  defaultValue?: string;
  placeholder?: string;
  /** When set, an explicit "none" choice is offered with this label. */
  emptyLabel?: string;
  onChange?: (value: string) => void;
  id?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options;
    return list.slice(0, 100);
  }, [options, query]);
  const items: ComboOption[] = emptyLabel && !query ? [{ value: "", label: emptyLabel }, ...filtered] : filtered;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (v: string) => {
    setValue(v);
    setQuery("");
    setOpen(false);
    onChange?.(v);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className="input pr-14"
          placeholder={selected ? selected.label : (emptyLabel ?? placeholder)}
          value={open ? query : (selected?.label ?? "")}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && open) {
              e.preventDefault();
              const it = items[active];
              if (it) choose(it.value);
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-slate-400">
          {value ? (
            <button
              type="button"
              className="pointer-events-auto rounded p-0.5 hover:bg-slate-100 hover:text-slate-600"
              onClick={() => choose("")}
              aria-label="Clear selection"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
          <ChevronDown className="size-4" aria-hidden />
        </div>
      </div>
      {open ? (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {items.length === 0 ? <li className="px-3 py-2 text-slate-500">No matches</li> : null}
          {items.map((o, i) => (
            <li
              key={o.value || "__none"}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o.value);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "cursor-pointer px-3 py-1.5",
                i === active && "bg-brand-50",
                o.value === value && "font-semibold text-brand-700",
                !o.value && "text-slate-500",
              )}
            >
              {o.label}
              {o.hint ? <span className="ml-2 text-xs text-slate-400">{o.hint}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
