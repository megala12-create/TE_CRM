/**
 * Runs an import from the command line with the same code as the Import screens.
 *
 *   npx tsx --import ./scripts/server-only-stub.mjs scripts/import-file.ts <entity> <file.csv|.xlsx> <user email> [--commit] [--create-customers]
 *
 * Without --commit it only checks the file (like "Upload & check"). Uses DATABASE_URL from .env,
 * or from another file with DOTENV_CONFIG_PATH=.env.neon.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { runImport } from "../src/server/importers";
import { csvTable, isImportEntity } from "../src/lib/importing";
import { xlsxRows } from "../src/lib/xlsx";
import type { CurrentUser } from "../src/server/auth";

const [entity, path, email] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const commit = process.argv.includes("--commit");
const createCustomers = process.argv.includes("--create-customers");
if (!entity || !path || !email || !isImportEntity(entity)) {
  console.error("Usage: import-file.ts <entity> <file> <user email> [--commit] [--create-customers]");
  process.exit(1);
}

const [u] = await db
  .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, isAdmin: schema.users.isAdmin, roleId: schema.users.roleId, roleName: schema.roles.name, permissions: schema.roles.permissions, active: schema.users.active })
  .from(schema.users)
  .leftJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
  .where(eq(sql`lower(${schema.users.email})`, email.toLowerCase()));
if (!u?.active) {
  console.error(`No active user ${email}`);
  process.exit(1);
}
const user: CurrentUser = { id: u.id, name: u.name, email: u.email, isAdmin: u.isAdmin, roleId: u.roleId, roleName: u.roleName, permissions: u.permissions ?? [] };

const bytes = readFileSync(path);
const table = /\.xlsx$/i.test(path) ? xlsxRows(new Uint8Array(bytes)) : csvTable(bytes.toString("utf8"));
const r = await runImport(entity, user, table, { commit, createCustomers });

console.log(r.message);
for (const n of r.notes) console.log(`  note: ${n}`);
if (r.ignored.length) console.log(`  columns not used: ${r.ignored.join(", ")}`);
for (const [kind, list] of [["ERROR", r.errors], ["WARNING", r.warnings], ["skipped", r.skipped]] as const) {
  for (const p of list) console.log(`  row ${p.line} ${kind}: ${p.message}`);
}
console.table(r.preview.map((p) => Object.fromEntries([["row", p.line], ...r.previewHead.map((h, i) => [h, p.cells[i]])])));
process.exit(0);
