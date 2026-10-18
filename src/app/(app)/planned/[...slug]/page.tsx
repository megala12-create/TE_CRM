import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { findPlanned, PLANNED_MODULES } from "@/lib/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";

export default async function PlannedPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const found = findPlanned(`/planned/${slug.join("/")}`);
  if (!found) notFound();
  if (!found.item.anyOf.some((p) => can(user, p))) redirect("/forbidden");

  const info = PLANNED_MODULES[slug[0]!];
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {found.item.label}
            {found.sub ? <span className="text-slate-400">/ {found.sub.label}</span> : null}
            <Badge tone="amber">Planned</Badge>
          </span>
        }
        subtitle={info?.summary}
      />
      <Card title="What this module will include">
        <ul className="list-disc space-y-1.5 py-4 pl-10 pr-4 text-sm text-slate-700">
          {(info?.features ?? []).map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        {found.item.children ? (
          <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
            Sections: {found.item.children.map((c) => c.label).join(" · ")}
          </div>
        ) : null}
      </Card>
      <p className="mt-4 text-sm text-slate-500">
        This module is on the roadmap. Its permissions can already be assigned to roles in Setup → Roles &amp; permissions.
      </p>
    </>
  );
}
