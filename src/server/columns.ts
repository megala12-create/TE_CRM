import "server-only";
import { getPref } from "./prefs";
import type { CustomFieldDef } from "@/lib/custom-fields";

export type BuiltinColumn = { key: string; label: string; default: boolean };

/**
 * Resolves which columns a user sees in a list: built-in columns plus custom
 * fields flagged "show as column", filtered by the user's saved choice.
 */
export async function resolveColumns(userId: number, listKey: string, builtin: BuiltinColumn[], fields: CustomFieldDef[]) {
  const options = [
    ...builtin.map((c) => ({ key: c.key, label: c.label })),
    ...fields.map((f) => ({ key: `cf:${f.key}`, label: f.label })),
  ];
  const defaults = [...builtin.filter((c) => c.default).map((c) => c.key), ...fields.filter((f) => f.showInList).map((f) => `cf:${f.key}`)];
  const saved = await getPref<string[]>(userId, `columns:${listKey}`);
  const known = new Set(options.map((o) => o.key));
  // Columns added after the user saved a choice (new built-in columns, new "show as column" fields)
  // appear automatically once; columns the user already saw and hid stay hidden.
  const savedSeen = new Set(await getPref<string[]>(userId, `columns-seen:${listKey}`) ?? []);
  const fresh = defaults.filter((k) => !savedSeen.has(k));
  const selected = saved ? [...saved.filter((k) => known.has(k)), ...fresh.filter((k) => !saved.includes(k))] : defaults;
  return {
    options,
    selected,
    visibleFields: fields.filter((f) => selected.includes(`cf:${f.key}`)),
    show: (key: string) => selected.includes(key),
  };
}
