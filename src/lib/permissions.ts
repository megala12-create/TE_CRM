// Permission catalogue. Roles store a list of these keys; admins bypass all checks.
// "view_own" limits a user to records they own (customer owner / sales agent / creator).
// Modules marked `planned` exist in the menu and can already be granted, but their screens are not built yet.

const CRUD = ["view", "create", "edit", "delete"] as const;
const CRUD_OWN = ["view", "view_own", "create", "edit", "delete"] as const;

export const PERMISSION_MODULES = [
  // Core (built)
  { module: "dashboard", label: "Dashboard", actions: ["view"] },
  { module: "customers", label: "Customers & contacts", actions: CRUD_OWN },
  { module: "invoices", label: "Invoices", actions: CRUD_OWN },
  { module: "quotations", label: "Quotations", actions: CRUD_OWN },
  { module: "proforma_invoices", label: "Proforma invoices", actions: CRUD_OWN },
  { module: "credit_notes", label: "Credit notes", actions: ["view", "create", "edit", "delete"] },
  { module: "payments", label: "Payments", actions: ["view", "create", "delete"] },
  { module: "expenses", label: "Expenses", actions: CRUD_OWN },
  { module: "expense_categories", label: "Expense categories (master)", actions: CRUD },
  { module: "items", label: "Items & rates", actions: ["view", "manage"] },
  { module: "reports", label: "Reports & statements", actions: ["view"] },
  // Planned (menu from the current CRM)
  { module: "templates", label: "Templates", actions: CRUD, planned: true },
  { module: "leads", label: "Leads", actions: CRUD_OWN, planned: true },
  { module: "whatsbot", label: "WhatsBot", actions: ["view", "manage"], planned: true },
  { module: "estimates", label: "Estimates & proposals", actions: CRUD_OWN, planned: true },
  { module: "payroll", label: "HR payroll", actions: ["view", "manage"], planned: true },
  { module: "manufacturing", label: "Manufacturing", actions: CRUD, planned: true },
  { module: "order_roadmap", label: "Order roadmap", actions: ["view"], planned: true },
  { module: "purchase", label: "Purchase", actions: CRUD, planned: true },
  { module: "inventory", label: "Inventory", actions: CRUD, planned: true },
  { module: "accounting", label: "Accounting", actions: ["view", "manage"], planned: true },
  { module: "hrm", label: "HRM", actions: CRUD, planned: true },
  { module: "appointments", label: "Appointly", actions: CRUD, planned: true },
  { module: "equipment", label: "Fixed equipment", actions: CRUD, planned: true },
  { module: "subscriptions", label: "Subscriptions", actions: CRUD, planned: true },
  { module: "contracts", label: "Contracts", actions: CRUD, planned: true },
  { module: "timesheets", label: "Timesheets & leave", actions: ["view", "view_own", "manage"], planned: true },
  { module: "tasks", label: "Tasks", actions: CRUD_OWN, planned: true },
  { module: "estimate_requests", label: "Estimate requests", actions: CRUD, planned: true },
  { module: "knowledge_base", label: "Knowledge base", actions: CRUD, planned: true },
  { module: "utilities", label: "Utilities", actions: ["view"], planned: true },
  { module: "sample_orders", label: "Sample orders", actions: CRUD, planned: true },
  { module: "production_orders", label: "Production orders", actions: CRUD, planned: true },
  // Administration (built)
  { module: "staff", label: "Staff", actions: ["view", "manage"] },
  { module: "roles", label: "Roles & permissions", actions: ["manage"] },
  { module: "custom_fields", label: "Custom fields", actions: ["manage"] },
  { module: "settings", label: "Company settings", actions: ["manage"] },
  { module: "audit", label: "Audit log", actions: ["view"] },
] as const satisfies readonly { module: string; label: string; actions: readonly string[]; planned?: boolean }[];

export const ACTION_LABELS: Record<string, string> = {
  view: "View (all)",
  view_own: "View (own)",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  manage: "Manage",
};

export const ALL_ACTIONS = ["view", "view_own", "create", "edit", "delete", "manage"] as const;

type Mod = (typeof PERMISSION_MODULES)[number];
export type Permission = { [M in Mod as M["module"]]: `${M["module"]}.${M["actions"][number]}` }[Mod["module"]];

export const ALL_PERMISSIONS: string[] = PERMISSION_MODULES.flatMap((m) =>
  (m.actions as readonly string[]).map((a) => `${m.module}.${a}`),
);

export function isValidPermission(p: string): p is Permission {
  return ALL_PERMISSIONS.includes(p);
}

export type AccessSubject = { isAdmin: boolean; permissions: readonly string[] };

export function can(user: AccessSubject, permission: Permission): boolean {
  return user.isAdmin || user.permissions.includes(permission);
}

/** "all" = can see every record, "own" = only own records, "none" = no access. */
export function viewScope(user: AccessSubject, module: "customers" | "invoices" | "expenses" | "quotations" | "proforma_invoices"): "all" | "own" | "none" {
  if (user.isAdmin || user.permissions.includes(`${module}.view`)) return "all";
  if (user.permissions.includes(`${module}.view_own`)) return "own";
  return "none";
}
