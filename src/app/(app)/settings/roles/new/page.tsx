import { requirePermission } from "@/server/auth";
import { PageHeader } from "@/components/ui";
import { RoleForm } from "../role-form";
import { saveRole } from "../actions";

export const metadata = { title: "New role" };

export default async function NewRolePage() {
  await requirePermission("roles.manage");
  return (
    <>
      <PageHeader title="New role" />
      <RoleForm action={saveRole.bind(null, null)} initial={{ name: "", description: "", permissions: [] }} />
    </>
  );
}
