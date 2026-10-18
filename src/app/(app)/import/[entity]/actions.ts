"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/server/auth";
import { runImport, type ImportResult } from "@/server/importers";
import { IMPORT_DEFS, csvTable, isImportEntity } from "@/lib/importing";
import { xlsxRows } from "@/lib/xlsx";

export type ImportState = Partial<ImportResult> & { fileName?: string; committed?: boolean };

const MAX_BYTES = 5 * 1024 * 1024;

/** Step 1 (intent=preview) checks the file; step 2 (intent=import) re-reads the same file and saves the valid rows. */
export async function importFile(entity: string, _prev: ImportState, form: FormData): Promise<ImportState> {
  if (!isImportEntity(entity)) return { message: "Unknown import." };
  const user = await assertPermission(IMPORT_DEFS[entity].permission);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose a file (.csv or .xlsx)." };
  if (file.size > MAX_BYTES) return { message: "The file is larger than 5 MB — split it." };

  let table: string[][];
  try {
    if (/\.xlsx$/i.test(file.name)) table = xlsxRows(new Uint8Array(await file.arrayBuffer()));
    else if (/\.csv$/i.test(file.name) || file.type === "text/csv") table = csvTable(await file.text());
    else return { message: "Upload a .csv or .xlsx file. Old .xls files: open in Excel and Save As .xlsx or CSV." };
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Could not read the file." };
  }

  const commit = form.get("intent") === "import";
  const result = await runImport(entity, user, table, { commit, createCustomers: form.get("createCustomers") === "on" });
  if (commit && result.imported) {
    revalidatePath(IMPORT_DEFS[entity].back);
    if (entity === "invoices" || entity === "payments") revalidatePath("/", "layout");
  }
  return { ...result, fileName: file.name, committed: commit };
}
