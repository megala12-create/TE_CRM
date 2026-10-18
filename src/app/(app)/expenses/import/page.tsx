import { asc, eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { can } from "@/lib/permissions";
import { AnchorButton, Card, PageHeader } from "@/components/ui";
import { BankImport } from "./import-client";

export const metadata = { title: "Import expenses" };

const COLUMNS: [string, string][] = [
  ["Sl. No.", "Row number from your sheet (shown in the preview)"],
  ["Value Date", "Becomes the expense date (16-08-2026, 16/08/2026 or 16-Aug-2026)"],
  ["Description", "Becomes the expense name; also used to suggest the category and payment mode"],
  ["Chq /Ref No.", "Saved as Reference #; used to detect duplicates (can be empty)"],
  ["Amount", "Expense amount (1,23,456.70 is fine)"],
  ["Category", "Expense category name, e.g. Salary or Petrol (optional — if empty or unknown, choose it in the preview)"],
];

export default async function ImportExpensesPage() {
  const user = await requirePermission("expenses.create");
  const categories = await db
    .select({ id: schema.expenseCategories.id, name: schema.expenseCategories.name })
    .from(schema.expenseCategories)
    .where(eq(schema.expenseCategories.active, true))
    .orderBy(asc(schema.expenseCategories.name));
  return (
    <>
      <PageHeader
        title="Import expenses"
        subtitle="Upload the file, check the suggested categories, then import. Nothing is saved until you click Import."
        actions={<AnchorButton variant="secondary" href="/api/samples/expenses" download><Download className="size-4" /> Download sample CSV</AnchorButton>}
      />
      <div className="grid gap-5 min-[1800px]:grid-cols-[1fr_360px]">
        <BankImport categories={categories} canAddCategory={can(user, "expense_categories.create")} />
        <Card title="Columns">
          <dl className="divide-y divide-slate-100 text-sm">
            {COLUMNS.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[130px_1fr] gap-3 px-4 py-2">
                <dt className="font-medium text-slate-800">{k}</dt>
                <dd className="text-slate-600">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            The first row must be these headings — no other columns (Category may be left out). Every row becomes one expense. For an Excel file, use File → Save As → “CSV (Comma delimited)”.
          </p>
        </Card>
      </div>
    </>
  );
}
