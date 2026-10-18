import { desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requirePermission } from "@/server/auth";
import { loadCustomer } from "@/server/scope";
import { paymentRowsQuery } from "@/server/payment-queries";
import { Card } from "@/components/ui";
import { PaymentTable } from "@/components/payment-table";

export default async function CustomerPaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("payments.view");
  const customer = await loadCustomer(user, Number((await params).id));
  const rows = await paymentRowsQuery()
    .where(eq(schema.payments.customerId, customer.id))
    .orderBy(desc(schema.payments.date), desc(schema.payments.id))
    .limit(500);
  return (
    <Card title="Payments">
      <PaymentTable rows={rows} showCustomer={false} />
    </Card>
  );
}
