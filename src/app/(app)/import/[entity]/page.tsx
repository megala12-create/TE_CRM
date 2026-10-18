import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requirePermission } from "@/server/auth";
import { AnchorButton, Card, PageHeader } from "@/components/ui";
import { IMPORT_DEFS, isImportEntity } from "@/lib/importing";
import { importFile } from "./actions";
import { ImportClient } from "./import-client";

export async function generateMetadata({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  return { title: isImportEntity(entity) ? IMPORT_DEFS[entity].title : "Import" };
}

export default async function ImportPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (!isImportEntity(entity)) notFound();
  const def = IMPORT_DEFS[entity];
  await requirePermission(def.permission);
  const backLabel = `Back to ${def.title.replace(/^Import /, "")}`;

  return (
    <>
      <PageHeader
        title={def.title}
        subtitle={<Link href={def.back} className="link inline-flex items-center gap-1"><ArrowLeft className="size-3.5" /> {backLabel}</Link>}
        actions={<AnchorButton variant="secondary" href={`/api/samples/${entity}`} download><Download className="size-4" /> Download sample file</AnchorButton>}
      />
      <div className="grid gap-5 min-[1500px]:grid-cols-[1fr_420px]">
        <ImportClient action={importFile.bind(null, entity)} back={def.back} backLabel={backLabel} offerCreateCustomers={entity === "invoices"} />
        <Card title="Columns">
          <dl className="divide-y divide-slate-100 text-sm">
            {def.columns.map((c) => (
              <div key={c.key} className="grid grid-cols-[130px_1fr] gap-3 px-4 py-2">
                <dt className="font-medium text-slate-800">
                  {c.label}
                  {c.required ? <span className="text-red-500"> *</span> : null}
                </dt>
                <dd className="text-slate-600">{c.hint}</dd>
              </div>
            ))}
          </dl>
          <ul className="list-disc space-y-1 border-t border-slate-100 py-3 pl-8 pr-4 text-xs text-slate-500">
            <li>The first row must name the columns (any order; a title row above it is fine). * = required.</li>
            {def.customFields ? <li>Extra columns named exactly like a custom field fill that field.</li> : null}
            {def.notes.map((n) => <li key={n}>{n}</li>)}
            <li>Nothing is saved until you click Import. Rows with errors are left out; fix them and import the file again — rows already imported are skipped.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
