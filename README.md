# TE-CRM — Tiruppur Embossing CRM

A fast, secure CRM that replaces the customised Perfex install at `www.tiruppuremboss.com`.

**Status:** Release 1 (core CRM + admin platform) built and running locally. Other menu modules are on the [roadmap](docs/11-ROADMAP.md).

---

## Run it locally (Windows)

Prerequisites: Node.js 22+ and Docker Desktop (running).

```powershell
npm install                 # once
copy .env.example .env      # once — then edit the admin email/password inside
npm run db:up               # starts PostgreSQL in Docker (port 5433)
npm run db:migrate          # creates/updates tables
npm run db:seed             # roles, admin user, items, categories (+ demo data if SEED_DEMO_DATA=true)
npm run dev                 # development server  → http://localhost:3000
# or, for production speed:
npm run build; npm start
```

Log in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env` (default `admin@tiruppurembossing.com` / `ChangeMe!2026`). **Change this password right after the first login** (Setup → Staff).

Other commands: `npm test` (unit tests), `npm run typecheck`, `npm run db:studio` (browse the database).

## Deploy to a server

```bash
# on the server, next to docker-compose.yml, create .env with:
#   POSTGRES_PASSWORD=<long random>   SEED_ADMIN_PASSWORD=<strong password>
docker compose --profile prod up -d --build
```

Receipts are stored in the `tecrm_files` volume (`UPLOAD_DIR`). Back it up together with the database. For recurring expenses to be created even on days nobody opens Expenses, set `CRON_SECRET` and call `POST /api/cron/recurring-expenses` daily with `Authorization: Bearer <CRON_SECRET>`.

Put it behind HTTPS (Caddy, Nginx or Cloudflare), with a domain such as `app.tiruppuremboss.com`. Session cookies are HTTPS-only in production. Set `COOKIE_SECURE=false` only for a trusted plain-HTTP LAN install. The health check is at `GET /api/health`. Back up the `tecrm_pg` volume daily (see [09-DEVOPS-AND-OPERATIONS.md](docs/09-DEVOPS-AND-OPERATIONS.md)).

## What's in Release 1

| Area | Features |
|---|---|
| **Admin: roles & permissions** | Create roles. Tick permissions per module (view all / view own / create / edit / delete / manage). Permissions exist for every menu module, including planned ones. Admin flag for full access. Users are logged out when their access changes. |
| **Admin: custom fields** | Add fields to Customers, Contacts, Invoices, Payments and Expenses with 11 types (text, number, ₹, date, dropdown, multi-select, yes/no, email, phone, URL, long text). Fields can be required, shown as list columns, ordered, given defaults and help text, and limited by role for viewing and editing. |
| **Columns** | Each user chooses which columns each list shows, including custom fields. |
| **Customers** | List with stats, search (name, GSTIN, phone, contact, custom fields), filters, groups, CSV export. GSTIN checksum validation and auto state. Profile tabs: Profile, Contacts, Notes, Statement, Invoices, Payments. |
| **Invoices** | GST invoices with automatic CGST+SGST or IGST by place of supply, HSN/SAC, discount, round-off, amount in words, and FY-wise gap-free numbering (`TE/2026-27/0001`) assigned on issue. Draft, issue and cancel; issued invoices cannot be edited. Print/PDF. |
| **Payments** | Record against an invoice (bank/UPI/cash/cheque/card). Over-payment is blocked. Balances update automatically. |
| **Statements** | Customer statement for any period with opening balance and running balance. Printable. |
| **Expenses** | Perfex-style form: receipt upload (PDF/JPG/PNG/WEBP, 10 MB, stored privately), vendor, name, note, category with quick-add "+", date, amount, searchable customer + billable. **Advanced options:** INR currency, Tax 1 + Tax 2 added on top (GST/IGST/CGST/SGST), payment mode, reference, **repeat every** (auto-created copies). Totals and tax shown live. List with receipt/recurring icons and a detail panel with receipt preview. |
| **Vendors** | Purchase → Vendors: name, GSTIN, contact, total spent. Used on expenses. |
| **Items** | Your 20 processes (DTF, Silicon HD, Embossing, 3D TPU …) with default rates, HSN/SAC and GST. |
| **Dashboard & reports** | KPIs, invoice status overview, highest dues. Sales, expenses, and expenses-vs-income by month for any period. |
| **Platform** | Full audit log, global search, CSV exports (formula-injection safe), and a sidebar that matches your current CRM menu. |

> **Check before go-live:** the seeded HSN/SAC codes and GST rates on items are placeholders. Confirm them with your auditor in Sales → Items. Fill in your GSTIN and bank details in Setup → Company.

## Documentation

| # | Document |
|---|----------|
| 00 | [Vision & Scope](docs/00-VISION-AND-SCOPE.md) |
| 01 | [Current State & Migration](docs/01-CURRENT-STATE-AND-MIGRATION.md) |
| 02 | [Architecture](docs/02-ARCHITECTURE.md) |
| 03 | [Modules & Features](docs/03-MODULES-AND-FEATURES.md) |
| 04 | [AI Agents](docs/04-AI-AGENTS.md) |
| 05 | [UI/UX & Design System](docs/05-UI-UX-DESIGN-SYSTEM.md) |
| 06 | [Performance](docs/06-PERFORMANCE.md) |
| 07 | [Security & Compliance](docs/07-SECURITY-AND-COMPLIANCE.md) |
| 08 | [Data Model](docs/08-DATA-MODEL.md) |
| 09 | [DevOps & Operations](docs/09-DEVOPS-AND-OPERATIONS.md) |
| 10 | [Testing & QA](docs/10-TESTING-AND-QA.md) |
| 11 | [Roadmap](docs/11-ROADMAP.md) |
| 12 | [Open Questions](docs/12-OPEN-QUESTIONS.md) |
| 13 | [Business Profile](docs/13-BUSINESS-PROFILE.md) |
| — | [CLAUDE.md](CLAUDE.md): engineering conventions |

## Code map

```
src/
  app/(app)/        pages: dashboard, customers, invoices, payments, items, expenses, reports, search, settings, planned
  app/api/          export (CSV), health
  app/login, print  login page, printable invoice
  components/       design system (ui, fields, action-form, column chooser, tables)
  db/               Drizzle schema, migrate, seed      drizzle/  SQL migrations
  lib/              pure business logic: GST, money, permissions, custom fields, navigation (unit-tested)
  server/           auth/sessions, record scoping, audit, settings, queries
  proxy.ts          route guard
```
