import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckboxField, FormGrid, FormSection, SelectField, TextField } from "@/components/fields";
import { PASSWORD_HINT } from "@/lib/password";
import type { ActionState } from "@/lib/utils";

export function StaffForm({
  action,
  roles,
  initial,
  isNew,
  actorIsAdmin,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  roles: { id: number; name: string }[];
  initial: { name: string; email: string; phone: string; roleId: number | null; isAdmin: boolean; active: boolean };
  isNew: boolean;
  actorIsAdmin: boolean;
}) {
  return (
    <ActionForm action={action} className="space-y-5">
      <FormSection title="Profile">
        <FormGrid>
          <TextField name="name" label="Full name" required defaultValue={initial.name} />
          <TextField name="email" label="Email (login)" type="email" required defaultValue={initial.email} autoComplete="off" />
          <TextField name="phone" label="Phone" type="tel" defaultValue={initial.phone} />
          <TextField
            name="password"
            label={isNew ? "Password" : "New password"}
            type="password"
            required={isNew}
            autoComplete="new-password"
            hint={isNew ? PASSWORD_HINT : "Leave blank to keep the current password. Changing it logs the user out everywhere."}
          />
        </FormGrid>
      </FormSection>
      <FormSection title="Access">
        <FormGrid>
          <SelectField
            name="roleId"
            label="Role"
            defaultValue={initial.roleId}
            placeholder="— No role —"
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
            hint="Permissions come from the role. Manage roles in Setup → Roles & permissions."
          />
          <div className="space-y-3 pt-6">
            {actorIsAdmin ? (
              <CheckboxField name="isAdmin" label="Administrator" defaultChecked={initial.isAdmin} hint="Full access to everything, including roles and staff." />
            ) : null}
            <CheckboxField name="active" label="Active" defaultChecked={initial.active} hint="Inactive staff cannot log in." />
          </div>
        </FormGrid>
      </FormSection>
      <div className="flex justify-end">
        <SubmitButton>{isNew ? "Create staff member" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
