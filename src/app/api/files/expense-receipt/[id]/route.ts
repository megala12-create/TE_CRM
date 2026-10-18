import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/server/auth";
import { expenseScope } from "@/server/scope";
import { readUpload } from "@/server/storage";
import { viewScope } from "@/lib/permissions";

/** Serves an expense receipt only to users allowed to see that expense. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  if (viewScope(user, "expenses") === "none") return new Response("Forbidden", { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const [e] = await db
    .select({ key: schema.expenses.receiptKey, name: schema.expenses.receiptName, type: schema.expenses.receiptType })
    .from(schema.expenses)
    .where(and(eq(schema.expenses.id, id), expenseScope(user)))
    .limit(1);
  if (!e?.key) return new Response("Not found", { status: 404 });
  const data = await readUpload(e.key);
  if (!data) return new Response("File missing", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": e.type ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${(e.name ?? "receipt").replace(/"/g, "")}"`,
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}
