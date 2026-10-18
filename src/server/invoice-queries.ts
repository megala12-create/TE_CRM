import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { schema } from "@/db";
import type { InvoiceState } from "@/lib/invoice-status";

const i = schema.invoices;

/** SQL filter matching invoiceState() for list filtering. */
export function invoiceStateWhere(state: InvoiceState, today: string): SQL {
  switch (state) {
    case "draft":
      return sql`${i.status} = 'draft'`;
    case "cancelled":
      return sql`${i.status} = 'cancelled'`;
    case "paid":
      return sql`${i.status} = 'issued' and ${i.amountPaid} >= ${i.total}`;
    case "overdue":
      return sql`${i.status} = 'issued' and ${i.amountPaid} < ${i.total} and ${i.dueDate} < ${today}`;
    case "partially_paid":
      return sql`${i.status} = 'issued' and ${i.amountPaid} > 0 and ${i.amountPaid} < ${i.total} and ${i.dueDate} >= ${today}`;
    case "unpaid":
      return sql`${i.status} = 'issued' and ${i.amountPaid} = 0 and ${i.total} > 0 and ${i.dueDate} >= ${today}`;
  }
}
