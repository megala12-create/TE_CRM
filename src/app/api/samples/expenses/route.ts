import { getCurrentUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { BANK_SAMPLE_CSV } from "@/lib/bank-statement";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  if (!can(user, "expenses.create")) return new Response("Forbidden", { status: 403 });
  return new Response("﻿" + BANK_SAMPLE_CSV + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="bank-statement-sample.csv"' },
  });
}
