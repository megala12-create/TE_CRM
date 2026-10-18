import "server-only";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { quotationScope } from "@/server/scope";
import { viewScope } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth";
import { QUOTE_KINDS, type QuoteKind } from "@/lib/sales-kinds";

export async function loadQuotationDetail(user: CurrentUser, rawId: string, kind: QuoteKind = "quotation") {
  if (viewScope(user, QUOTE_KINDS[kind].module) === "none") redirect("/forbidden");
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();
  const [quotation] = await db.select().from(schema.quotations).where(and(eq(schema.quotations.id, id), quotationScope(user, kind))).limit(1);
  if (!quotation) notFound();
  const lines = await db.select().from(schema.quotationLines).where(eq(schema.quotationLines.quotationId, id)).orderBy(asc(schema.quotationLines.sortOrder));
  return { quotation, lines };
}
