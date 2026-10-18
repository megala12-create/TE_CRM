import type { Permission } from "./permissions";

export type NavLeaf = {
  label: string;
  href: string;
  /** The user needs any one of these to see the item. Empty = everyone. */
  anyOf: Permission[];
  planned?: boolean;
};

export type NavItem = NavLeaf & { icon: string; children?: NavLeaf[] };

const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** A planned (not yet built) top-level module with its sub-menus from the current CRM. */
function planned(label: string, icon: string, perm: Permission, subs: string[] = []): NavItem {
  const base = `/planned/${slug(label)}`;
  return {
    label,
    icon,
    href: base,
    anyOf: [perm],
    planned: true,
    children: subs.length ? subs.map((s) => ({ label: s, href: `${base}/${slug(s)}`, anyOf: [perm], planned: true })) : undefined,
  };
}

/** Marks some sub-menus of a planned module as already built, pointing them at real routes. */
function withBuilt(item: NavItem, built: Record<string, { href: string; anyOf: Permission[] }>): NavItem {
  return {
    ...item,
    anyOf: [...new Set([...item.anyOf, ...Object.values(built).flatMap((b) => b.anyOf)])],
    children: item.children?.map((c) => (built[c.label] ? { label: c.label, ...built[c.label]! } : c)),
  };
}

const plannedLeaf =(parent: string, label: string, perm: Permission): NavLeaf => ({
  label,
  href: `/planned/${slug(parent)}/${slug(label)}`,
  anyOf: [perm],
  planned: true,
});

// Mirrors the menu of the current CRM, in the same order and with the same sub-menus.
export const NAVIGATION: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "home", anyOf: ["dashboard.view"] },
  planned("Template", "palette", "templates.view"),
  planned("Leads", "phone", "leads.view"),
  planned("WhatsBot", "message", "whatsbot.view", [
    "Connect Account", "Message Bot", "Template Bot", "AI Assistant", "Bot Flow Builder", "Templates", "Campaigns",
    "CSV Campaign", "Activity log", "Chat", "Canned Reply", "AI Prompts", "Settings",
  ]),
  { label: "Customers", href: "/customers", icon: "user", anyOf: ["customers.view", "customers.view_own"] },
  {
    label: "Sales",
    href: "/invoices",
    icon: "receipt",
    anyOf: ["invoices.view", "invoices.view_own", "payments.view", "items.view", "estimates.view", "quotations.view", "quotations.view_own", "proforma_invoices.view", "proforma_invoices.view_own", "credit_notes.view"],
    children: [
      { label: "Quotations", href: "/quotations", anyOf: ["quotations.view", "quotations.view_own"] },
      plannedLeaf("Sales", "Estimates", "estimates.view"),
      { label: "Proforma Invoices", href: "/proforma-invoices", anyOf: ["proforma_invoices.view", "proforma_invoices.view_own"] },
      { label: "Invoices", href: "/invoices", anyOf: ["invoices.view", "invoices.view_own"] },
      { label: "Payments", href: "/payments", anyOf: ["payments.view"] },
      { label: "Credit Notes", href: "/credit-notes", anyOf: ["credit_notes.view"] },
      { label: "Items", href: "/items", anyOf: ["items.view"] },
    ],
  },
  planned("Hr payroll", "users", "payroll.view", [
    "Employees", "Attendance", "Commissions", "Deductions", "Bonus kpi", "Insurance", "Payslips", "Payslip templates",
    "Income taxes", "Reports", "Settings",
  ]),
  planned("Manufacturing", "factory", "manufacturing.view", [
    "Dashboard", "Products", "Product variants", "Work centers", "Routings", "Service Mappings", "Settings",
  ]),
  planned("Order Roadmap", "trend", "order_roadmap.view"),
  withBuilt(
    planned("Purchase", "cart", "purchase.view", [
      "Items", "Vendors", "Vendor-Items", "Purchase request", "Quotations", "Purchase order", "Order Returns", "Contracts",
      "Debit Notes", "Invoices", "Reports", "Settings",
    ]),
    { Vendors: { href: "/purchase/vendors", anyOf: ["purchase.view"] } },
  ),
  planned("Inventory", "boxes", "inventory.view", [
    "Items", "Inventory receiving voucher", "Delivery Challan", "Packing lists", "Internal delivery note",
    "Loss & adjustment", "Warehouse", "Inventory history", "Report", "Settings",
  ]),
  planned("Accounting", "rupee", "accounting.view", [
    "Dashboard", "Transactions", "Journal Entry", "Transfer", "Chart of Accounts", "Reconcile", "Budget", "Reports", "Settings",
  ]),
  planned("HRM", "badge", "hrm.view", ["Dashboard", "Staff", "Contract", "Insurance", "Timesheets", "Salary", "Settings"]),
  planned("Appointly", "calendar", "appointments.view", ["Appointments", "Past Meetings", "Callbacks", "Own Settings", "Form Info"]),
  planned("Fixed Equipment", "wrench", "equipment.view", [
    "Dashboard", "Assets", "Licenses", "Accessories", "Consumables", "Components", "Predefined Kits", "Sign manager",
    "Requested", "Maintenances", "Audit", "Depreciations", "Locations", "Report", "Settings",
  ]),
  planned("Subscriptions", "repeat", "subscriptions.view"),
  { label: "Expenses", href: "/expenses", icon: "file", anyOf: ["expenses.view", "expenses.view_own"] },
  planned("Contracts", "contract", "contracts.view"),
  planned("Timesheets & Leave", "clipboard", "timesheets.view", [
    "Attendance", "Leave", "Work Shift Table", "Shift", "Shift Categories", "Reports", "Settings",
  ]),
  planned("Tasks", "check", "tasks.view"),
  planned("Estimate Request", "file", "estimate_requests.view"),
  planned("Knowledge Base", "book", "knowledge_base.view"),
  planned("Utilities", "cog", "utilities.view", [
    "Media", "Bulk PDF Export", "CSV Export", "Calendar", "Announcements", "Activity Log", "Surveys", "Automation",
    "Ticket Pipe Log",
  ]),
  {
    label: "Reports",
    href: "/reports",
    icon: "chart",
    anyOf: ["reports.view"],
    children: [
      { label: "Sales", href: "/reports/sales", anyOf: ["reports.view"] },
      { label: "Expenses", href: "/reports/expenses", anyOf: ["reports.view"] },
      { label: "Expenses vs Income", href: "/reports/income-expense", anyOf: ["reports.view"] },
      plannedLeaf("Reports", "Leads", "reports.view"),
      plannedLeaf("Reports", "Timesheets overview", "reports.view"),
      plannedLeaf("Reports", "KB Articles", "reports.view"),
    ],
  },
  planned("Sample Order", "layers", "sample_orders.view"),
  planned("Production Order", "layers", "production_orders.view"),
  {
    label: "Setup",
    href: "/settings",
    icon: "settings",
    anyOf: ["staff.view", "staff.manage", "roles.manage", "custom_fields.manage", "settings.manage", "audit.view", "expense_categories.view"],
    children: [
      { label: "Staff", href: "/settings/staff", anyOf: ["staff.view", "staff.manage"] },
      { label: "Roles & permissions", href: "/settings/roles", anyOf: ["roles.manage"] },
      { label: "Custom fields", href: "/settings/custom-fields", anyOf: ["custom_fields.manage"] },
      { label: "Company", href: "/settings/company", anyOf: ["settings.manage"] },
      { label: "Expense categories", href: "/settings/expense-categories", anyOf: ["expense_categories.view"] },
      { label: "Audit log", href: "/settings/audit", anyOf: ["audit.view"] },
    ],
  },
];

/** Finds the nav entries for a /planned/... path (top-level item + optional sub-item). */
export function findPlanned(path: string): { item: NavItem; sub?: NavLeaf } | null {
  for (const item of NAVIGATION) {
    const sub = item.children?.find((c) => c.href === path);
    if (sub?.planned) return { item, sub };
    if (item.planned && item.href === path) return { item };
  }
  return null;
}

/** What each planned module will do — shown on its placeholder page. */
export const PLANNED_MODULES: Record<string, { summary: string; features: string[] }> = {
  template: { summary: "Reusable document and message templates.", features: ["Invoice, DC and quote layouts", "WhatsApp / email message templates", "Variables and preview"] },
  leads: { summary: "Capture and convert inquiries from every channel.", features: ["Website form, WhatsApp, IndiaMART, phone", "Kanban pipeline with stages", "AI extraction, de-duplication and scoring", "Convert to customer + estimate"] },
  whatsbot: { summary: "WhatsApp Business inbox, bots and campaigns.", features: ["Shared team chat inbox (Cloud API)", "Message / template bots and a visual flow builder", "Campaigns incl. CSV upload", "AI assistant with editable prompts and canned replies", "Messages on the customer timeline"] },
  sales: { summary: "Quotations, estimates and credit notes.", features: ["Rate card by process × size × colours × quantity", "Versions and approval thresholds", "Customer acceptance via portal / WhatsApp", "GST credit notes linked to invoices"] },
  "hr-payroll": { summary: "Monthly payroll for staff and operators.", features: ["Employees, attendance-linked pay", "Commissions, deductions, bonus KPIs, insurance", "Payslips with templates", "Income tax and PF / ESI"] },
  manufacturing: { summary: "Products, routings and work centers.", features: ["Products and variants with BOM (films, inks, silicone, foils, TPU)", "Work centers: rotary, laser, embossing press, plotter, DTF", "Routings per process", "Service mappings to invoice items"] },
  "order-roadmap": { summary: "Visual timeline of every open order.", features: ["Stage-by-stage status per order", "Delay alerts against due dates"] },
  purchase: { summary: "Buying raw materials and services.", features: ["Vendors and vendor items", "Requests → quotations → purchase orders", "Returns, debit notes and vendor invoices"] },
  inventory: { summary: "Stock, delivery challans and warehouses.", features: ["Receiving vouchers and delivery challans", "Packing lists and internal delivery notes", "Loss & adjustment, multi-warehouse", "Inventory history and reorder alerts"] },
  accounting: { summary: "Ledgers and Tally integration.", features: ["Chart of accounts, journals, transfers", "Bank reconciliation and budgets", "Tally Prime sync and GST data"] },
  hrm: { summary: "Employee records.", features: ["Staff profiles, contracts and documents", "Insurance, timesheets and salary"] },
  appointly: { summary: "Customer appointments and callbacks.", features: ["Booking calendar and past meetings", "Callback requests", "Reminders over WhatsApp"] },
  "fixed-equipment": { summary: "Machines, tooling and assets.", features: ["Assets, components, consumables and kits", "Screens, dies and moulds with usage count", "Maintenance, audits and depreciation by location"] },
  subscriptions: { summary: "Recurring billing.", features: ["Recurring invoices", "Automatic reminders"] },
  contracts: { summary: "Customer contracts.", features: ["Templates and e-sign", "Renewal reminders"] },
  "timesheets-and-leave": { summary: "Attendance, shifts and leave.", features: ["Attendance and shift tables", "Shift categories", "Leave requests and approvals"] },
  tasks: { summary: "Team to-dos linked to any record.", features: ["Assignees, due dates, checklists", "Recurring tasks", "Kanban and calendar views"] },
  "estimate-request": { summary: "Public quote request forms.", features: ["Embeddable form for the website", "Auto-create lead + AI draft estimate"] },
  "knowledge-base": { summary: "Articles for staff and customers.", features: ["Public and internal articles", "Source for AI answers"] },
  utilities: { summary: "Media, exports, calendar and automation.", features: ["Media library, bulk PDF and CSV export", "Calendar and announcements", "Activity log, surveys, automation rules"] },
  reports: { summary: "More reports.", features: ["Leads conversion", "Timesheets overview", "KB article usage"] },
  "sample-order": { summary: "Strike-offs before bulk production.", features: ["Sample request → sample job → approval", "Photos and customer sign-off", "Convert to production order"] },
  "production-order": { summary: "Shop-floor production tracking.", features: ["Job cards with QR", "Machine planning board", "Output, rejections and piece reconciliation"] },
};
