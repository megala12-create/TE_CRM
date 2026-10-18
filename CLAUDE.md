# CLAUDE.md — TE-CRM engineering conventions

Replacement for the customised Perfex CRM of Tiruppur Embossing. `README.md` covers how to run it. `docs/` holds scope and decisions (see the ADR revisions in `docs/02-ARCHITECTURE.md`).

## Status
Release 1 is built: auth, RBAC, custom fields, customers, invoices, payments, statements, expenses, items, dashboard, reports, audit. All other menu modules render "planned" pages from `src/lib/navigation.ts`. See `docs/11-ROADMAP.md` for what comes next.

## Stack
Next.js 16 (App Router, Server Components, Server Actions, `src/proxy.ts`), React 19, TypeScript strict, Tailwind v4, Drizzle ORM + PostgreSQL 17 (Docker, port 5433), Zod 4, @node-rs/argon2, Vitest.

## Rules
- **Pure business logic lives in `src/lib`** (GST, money, permissions, custom fields) with tests in `src/lib/*.test.ts`. No DB or Next imports there.
- **Every page** calls `requirePermission(...)`. **Every server action** calls `assertPermission(...)` and re-checks record access (`src/server/scope.ts`). Never trust IDs from the client.
- **Record-level access:** use `customerScope / invoiceScope / expenseScope` in every query that lists or loads records. Out-of-scope records return 404.
- **New module?** Add its permissions in `src/lib/permissions.ts` and its menu entry in `src/lib/navigation.ts`.
- **Custom fields:** entity rows have `custom jsonb`. Parse with `parseCustomFields(getActiveFields(entity), form, user, existing.custom)` so hidden and read-only values are preserved. To support a new entity, add it to `CUSTOM_FIELD_ENTITIES`.
- **Money:** `numeric` in DB. Compute in paise (`toPaise / fromPaise / mulPaise`), never floats. Display with `formatINR` (en-IN).
- **Issued invoices are immutable.** Correct them with cancel or (future) credit notes. Numbers come from `nextNumber()` per financial year.
- **Audit** every create/update/delete/issue/export with `audit(...)`.
- **Correlated subqueries in `select({...})`:** Drizzle renders column references there *without* the table name, so `${schema.roles.id}` inside `(select … from users where …)` silently becomes the inner table's `id`. Write the outer column explicitly, e.g. `sql\`(select count(*) from users u where u.role_id = "roles"."id")\``.
- **Schema changes:** edit `src/db/schema.ts` → `npx drizzle-kit generate --name <change>` → `npm run db:migrate`. Never edit applied migrations.
- **Forms:** use `<ActionForm>` + field components. Actions return `{ errors, message }` and do not throw for validation.
- Before finishing: `npm run typecheck`, `npm test`, `npx next build`.

## AI agents (planned — see docs/04-AI-AGENTS.md)
- Default model `claude-opus-5-5`. Changing the model or tier requires a full eval run.
- Tools call the server layer under the acting user's permissions. Tools with `external`/`financial` side effects return proposals. They never execute directly.
- Customer-supplied content is untrusted data. It must never trigger side effects.
