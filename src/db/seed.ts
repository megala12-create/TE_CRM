import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { computeInvoiceTotals, financialYear, stateName } from "../lib/gst";
import { fromPaise } from "../lib/money";
import { ALL_PERMISSIONS } from "../lib/permissions";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client, { schema });

const ROLES: { name: string; description: string; permissions: string[] }[] = [
  {
    name: "Manager",
    description: "Everything except staff, roles and system settings",
    permissions: ALL_PERMISSIONS.filter((p) => !/^(staff|roles|settings|custom_fields)\./.test(p) && !p.endsWith(".view_own")),
  },
  {
    name: "Sales / Marketing",
    description: "Own customers, invoices and quotations",
    permissions: ["dashboard.view", "customers.view_own", "customers.create", "customers.edit", "invoices.view_own", "invoices.create", "invoices.edit", "items.view", "leads.view", "leads.create", "leads.edit", "estimates.view", "estimates.create", "estimates.edit", "whatsbot.view", "tasks.view_own", "tasks.create", "tasks.edit"],
  },
  {
    name: "Accounts / Finance",
    description: "Invoices, payments, expenses and reports",
    permissions: ["dashboard.view", "customers.view", "customers.edit", "invoices.view", "invoices.create", "invoices.edit", "invoices.delete", "payments.view", "payments.create", "payments.delete", "expenses.view", "expenses.create", "expenses.edit", "expenses.delete", "items.view", "items.manage", "reports.view", "accounting.view", "purchase.view"],
  },
  {
    name: "Production",
    description: "Production and sample orders, read-only customers",
    permissions: ["dashboard.view", "customers.view", "items.view", "manufacturing.view", "manufacturing.create", "manufacturing.edit", "production_orders.view", "production_orders.create", "production_orders.edit", "sample_orders.view", "sample_orders.create", "sample_orders.edit", "inventory.view", "order_roadmap.view", "tasks.view_own", "tasks.edit"],
  },
];

// Processes from www.tiruppurembossing.com. HSN/SAC and GST rates are placeholders — confirm with your auditor.
const ITEMS = [
  ["Sublimation printing", "Per piece", "pcs", "18.00", "9988", "5"],
  ["HD printing", "Per piece", "pcs", "22.00", "9988", "5"],
  ["Single colour transfer", "Screen transfer, 1 colour", "pcs", "6.50", "4908", "18"],
  ["Multi colour transfer", "Screen transfer, up to 6 colours", "pcs", "12.00", "4908", "18"],
  ["Silicon HD – Glossy", "Raised flexible print", "pcs", "16.00", "4908", "18"],
  ["Silicon HD – Matte", "Raised flexible print", "pcs", "16.00", "4908", "18"],
  ["Silicon HD – Puff", "Puff effect", "pcs", "18.00", "4908", "18"],
  ["DTF printing", "PET film, CMYK + white", "pcs", "14.00", "4908", "18"],
  ["Embossing only", "Embossing press job work", "pcs", "8.00", "9988", "5"],
  ["Embossing with print", "Emboss + print", "pcs", "15.00", "9988", "5"],
  ["PU transfer printing", "Heat transfer", "pcs", "10.00", "4908", "18"],
  ["Flock transfer", "Speciality finish", "pcs", "12.00", "4908", "18"],
  ["Metallic transfer", "Speciality finish", "pcs", "12.00", "4908", "18"],
  ["Reflective transfer", "Speciality finish", "pcs", "14.00", "4908", "18"],
  ["Glow-in-dark transfer", "Speciality finish", "pcs", "14.00", "4908", "18"],
  ["Glitter transfer", "Speciality finish", "pcs", "12.00", "4908", "18"],
  ["Sequin work", "Sequin attachment", "pcs", "20.00", "9988", "5"],
  ["3D TPU transfer", "Moulded raised badge", "pcs", "25.00", "4908", "18"],
  ["Laser cutting", "Fabric / leather / synthetics", "pcs", "4.00", "9988", "5"],
  ["Screen / die charges", "One-time setup", "nos", "750.00", "9988", "18"],
] as const;

const CATEGORIES = ["Raw material – films & inks", "Consumables", "Electricity", "Machine maintenance", "Transport & courier", "Rent", "Salaries & wages", "Office & stationery", "Travel"];

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@tiruppurembossing.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

  // Roles
  for (const r of ROLES) {
    await db.insert(schema.roles).values({ ...r, isSystem: false }).onConflictDoNothing({ target: schema.roles.name });
  }

  // Admin
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  let adminId = existing?.id;
  if (!existing) {
    const [u] = await db
      .insert(schema.users)
      .values({ name: "Administrator", email, passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }), isAdmin: true })
      .returning({ id: schema.users.id });
    adminId = u!.id;
    console.log(`Created admin ${email}`);
  }

  await db.insert(schema.settings).values({ key: "company", value: {} }).onConflictDoNothing();
  for (const name of CATEGORIES) await db.insert(schema.expenseCategories).values({ name }).onConflictDoNothing();

  const [{ n: itemCount }] = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.items)) as [{ n: number }];
  if (itemCount === 0) {
    await db.insert(schema.items).values(ITEMS.map(([name, description, unit, rate, hsnSac, taxRate]) => ({ name, description, unit, rate, hsnSac, taxRate })));
  }

  // Example custom fields — show how admins extend screens
  await db
    .insert(schema.customFields)
    .values([
      { entity: "customers", key: "preferred_process", label: "Preferred process", type: "select", options: ["DTF", "Silicon HD", "Embossing", "Sublimation", "Screen transfer", "3D TPU"], showInList: true, sortOrder: 10 },
      { entity: "customers", key: "brand_names", label: "Brand names", type: "text", helpText: "Brands the customer prints for", sortOrder: 20 },
      { entity: "invoices", key: "po_number", label: "Customer PO #", type: "text", showInList: true, sortOrder: 10 },
      { entity: "invoices", key: "dc_number", label: "DC number", type: "text", sortOrder: 20 },
    ])
    .onConflictDoNothing();

  if (process.env.SEED_DEMO_DATA === "true") await demo(adminId!);
  await client.end();
  console.log("Seed complete.");
}

async function demo(adminId: number) {
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.customers)) as [{ n: number }];
  if (n > 0) return console.log("Demo data skipped (customers already exist).");

  const customers = [
    { company: "Sri Murugan Knits", gstin: null, city: "Tiruppur", stateCode: "33", groups: ["Exporter", "VIP"], phone: "+91 98430 11111" },
    { company: "Kongu Garments Pvt Ltd", gstin: null, city: "Tiruppur", stateCode: "33", groups: ["Exporter"], phone: "+91 98430 22222" },
    { company: "Bengaluru Sportswear Co", gstin: null, city: "Bengaluru", stateCode: "29", groups: ["Sportswear"], phone: "+91 98450 33333" },
    { company: "Coimbatore Fashions", gstin: null, city: "Coimbatore", stateCode: "33", groups: ["Domestic"], phone: "+91 98940 44444" },
    { company: "Kerala Dancewear House", gstin: null, city: "Kochi", stateCode: "32", groups: ["Dancewear"], phone: "+91 94470 55555" },
  ];
  const ids: { id: number; stateCode: string }[] = [];
  for (const c of customers) {
    const [row] = await db
      .insert(schema.customers)
      .values({ ...c, state: stateName(c.stateCode), ownerId: adminId, createdBy: adminId, custom: { preferred_process: "DTF" } })
      .returning({ id: schema.customers.id });
    ids.push({ id: row!.id, stateCode: c.stateCode });
    await db.insert(schema.contacts).values({ customerId: row!.id, name: `Contact at ${c.company.split(" ")[0]}`, phone: c.phone, whatsapp: c.phone, isPrimary: true });
  }

  const items = await db.select().from(schema.items);
  const today = new Date();
  for (let k = 0; k < 12; k++) {
    const cust = ids[k % ids.length]!;
    const d = new Date(today.getTime() - (k * 9 + 2) * 864e5);
    const date = d.toISOString().slice(0, 10);
    const due = new Date(d.getTime() + 30 * 864e5).toISOString().slice(0, 10);
    const picks = [items[k % items.length]!, items[(k + 5) % items.length]!];
    const lines = picks.map((it, j) => ({ it, qty: String(500 + j * 250 + k * 50) }));
    const interstate = cust.stateCode !== "33";
    const t = computeInvoiceTotals(lines.map((l) => ({ qty: l.qty, rate: l.it.rate, taxRate: l.it.taxRate })), { interstate });
    const fy = financialYear(date);
    const [series] = await db
      .insert(schema.numberSeries)
      .values({ key: `invoice:${fy}`, next: 2 })
      .onConflictDoUpdate({ target: schema.numberSeries.key, set: { next: sql`${schema.numberSeries.next} + 1` } })
      .returning();
    const number = `TE/${fy}/${String(series!.next - 1).padStart(4, "0")}`;
    const paid = k % 3 === 0 ? t.total : k % 3 === 1 ? Math.round(t.total / 2) : 0;
    const [inv] = await db
      .insert(schema.invoices)
      .values({
        number, customerId: cust.id, status: "issued", date, dueDate: due, placeOfSupply: cust.stateCode, isInterstate: interstate,
        subtotal: fromPaise(t.subtotal), discount: "0", cgst: fromPaise(t.cgst), sgst: fromPaise(t.sgst), igst: fromPaise(t.igst),
        roundOff: fromPaise(t.roundOff), total: fromPaise(t.total), amountPaid: fromPaise(paid), salesAgentId: adminId, createdBy: adminId,
        issuedAt: d, custom: { po_number: `PO-${1000 + k}` },
      })
      .returning({ id: schema.invoices.id });
    await db.insert(schema.invoiceLines).values(
      lines.map((l, idx) => ({
        invoiceId: inv!.id, sortOrder: idx, itemId: l.it.id, description: l.it.name, hsnSac: l.it.hsnSac, qty: l.qty, unit: l.it.unit,
        rate: l.it.rate, taxRate: l.it.taxRate, taxableAmount: fromPaise(t.lines[idx]!.taxablePaise), taxAmount: fromPaise(t.lines[idx]!.taxPaise),
      })),
    );
    if (paid > 0) {
      await db.insert(schema.payments).values({ customerId: cust.id, invoiceId: inv!.id, date, amount: fromPaise(paid), mode: k % 2 ? "upi" : "bank", reference: `UTR${100000 + k}`, createdBy: adminId });
    }
  }

  const cats = await db.select().from(schema.expenseCategories);
  const [vendor] = await db.insert(schema.vendors).values({ name: "Local vendor", phone: "+91 90000 00000" }).returning();
  for (let k = 0; k < 10; k++) {
    const d = new Date(today.getTime() - k * 6 * 864e5).toISOString().slice(0, 10);
    const amount = (1500 + k * 730).toFixed(2);
    const tax = (Number(amount) * 0.18).toFixed(2);
    await db.insert(schema.expenses).values({
      categoryId: cats[k % cats.length]!.id, name: ["DTF film roll", "Silicone ink", "EB bill", "Courier", "Heat press repair"][k % 5]!,
      vendorId: vendor!.id, date: d, amount, tax1Name: "CGST", tax1Rate: "9", tax2Name: "SGST", tax2Rate: "9", taxAmount: tax,
      total: (Number(amount) + Number(tax)).toFixed(2), paymentMode: k % 2 ? "upi" : "cash",
      billable: k % 4 === 0, createdBy: adminId,
    });
  }
  console.log("Demo data loaded.");
}

main().catch(async (e) => {
  console.error(e);
  await client.end();
  process.exit(1);
});
