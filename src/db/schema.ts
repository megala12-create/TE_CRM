import {
  pgTable,
  integer,
  text,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => integer("id").primaryKey().generatedAlwaysAsIdentity();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 14, scale: 2 }).notNull().default("0");
const custom = () => jsonb("custom").$type<Record<string, unknown>>().notNull().default({});

// ─── Identity & access ────────────────────────────────────────────────────────

export const roles = pgTable("roles", {
  id: id(),
  name: text("name").notNull().unique(),
  description: text("description"),
  permissions: text("permissions").array().notNull().default([]),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  roleId: integer("role_id").references(() => roles.id, { onDelete: "set null" }),
  isAdmin: boolean("is_admin").notNull().default(false),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 of the cookie token
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const userPrefs = pgTable(
  "user_prefs",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// ─── Configuration ────────────────────────────────────────────────────────────

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

export const numberSeries = pgTable("number_series", {
  key: text("key").primaryKey(), // e.g. "invoice:2026-27"
  next: integer("next").notNull().default(1),
});

export const customFields = pgTable(
  "custom_fields",
  {
    id: id(),
    entity: text("entity").notNull(), // customers | contacts | invoices | payments | expenses
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull(), // see CUSTOM_FIELD_TYPES
    options: text("options").array().notNull().default([]),
    required: boolean("required").notNull().default(false),
    showInList: boolean("show_in_list").notNull().default(false),
    helpText: text("help_text"),
    defaultValue: text("default_value"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    // null = every role; otherwise only these role ids (admins always see everything)
    visibleRoleIds: integer("visible_role_ids").array(),
    editableRoleIds: integer("editable_role_ids").array(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("custom_fields_entity_key_uq").on(t.entity, t.key)],
);

// ─── CRM ──────────────────────────────────────────────────────────────────────

export const customers = pgTable(
  "customers",
  {
    id: id(),
    company: text("company").notNull(),
    gstin: text("gstin"),
    pan: text("pan"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    stateCode: text("state_code"), // GST state code, e.g. "33" = Tamil Nadu
    pincode: text("pincode"),
    country: text("country").notNull().default("India"),
    groups: text("groups").array().notNull().default([]),
    ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    creditLimit: money("credit_limit"),
    active: boolean("active").notNull().default(true),
    custom: custom(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("customers_company_idx").on(t.company), index("customers_owner_idx").on(t.ownerId)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    isPrimary: boolean("is_primary").notNull().default(false),
    custom: custom(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("contacts_customer_idx").on(t.customerId)],
);

export const customerNotes = pgTable(
  "customer_notes",
  {
    id: id(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("customer_notes_customer_idx").on(t.customerId)],
);

// ─── Sales ────────────────────────────────────────────────────────────────────

export const items = pgTable("items", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  hsnSac: text("hsn_sac"),
  unit: text("unit").notNull().default("pcs"),
  rate: money("rate"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("18"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    number: text("number").unique(), // assigned when issued; null while draft
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("draft"), // draft | issued | cancelled
    date: date("date").notNull(),
    dueDate: date("due_date").notNull(),
    placeOfSupply: text("place_of_supply"), // GST state code
    isInterstate: boolean("is_interstate").notNull().default(false),
    subtotal: money("subtotal"),
    discount: money("discount"),
    cgst: money("cgst"),
    sgst: money("sgst"),
    igst: money("igst"),
    roundOff: money("round_off"),
    total: money("total"),
    amountPaid: money("amount_paid"),
    notes: text("notes"),
    terms: text("terms"),
    salesAgentId: integer("sales_agent_id").references(() => users.id, { onDelete: "set null" }),
    orderRef: text("order_ref"), // customer PO / order number
    tags: text("tags").array().notNull().default([]),
    // Recurring: "1:month" etc. A new draft copy is created on nextRecurringDate.
    repeatEvery: text("repeat_every"),
    nextRecurringDate: date("next_recurring_date"),
    recurringParentId: integer("recurring_parent_id"),
    custom: custom(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }), // when sent to the customer (email/WhatsApp/handed over)
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("invoices_customer_idx").on(t.customerId),
    index("invoices_status_due_idx").on(t.status, t.dueDate),
    index("invoices_date_idx").on(t.date),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: id(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    itemId: integer("item_id").references(() => items.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    hsnSac: text("hsn_sac"),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
    unit: text("unit").notNull().default("pcs"),
    rate: money("rate"),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    taxableAmount: money("taxable_amount"),
    taxAmount: money("tax_amount"),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "restrict" }),
    date: date("date").notNull(),
    amount: money("amount"),
    mode: text("mode").notNull().default("bank"), // cash | upi | bank | cheque | card
    reference: text("reference"),
    note: text("note"),
    custom: custom(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("payments_customer_idx").on(t.customerId), index("payments_invoice_idx").on(t.invoiceId)],
);

export const quotations = pgTable(
  "quotations",
  {
    id: id(),
    number: text("number").notNull().unique(), // QUOTATION-000001 / TE-26-27-PI-000001 — assigned on creation
    kind: text("kind").notNull().default("quotation"), // quotation | proforma (proforma invoice)
    subject: text("subject").notNull(),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    // "To": a customer or any prospect (name + contact details shown on the document)
    toName: text("to_name").notNull(),
    toEmail: text("to_email"),
    toPhone: text("to_phone"),
    toAddress: text("to_address"),
    status: text("status").notNull().default("draft"), // draft | sent | open | revised | declined | accepted
    date: date("date").notNull(),
    openTill: date("open_till"),
    project: text("project"),
    tags: text("tags").array().notNull().default([]),
    placeOfSupply: text("place_of_supply"),
    isInterstate: boolean("is_interstate").notNull().default(false),
    subtotal: money("subtotal"),
    discount: money("discount"),
    cgst: money("cgst"),
    sgst: money("sgst"),
    igst: money("igst"),
    roundOff: money("round_off"),
    total: money("total"),
    notes: text("notes"),
    terms: text("terms"),
    salesAgentId: integer("sales_agent_id").references(() => users.id, { onDelete: "set null" }),
    invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    soCreated: boolean("so_created").notNull().default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    custom: custom(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("quotations_customer_idx").on(t.customerId),
    index("quotations_status_idx").on(t.kind, t.status),
    index("quotations_date_idx").on(t.date),
  ],
);

export const quotationLines = pgTable(
  "quotation_lines",
  {
    id: id(),
    quotationId: integer("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    itemId: integer("item_id").references(() => items.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    hsnSac: text("hsn_sac"),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
    unit: text("unit").notNull().default("pcs"),
    rate: money("rate"),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    taxableAmount: money("taxable_amount"),
    taxAmount: money("tax_amount"),
  },
  (t) => [index("quotation_lines_quotation_idx").on(t.quotationId)],
);

export const creditNotes = pgTable(
  "credit_notes",
  {
    id: id(),
    number: text("number").notNull().unique(), // CN-000001
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    date: date("date").notNull(),
    invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "set null" }), // original invoice being credited
    reference: text("reference"), // free text, defaults to the original invoice number
    status: text("status").notNull().default("open"), // open | closed | void (closed = fully used)
    project: text("project"),
    placeOfSupply: text("place_of_supply"),
    isInterstate: boolean("is_interstate").notNull().default(false),
    subtotal: money("subtotal"),
    discount: money("discount"),
    cgst: money("cgst"),
    sgst: money("sgst"),
    igst: money("igst"),
    roundOff: money("round_off"),
    total: money("total"),
    amountApplied: money("amount_applied"), // credited against invoices
    amountRefunded: money("amount_refunded"),
    notes: text("notes"),
    terms: text("terms"),
    custom: custom(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("credit_notes_customer_idx").on(t.customerId), index("credit_notes_date_idx").on(t.date)],
);

export const creditNoteLines = pgTable(
  "credit_note_lines",
  {
    id: id(),
    creditNoteId: integer("credit_note_id")
      .notNull()
      .references(() => creditNotes.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    itemId: integer("item_id").references(() => items.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    hsnSac: text("hsn_sac"),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
    unit: text("unit").notNull().default("pcs"),
    rate: money("rate"),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    taxableAmount: money("taxable_amount"),
    taxAmount: money("tax_amount"),
  },
  (t) => [index("credit_note_lines_cn_idx").on(t.creditNoteId)],
);

/** Credit used against an invoice. The invoice's amountPaid includes these (payments + credits). */
export const creditApplications = pgTable(
  "credit_applications",
  {
    id: id(),
    creditNoteId: integer("credit_note_id")
      .notNull()
      .references(() => creditNotes.id, { onDelete: "cascade" }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    date: date("date").notNull(),
    amount: money("amount"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("credit_app_cn_idx").on(t.creditNoteId), index("credit_app_invoice_idx").on(t.invoiceId)],
);

export const creditRefunds = pgTable("credit_refunds", {
  id: id(),
  creditNoteId: integer("credit_note_id")
    .notNull()
    .references(() => creditNotes.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  amount: money("amount"),
  mode: text("mode").notNull().default("bank"),
  reference: text("reference"),
  note: text("note"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// ─── Purchase / vendors ───────────────────────────────────────────────────────

export const vendors = pgTable("vendors", {
  id: id(),
  name: text("name").notNull(),
  gstin: text("gstin"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const expenseCategories = pgTable("expense_categories", {
  id: id(),
  name: text("name").notNull().unique(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => expenseCategories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    vendorId: integer("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    currency: text("currency").notNull().default("INR"),
    amount: money("amount"), // before tax
    tax1Name: text("tax1_name"),
    tax1Rate: numeric("tax1_rate", { precision: 5, scale: 2 }),
    tax2Name: text("tax2_name"),
    tax2Rate: numeric("tax2_rate", { precision: 5, scale: 2 }),
    taxAmount: money("tax_amount"),
    total: money("total"), // amount + tax
    paymentMode: text("payment_mode"),
    reference: text("reference"),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    billable: boolean("billable").notNull().default(false),
    invoiced: boolean("invoiced").notNull().default(false),
    invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "set null" }), // invoice this expense was billed on
    project: text("project"),
    note: text("note"),
    receiptKey: text("receipt_key"),
    receiptName: text("receipt_name"),
    receiptType: text("receipt_type"),
    receiptSize: integer("receipt_size"),
    // Recurring: "1:month", "2:week", "1:year" …; the next copy is created on nextRecurringDate
    repeatEvery: text("repeat_every"),
    nextRecurringDate: date("next_recurring_date"),
    recurringParentId: integer("recurring_parent_id"),
    custom: custom(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("expenses_date_idx").on(t.date),
    index("expenses_category_idx").on(t.categoryId),
    index("expenses_recurring_idx").on(t.nextRecurringDate),
  ],
);

// ─── Audit ────────────────────────────────────────────────────────────────────

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // create | update | delete | login | issue | cancel ...
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_created_idx").on(t.createdAt)],
);
