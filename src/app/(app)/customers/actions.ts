"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertPermission, ForbiddenError } from "@/server/auth";
import { audit } from "@/server/audit";
import { getActiveFields } from "@/server/custom-fields";
import { customerScope } from "@/server/scope";
import { parseCustomFields } from "@/lib/custom-fields";
import { isValidGstin, stateCodeFromGstin, stateName } from "@/lib/gst";
import { can } from "@/lib/permissions";
import { str, optStr, type ActionState } from "@/lib/utils";
import type { CurrentUser } from "@/server/auth";

async function ensureCustomerAccess(user: CurrentUser, id: number) {
  const scope = customerScope(user);
  const row = await db
    .select()
    .from(schema.customers)
    .where(scope ? and(eq(schema.customers.id, id), scope) : eq(schema.customers.id, id))
    .limit(1);
  if (!row[0]) throw new ForbiddenError();
  return row[0];
}

export async function saveCustomer(customerId: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission(customerId ? "customers.edit" : "customers.create");
  const existing = customerId ? await ensureCustomerAccess(user, customerId) : undefined;
  const errors: Record<string, string> = {};

  const company = str(form, "company");
  const gstin = optStr(form, "gstin")?.toUpperCase() ?? null;
  const email = optStr(form, "email");
  const pan = optStr(form, "pan")?.toUpperCase() ?? null;
  let stateCode = optStr(form, "stateCode");

  if (!company) errors.company = "Company name is required";
  if (gstin && !isValidGstin(gstin)) errors.gstin = "This GSTIN is not valid (check the format and last digit)";
  if (gstin && !stateCode) stateCode = stateCodeFromGstin(gstin);
  if (gstin && stateCode && stateCodeFromGstin(gstin) !== stateCode) errors.stateCode = "State does not match the GSTIN";
  if (email && !z.email().safeParse(email).success) errors.email = "Enter a valid email";
  if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) errors.pan = "PAN should look like ABCDE1234F";
  const paymentTermsDays = Number(str(form, "paymentTermsDays") || "30");
  if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 365) errors.paymentTermsDays = "0–365 days";
  const creditLimit = str(form, "creditLimit") || "0";
  if (!/^\d+(\.\d{1,2})?$/.test(creditLimit)) errors.creditLimit = "Enter an amount";

  if (gstin) {
    const dup = await db.query.customers.findFirst({
      where: customerId
        ? and(eq(schema.customers.gstin, gstin), sql`${schema.customers.id} <> ${customerId}`)
        : eq(schema.customers.gstin, gstin),
    });
    if (dup) errors.gstin = `Already used by ${dup.company}`;
  }

  const custom = parseCustomFields(await getActiveFields("customers"), form, user, existing?.custom ?? {});
  if (!custom.ok) Object.assign(errors, custom.errors);
  if (Object.keys(errors).length || !custom.ok) return { errors, message: "Please fix the highlighted fields." };

  const ownerRaw = Number(str(form, "ownerId")) || null;
  // Users who can only see their own customers cannot hand them to someone else.
  const ownerId = can(user, "customers.view") ? ownerRaw : (existing?.ownerId ?? user.id);

  const values = {
    company,
    gstin,
    pan,
    phone: optStr(form, "phone"),
    email,
    website: optStr(form, "website"),
    address: optStr(form, "address"),
    city: optStr(form, "city"),
    stateCode,
    state: stateCode ? stateName(stateCode) : null,
    pincode: optStr(form, "pincode"),
    groups: [...new Set(str(form, "groups").split(",").map((g) => g.trim()).filter(Boolean))],
    ownerId,
    paymentTermsDays,
    creditLimit,
    active: form.get("active") === "on",
    custom: custom.value,
    updatedAt: new Date(),
  };

  let id = customerId;
  if (customerId) {
    await db.update(schema.customers).set(values).where(eq(schema.customers.id, customerId));
  } else {
    const [row] = await db.insert(schema.customers).values({ ...values, createdBy: user.id }).returning({ id: schema.customers.id });
    id = row!.id;
    const contactName = str(form, "contactName");
    if (contactName) {
      await db.insert(schema.contacts).values({ customerId: id, name: contactName, phone: values.phone, email, isPrimary: true });
    }
  }
  await audit({ userId: user.id, action: customerId ? "update" : "create", entity: "customer", entityId: id, data: values });
  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

export async function deleteCustomer(customerId: number): Promise<ActionState> {
  const user = await assertPermission("customers.delete");
  const c = await ensureCustomerAccess(user, customerId);
  const [inv] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.invoices).where(eq(schema.invoices.customerId, customerId));
  const [pay] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.payments).where(eq(schema.payments.customerId, customerId));
  if ((inv?.n ?? 0) + (pay?.n ?? 0) > 0) {
    return { message: "This customer has invoices or payments. Mark the customer inactive instead of deleting." };
  }
  await db.delete(schema.customers).where(eq(schema.customers.id, customerId));
  await audit({ userId: user.id, action: "delete", entity: "customer", entityId: customerId, data: c });
  revalidatePath("/customers");
  redirect("/customers");
}

export async function saveContact(customerId: number, contactId: number | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("customers.edit");
  await ensureCustomerAccess(user, customerId);
  const name = str(form, "name");
  const email = optStr(form, "email");
  const errors: Record<string, string> = {};
  if (!name) errors.name = "Name is required";
  if (email && !z.email().safeParse(email).success) errors.email = "Enter a valid email";
  const existing = contactId
    ? await db.query.contacts.findFirst({ where: and(eq(schema.contacts.id, contactId), eq(schema.contacts.customerId, customerId)) })
    : undefined;
  if (contactId && !existing) return { message: "Contact not found" };
  const custom = parseCustomFields(await getActiveFields("contacts"), form, user, existing?.custom ?? {});
  if (!custom.ok) Object.assign(errors, custom.errors);
  if (Object.keys(errors).length || !custom.ok) return { errors };

  const values = {
    name,
    title: optStr(form, "title"),
    email,
    phone: optStr(form, "phone"),
    whatsapp: optStr(form, "whatsapp"),
    isPrimary: form.get("isPrimary") === "on",
    custom: custom.value,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    if (values.isPrimary) {
      await tx.update(schema.contacts).set({ isPrimary: false }).where(eq(schema.contacts.customerId, customerId));
    }
    if (contactId) await tx.update(schema.contacts).set(values).where(eq(schema.contacts.id, contactId));
    else await tx.insert(schema.contacts).values({ ...values, customerId });
  });
  await audit({ userId: user.id, action: contactId ? "update" : "create", entity: "contact", entityId: contactId, data: { customerId, ...values } });
  revalidatePath(`/customers/${customerId}/contacts`);
  redirect(`/customers/${customerId}/contacts`);
}

export async function deleteContact(customerId: number, contactId: number) {
  const user = await assertPermission("customers.edit");
  await ensureCustomerAccess(user, customerId);
  await db.delete(schema.contacts).where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.customerId, customerId)));
  await audit({ userId: user.id, action: "delete", entity: "contact", entityId: contactId, data: { customerId } });
  revalidatePath(`/customers/${customerId}/contacts`);
}

export async function addNote(customerId: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("customers.view", "customers.view_own");
  await ensureCustomerAccess(user, customerId);
  const body = str(form, "body");
  if (!body) return { errors: { body: "Write a note first" } };
  if (body.length > 10000) return { errors: { body: "Note is too long" } };
  await db.insert(schema.customerNotes).values({ customerId, body, createdBy: user.id });
  revalidatePath(`/customers/${customerId}/notes`);
  return { ok: true, message: "Note added." };
}

export async function deleteNote(customerId: number, noteId: number) {
  const user = await assertPermission("customers.edit");
  await ensureCustomerAccess(user, customerId);
  await db.delete(schema.customerNotes).where(and(eq(schema.customerNotes.id, noteId), eq(schema.customerNotes.customerId, customerId)));
  revalidatePath(`/customers/${customerId}/notes`);
}
