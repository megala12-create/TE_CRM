import { timingSafeEqual } from "node:crypto";
import { generateDueRecurringExpenses } from "@/server/recurring-expenses";

export const dynamic = "force-dynamic";

/**
 * Daily job: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/recurring-expenses`
 * (Recurring copies are also generated whenever someone opens the Expenses page.)
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length < 16 || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response("Unauthorised", { status: 401 });
  }
  const created = await generateDueRecurringExpenses();
  return Response.json({ created });
}
