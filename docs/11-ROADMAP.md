# 11 — Roadmap

Durations assume the team below and are **estimates to re-baseline after Phase 0**.

## Team (recommended)

| Role | Count | Notes |
|---|---|---|
| Tech lead / architect (full-stack TS) | 1 | Owns architecture, security, AI design |
| Full-stack engineers | 2–3 | |
| UI/UX designer | 1 (part-time after Phase 1) | |
| QA engineer | 1 (from Phase 2) | Automation-focused |
| Product owner (business side) | 1 | Decides priorities. Available weekly. |
| Persona champions | 1 per area | Sales, production, accounts |

## Progress

| Date | Release | Delivered |
|---|---|---|
| 2026-10-12 | **Release 1** | Login/sessions, admin-managed roles & permissions (every menu module), admin custom fields + per-user columns, customers (contacts, notes, statement), GST invoices + print, payments, expenses, items, dashboard, reports, search, CSV export, audit log, Docker deployment. Full current-CRM menu with planned modules. |

| 2026-10-12 | Release 1.1 | Expenses redesigned to match the Perfex screen (receipt upload, vendors, Tax 1/Tax 2 on top, recurring expenses, quick-add category, searchable customer). Purchase → Vendors live. |

| 2026-10-13 | Release 1.2 | Perfex-style Sales: **Quotations**, **Proforma invoices**, **Credit notes** (apply to invoices, refunds, void), invoice list with Order/Tags, **Batch payments**, **Recurring invoices**, "Mark as sent", configurable number formats (`TE-25-26-SI-000178`, `QUOTATION-000261`, `CN-000009`, `TE-26-27-PI-000001`) with "next number" to continue from Perfex. Dashboard with invoice/estimate/quotation overview + payment records chart. Reports → Sales (invoices report with per-rate GST columns, services, payments, credit notes, quotations, customers, 3 chart reports) and Reports → Expenses (category × month). Verified with real-browser end-to-end tests. |

**Detailed plan for the next phase:** [14-PLAN-LEADS-QUOTES-SAMPLES-PRODUCTION.md](14-PLAN-LEADS-QUOTES-SAMPLES-PRODUCTION.md) (≈16 weeks, 8 sprints).

**Next up (suggested order):** Leads → Quotations/Estimates → Credit notes → Sample Order + Production Order → Inventory (Delivery Challan) → WhatsBot → Purchase → HR/Payroll → Accounting/Tally. Also: 2FA/passkeys, data migration from Perfex, Tamil UI, AI agents wave 1.

## Phases

### Phase 0 — Discovery & Audit (2–3 weeks)
- Perfex code + DB audit, customisation diff, data-quality report ([01](01-CURRENT-STATE-AND-MIGRATION.md)).
- Persona interviews, flow recordings, baseline metrics.
- Answer [12-OPEN-QUESTIONS.md](12-OPEN-QUESTIONS.md).
- Confirm hosting, GSP, WhatsApp BSP/Cloud API, STT vendor, AI data terms.
- **Exit:** signed-off scope, prioritised backlog, wireframes of top 10 flows, final estimate.

### Phase 1 — Foundation (5–6 weeks)
- Monorepo, CI/CD, environments, observability, IaC.
- Auth (passwords + 2FA + passkeys), RBAC, RLS, audit log, tenants/settings.
- Design system v1 + app shell + command palette + global search.
- Migrator skeleton with first entities (accounts, contacts, staff).
- AI platform layer: `packages/ai` orchestrator, tool registry, `ai_runs` logging, budgets, kill switch, eval harness.
- **Exit:** staff can log in to staging and browse migrated customers quickly.

### Phase 2 — CRM parity (7–8 weeks)
- Leads, pipeline, quotes, accounts 360, tasks, calendar, notes/timeline, files, tickets, knowledge base, notifications, email.
- WhatsApp inbox (Cloud API).
- Migrator: all Perfex entities in use + reconciliation report.
- **AI wave 1a:** A1 Copilot (read-only first), A2 Lead intake, A6 Support triage, A10 Data hygiene (for migration clean-up).
- **Exit:** sales + support pilot users working daily on staging data synced from Perfex.

### Phase 3 — Job-work operations & billing (8–9 weeks)
- Job orders, artwork + approvals, inward DC, process routing, planning board, job cards (PWA/offline), QC, piece ledger, outward DC, dies, consumables.
- GST invoicing, e-invoice, e-way bill, payments + UPI links, receivables, Tally sync, ITC-04 data.
- **AI wave 1b:** A3 PO extraction, A4 Quote drafting, A5 Collections.
- **Exit:** a full order-to-cash flow done end-to-end in staging by real users.

### Phase 4 — Portal, reporting, hardening & cutover (5–6 weeks)
- Customer portal (PWA), dashboards + standard reports, automation builder (basic).
- Performance tuning against budgets. Pen-test and fixes. Accessibility pass.
- Two full migration rehearsals → cutover weekend → 2-week hypercare.
- **Exit:** live in production. Perfex read-only.

### Phase 5 — AI wave 2 & optimisation (ongoing, from go-live)
- A7 Artwork checker, A8 Daily briefing, A9 Ask-your-data, A11 Voice notes, A14 Receipts.
- Then A12 Portal assistant, A13 Production planner.
- Model-tier cost optimisation using eval data. Workflow-builder enhancements. Native app if PWA limits are reached.

## Timeline (indicative)

```
Month:     1        2        3        4        5        6        7
Phase 0  ███
Phase 1     ██████
Phase 2           █████████
Phase 3                    ██████████
Phase 4                              ███████
Go-live                                     ▲ (~ month 7)
Phase 5                                     ███████████ →
```

## Milestone demos
At the end of every 2-week sprint: a live demo to the product owner and champions on staging. Feedback goes into the backlog the same day.
