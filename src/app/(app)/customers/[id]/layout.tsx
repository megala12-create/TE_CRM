import { requirePermission } from "@/server/auth";
import { loadCustomer } from "@/server/scope";
import { can } from "@/lib/permissions";
import { CustomerTabs } from "./tabs";
import { Badge } from "@/components/ui";

export default async function CustomerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await requirePermission("customers.view", "customers.view_own");
  const customer = await loadCustomer(user, Number((await params).id));
  const base = `/customers/${customer.id}`;
  const tabs = [
    { href: base, label: "Profile" },
    { href: `${base}/contacts`, label: "Contacts" },
    { href: `${base}/notes`, label: "Notes" },
    ...(can(user, "reports.view") ? [{ href: `${base}/statement`, label: "Statement" }] : []),
    ...(can(user, "invoices.view") || can(user, "invoices.view_own") ? [{ href: `${base}/invoices`, label: "Invoices" }] : []),
    ...(can(user, "payments.view") ? [{ href: `${base}/payments`, label: "Payments" }] : []),
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <aside className="no-print">
        <div className="mb-3 flex items-start gap-2">
          <h1 className="text-lg font-semibold leading-tight text-slate-900">
            <span className="text-slate-400">#{customer.id}</span> {customer.company}
          </h1>
        </div>
        {!customer.active ? <div className="mb-3"><Badge tone="red">Inactive</Badge></div> : null}
        <CustomerTabs tabs={tabs} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
