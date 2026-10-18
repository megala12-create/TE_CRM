import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckboxField, FormGrid, FormSection, SelectField, TextAreaField, TextField } from "@/components/fields";
import { CustomFieldInputs } from "@/components/custom-field-inputs";
import { INDIAN_STATES } from "@/lib/gst";
import type { CustomFieldDef, FieldViewer } from "@/lib/custom-fields";
import type { ActionState } from "@/lib/utils";

export type CustomerFormValues = {
  company: string;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  stateCode: string | null;
  pincode: string | null;
  groups: string[];
  ownerId: number | null;
  paymentTermsDays: number;
  creditLimit: string;
  active: boolean;
  custom: Record<string, unknown>;
};

export function CustomerForm({
  action,
  initial,
  isNew,
  staff,
  canAssignOwner,
  fields,
  viewer,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  initial: CustomerFormValues;
  isNew: boolean;
  staff: { id: number; name: string }[];
  canAssignOwner: boolean;
  fields: CustomFieldDef[];
  viewer: FieldViewer;
}) {
  return (
    <ActionForm action={action} className="space-y-5">
      <FormSection title="Company">
        <FormGrid>
          <TextField name="company" label="Company name" required defaultValue={initial.company} className="sm:col-span-2" />
          {isNew ? <TextField name="contactName" label="Primary contact name" /> : null}
          <TextField name="phone" label="Phone" type="tel" defaultValue={initial.phone} />
          <TextField name="email" label="Email" type="email" defaultValue={initial.email} />
          <TextField name="website" label="Website" defaultValue={initial.website} />
          <TextField name="gstin" label="GSTIN" defaultValue={initial.gstin} maxLength={15} hint="State is filled in from the GSTIN automatically." />
          <TextField name="pan" label="PAN" defaultValue={initial.pan} maxLength={10} />
        </FormGrid>
      </FormSection>

      <FormSection title="Billing address">
        <FormGrid>
          <TextAreaField name="address" label="Address" defaultValue={initial.address} className="sm:col-span-2" rows={2} />
          <TextField name="city" label="City" defaultValue={initial.city} />
          <SelectField
            name="stateCode"
            label="State (place of supply)"
            defaultValue={initial.stateCode}
            placeholder="— Select state —"
            options={INDIAN_STATES.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))}
          />
          <TextField name="pincode" label="PIN code" defaultValue={initial.pincode} maxLength={6} />
        </FormGrid>
      </FormSection>

      <FormSection title="Account">
        <FormGrid>
          <TextField name="groups" label="Groups" defaultValue={initial.groups.join(", ")} hint="Comma separated, e.g. Exporter, VIP, DTF" />
          {canAssignOwner ? (
            <SelectField
              name="ownerId"
              label="Account owner"
              defaultValue={initial.ownerId}
              placeholder="— Unassigned —"
              options={staff.map((s) => ({ value: s.id, label: s.name }))}
            />
          ) : null}
          <TextField name="paymentTermsDays" label="Payment terms (days)" type="number" min="0" max="365" defaultValue={initial.paymentTermsDays} />
          <TextField name="creditLimit" label="Credit limit (₹)" type="number" step="0.01" min="0" defaultValue={initial.creditLimit} />
          <CheckboxField name="active" label="Active customer" defaultChecked={initial.active} />
        </FormGrid>
      </FormSection>

      {fields.length ? (
        <FormSection title="Additional details">
          <CustomFieldInputs fields={fields} values={initial.custom} viewer={viewer} />
        </FormSection>
      ) : null}

      <div className="flex justify-end">
        <SubmitButton>{isNew ? "Create customer" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
