import { getCurrentUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { IMPORT_DEFS, isImportEntity, sampleCsv } from "@/lib/importing";

/** Sample CSV for an import screen (/import/[entity]). Expenses has its own route. */
export async function GET(_request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  const { entity } = await params;
  if (!isImportEntity(entity)) return new Response("Not found", { status: 404 });
  if (!can(user, IMPORT_DEFS[entity].permission)) return new Response("Forbidden", { status: 403 });
  return new Response("﻿" + sampleCsv(entity), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${entity.replace(/_/g, "-")}-import-sample.csv"` },
  });
}
