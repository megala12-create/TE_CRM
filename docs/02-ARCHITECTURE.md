# 02 — Architecture

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** end-to-end (strict mode) | One language for web, API, workers, migrator, AI tools. Shared types and validation. |
| Monorepo | **pnpm workspaces + Turborepo** | Fast cached builds, shared packages |
| Web app | **Next.js (App Router, React Server Components)** + React | Server rendering + streaming makes first loads fast. Mature ecosystem. |
| UI kit | **Tailwind CSS v4 + shadcn/ui (Radix primitives)** + custom design tokens | Accessible primitives that we own, no heavy component library |
| Client data | **TanStack Query** (cache, optimistic updates), **TanStack Table** + virtualisation | Instant-feeling lists and grids |
| Forms | **React Hook Form + Zod** (schemas shared with the API) | One validation source of truth |
| Charts | **Apache ECharts** (dashboards), lightweight sparklines in SVG | Handles large data sets, good mobile support |
| API | **NestJS** (modular monolith), **REST + OpenAPI 3.1**, generated typed client | Clear module boundaries, DI, guards for RBAC. OpenAPI also serves integrations and AI tools. |
| Realtime | **WebSockets** (Socket.IO adapter) / SSE for AI streaming | Live job status, notifications, AI token streaming |
| ORM / SQL | **Drizzle ORM** + hand-written SQL where needed | Type-safe, thin, predictable SQL, good migrations |
| Database | **PostgreSQL 17+** with `pgvector`, `pg_trgm`, row-level security | One database for relational, full-text, fuzzy and vector search |
| Cache / queues | **Valkey/Redis** + **BullMQ** | Caching, rate limits, background jobs, schedules |
| Search | Postgres full-text + trigram (v1). Meilisearch only if needed later. | Avoid running an extra system before it is needed |
| Files | **S3-compatible object storage** (India region), pre-signed URLs | Cheap, durable, offloads bandwidth |
| AI | **Anthropic Claude API** via `@anthropic-ai/sdk` (TypeScript) | See [04-AI-AGENTS.md](04-AI-AGENTS.md) |
| Auth | Own auth module: **argon2id** passwords, **TOTP 2FA**, **passkeys (WebAuthn)**, OAuth (Google) for staff optional | Full control, no per-seat SaaS cost |
| PDF | HTML templates → PDF via headless Chromium worker (Playwright) | Pixel-perfect GST invoices and DCs |
| Mobile | **PWA** (installable, offline queue for shop-floor actions) | One codebase. Native app later if needed. |
| Observability | **OpenTelemetry** → Grafana stack (or Sentry for errors) | Traces across web → API → DB → AI calls |
| Infra | Docker images, deployed to India region (Mumbai) | Data residency, low latency for Tiruppur users |

## 2. System context

```
                ┌───────────────────────── Users ─────────────────────────┐
                │ Staff (desktop/PWA)   Shop floor (tablet)   Customers    │
                └──────────────┬──────────────────────────────┬───────────┘
                               │ HTTPS                        │ HTTPS (portal)
                        ┌──────▼──────────────────────────────▼──────┐
                        │      CDN / WAF (TLS, bot + rate limits)    │
                        └──────┬─────────────────────────────────────┘
                               │
                   ┌───────────▼───────────┐       ┌──────────────────────┐
                   │  Web (Next.js, SSR)   │──────▶│  API (NestJS)        │
                   └───────────────────────┘ REST  │  modules + RBAC      │
                                                   │  AI orchestration    │
                                                   └──┬──────┬──────┬─────┘
                       ┌──────────────────────────────┘      │      └────────────┐
                ┌──────▼──────┐   ┌───────────────┐   ┌──────▼──────┐   ┌───────▼────────┐
                │ PostgreSQL  │   │ Valkey/Redis  │   │ Workers      │   │ Object storage │
                │ (+ replica) │   │ cache, queues │   │ (BullMQ)     │   │ files, PDFs    │
                └─────────────┘   └───────────────┘   └──────┬──────┘   └────────────────┘
                                                             │
     External: Claude API · WhatsApp Cloud API · GSP (e-invoice/e-way bill) · GSTIN lookup
               Razorpay/UPI · Email (SES/Postmark) · SMS (DLT) · IndiaMART · Tally (XML/ODBC)
```

## 3. Modular monolith layout

```
te-crm/
├─ apps/
│  ├─ web/              Next.js (staff app + customer portal under /portal)
│  ├─ api/              NestJS HTTP API
│  └─ worker/           BullMQ workers (PDF, notifications, AI jobs, sync, imports)
├─ packages/
│  ├─ domain/           Entities, Zod schemas, business rules (framework-free, heavily unit-tested)
│  ├─ db/               Drizzle schema, migrations, seeders
│  ├─ ui/               Design system (tokens, components, icons)
│  ├─ api-client/       Generated from OpenAPI
│  ├─ ai/               Agent definitions, tools, prompts, evals
│  ├─ integrations/     WhatsApp, GSP, Razorpay, Tally, IndiaMART adapters
│  ├─ migrator/         Perfex → TE-CRM ETL
│  └─ config/           ESLint, TS, Tailwind presets
├─ docs/                (this folder)
└─ infra/               Docker, IaC, runbooks
```

**Module rules**
- Each module (`leads`, `quotes`, `production`, `billing`, …) owns its tables. Other modules use its **public service interface** or **domain events**, never its tables directly.
- Cross-module side effects go through an **outbox table + event bus** (for example `InvoiceIssued` triggers an e-invoice job, a Tally sync and a customer notification). This keeps writes transactional and retries safe.
- Business rules live in `packages/domain` as pure functions, so they are testable without a DB.

## 4. Key request flows

**Read (list screen):** Browser → Next.js RSC fetches the first page server-side (streamed HTML) → client takes over with TanStack Query → further pages use keyset pagination → Redis caches hot reference data (rate cards, tax rates, users).

**Write (e.g. issue invoice):** API validates (Zod) → RBAC guard → domain rule check → DB transaction writes the invoice and an outbox event → response in < 200 ms → worker picks up the event → GSP e-invoice (IRN) → PDF render → WhatsApp/email to customer → timeline updated live via WebSocket.

**AI (e.g. "draft quote from this WhatsApp message"):** API → `ai` module builds context and permitted tools for **this user's role** → Claude call (streamed) → tool calls run through the same service layer and RBAC as the UI → result returned as a **draft** → a human approves → normal write flow.

## 5. Architecture Decision Records (summary)

| ADR | Decision | Alternatives considered | Reason |
|---|---|---|---|
| 001 | Rebuild instead of extending Perfex | Re-skin Perfex; build Perfex modules | Perfex's PHP/jQuery architecture caps speed and UX. Customisations are already costly. Rebuild + data migration gives a clean base. |
| 002 | Modular monolith | Microservices | Small team, single business. Microservices add ops cost with no benefit at this scale. Boundaries still allow later extraction. |
| 003 | PostgreSQL over MySQL | Keep MySQL | JSONB, RLS, pgvector, better full-text. One DB for everything. |
| 004 | TypeScript end-to-end | PHP/Laravel, Python/Django | Shared types and validation across UI/API/AI tools. Huge hiring pool. |
| 005 | REST + OpenAPI | GraphQL, tRPC | Simple caching, easy for integrations, the mobile app and AI tool definitions |
| 006 | Claude API with our own tool layer (Tool Runner) | Managed Agents for everything | Agent tools must hit our DB under the user's RBAC. Keep the loop inside our API. Managed Agents can be revisited for long-running scheduled research tasks. |
| 007 | PWA before native | React Native/Expo now | One codebase, instant updates, offline queue covers shop-floor needs |
| 008 | India-region hosting | Global region | Latency for Tiruppur users and DPDP data-localisation preferences |
| 009 | `tenant_id` on every business table | Single-tenant schema | Cheap now, and allows future multi-branch or SaaS without a rewrite |

Full ADRs go in `docs/adr/NNN-title.md` as decisions are made or revised.

### Revisions made while building Release 1 (2026-10-12)

| ADR | Revised decision | Reason |
|---|---|---|
| 002/005 | **Single Next.js full-stack app** (React Server Components + Server Actions + route handlers). NestJS is not used yet. | One deployable, fewer moving parts, fastest path to production. Business rules stay framework-free in `src/lib`, so a separate API can be extracted later without rewriting them. Integrations get REST route handlers under `/api`. |
| 003 | PostgreSQL 17 + Drizzle ORM (as planned). Money stored as `numeric`, computed in integer paise. | — |
| 008-data | **Integer identity IDs** instead of UUIDv7 | Friendly record numbers (#10) like Perfex. Every record is still access-checked, so sequential IDs reveal nothing to unauthorised users (they get 404). |
| 009 | `tenant_id` + Postgres RLS **deferred** | Single company for now. Access control is enforced in the server layer (`src/server/scope.ts`) and covered by RBAC tests. Revisit before any multi-branch or SaaS use. |
| — | Custom fields stored in a `custom jsonb` column per entity, defined in `custom_fields` | Admins add fields without schema changes or deployments. Values survive field deletion and re-creation. |
| — | Sessions in Postgres (hashed tokens), argon2id passwords | No extra infrastructure. Redis is only needed once there are multiple app instances (login throttling is in-process today). |

## 6. Hosting options

| Option | Setup | Indicative monthly cost | When |
|---|---|---|---|
| **Lean** | 1–2 VMs (Docker Compose) + managed PostgreSQL + managed Redis + S3-compatible storage + Cloudflare | Low (fits a mid-size business budget) | Go-live, < 100 users |
| **Scale** | Containers on managed orchestration (ECS/Fargate or k8s), Postgres primary + read replica, autoscaling workers | Higher | Multi-branch / SaaS / heavy AI usage |

The application is identical in both. Only `infra/` differs. Final choice and exact costs are confirmed in Phase 0 ([12](12-OPEN-QUESTIONS.md)).
