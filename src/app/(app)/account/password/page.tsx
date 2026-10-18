import { requireUser } from "@/server/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormSection, TextField } from "@/components/fields";
import { PageHeader } from "@/components/ui";
import { PASSWORD_HINT } from "@/lib/password";
import { changeOwnPassword } from "./actions";

export const metadata = { title: "Change password" };

// Every logged-in user may change their own password, so this page needs no permission.
export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const user = await requireUser();
  const { changed } = await searchParams;
  return (
    <>
      <PageHeader title="Change password" subtitle={user.email} />
      <div className="max-w-xl">
        {changed ? (
          <div role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Password changed. You have been logged out on all other devices.
          </div>
        ) : null}
        <ActionForm action={changeOwnPassword} className="space-y-4">
          <FormSection title="Your password">
            <div className="space-y-4">
              <TextField name="currentPassword" label="Current password" type="password" required autoComplete="current-password" />
              <TextField name="newPassword" label="New password" type="password" required autoComplete="new-password" hint={PASSWORD_HINT} />
              <TextField name="confirmPassword" label="Confirm new password" type="password" required autoComplete="new-password" />
            </div>
          </FormSection>
          <div className="flex justify-end">
            <SubmitButton>Change password</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </>
  );
}
