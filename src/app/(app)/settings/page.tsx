import Link from "next/link";
import { requireUser } from "@/server/auth";
import { NAVIGATION } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Setup" };

export default async function SetupPage() {
  const user = await requireUser();
  const items = NAVIGATION.find((n) => n.href === "/settings")?.children?.filter((c) => c.anyOf.some((p) => can(user, p))) ?? [];
  return (
    <>
      <PageHeader title="Setup" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="card p-5 font-medium text-slate-800 hover:border-brand-500 hover:shadow-sm">
            {i.label}
          </Link>
        ))}
      </div>
    </>
  );
}
