"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { setPref } from "./prefs";

const LISTS: Record<string, string> = { customers: "/customers", invoices: "/invoices", expenses: "/expenses", payments: "/payments", quotations: "/quotations", proforma: "/proforma-invoices", credit_notes: "/credit-notes" };

export async function saveColumns(listKey: string, keys: string[], offered: string[]) {
  const user = await requireUser();
  const path = LISTS[listKey];
  if (!path) return;
  const clean = (a: string[]) => a.filter((k) => typeof k === "string" && k.length < 80).slice(0, 80);
  await setPref(user.id, `columns:${listKey}`, clean(keys));
  // Remember every column the user was offered, so only columns added later auto-appear
  await setPref(user.id, `columns-seen:${listKey}`, clean(offered));
  revalidatePath(path);
}
