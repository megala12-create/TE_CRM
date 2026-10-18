# 00 — Vision & Scope

## 1. Why rebuild

Perfex is a solid generic CRM, but it is limiting this business:

| Pain (typical for customised Perfex installs) | Effect on the business |
|---|---|
| Server-rendered PHP pages with full page reloads and heavy jQuery | Slow screens, especially on mobile and on the shop floor |
| Customisations patched into core files and modules | Upgrades are risky, and every new feature costs more |
| Generic sales/projects model | No native concept of job orders, inward/outward DCs, piece reconciliation, dies or production stages |
| Limited reporting | Owners export to Excel to get answers |
| No AI, weak automation | Staff re-type data from WhatsApp, PDFs and emails |
| Email-centric | Customers in Tiruppur live on WhatsApp |
| Basic security model | No passkeys, limited audit trail, coarse permissions |

> These points are inferred from how Perfex is usually customised. Phase 0 (see [11-ROADMAP.md](11-ROADMAP.md)) checks them against the real installation.

## 2. Vision

> **One fast system where every inquiry, order, piece, rupee and conversation is captured once, visible instantly, and acted on with AI help, from phone or desktop, in Tamil or English.**

## 3. Users and their jobs

| Persona | Main jobs | Device |
|---|---|---|
| **Owner / Director** | See the business today, approve big quotes, chase cash | Phone first, desktop |
| **Sales / Merchandiser** | Capture inquiries, quote, follow up, manage customer relationships | Phone and desktop |
| **Production Supervisor** | Plan jobs, assign machines and dies, track progress, record output and rejections | Tablet or phone on the shop floor |
| **Stores / Dispatch** | Inward goods, outward DC, e-way bill, stock of consumables | Desktop and phone (barcode/QR) |
| **Accounts** | Invoice, e-invoice, payments, receivables, Tally sync, GST returns data | Desktop |
| **Customer (portal)** | Track job status, approve artwork, download DC and invoice, raise tickets, pay | Phone |
| **Admin** | Users, roles, settings, templates, integrations | Desktop |

## 4. Goals and measures of success

| Goal | Metric | Target (6 months after go-live) |
|---|---|---|
| Speed | Median page interaction ready | < 1 s on desktop, < 2 s on mid-range Android over 4G |
| Less re-typing | Inquiries/POs created from AI extraction instead of manual entry | ≥ 70 % |
| Faster quoting | Inquiry → quote sent | Median under 2 hours (baseline taken in Phase 0) |
| Cash | Days Sales Outstanding (DSO) | −20 % from baseline |
| Production visibility | Jobs whose live status is known in the system | 100 % |
| Piece accuracy | Unreconciled pieces per job (inward − outward − rejected) | 0 at job close |
| Adoption | Weekly active staff / total staff | ≥ 90 % |
| Reliability | Uptime (business hours) | ≥ 99.9 % |
| Security | Critical/high findings open at go-live | 0 |

## 5. Scope

### In scope (v1)
- Full functional parity with the Perfex modules **actually in use** (confirmed in Phase 0).
- Job-work operations: job orders, artwork approval, inward/outward DC, production tracking, piece reconciliation, dies/tooling, consumables.
- India compliance: GST invoicing, e-invoice (IRN/QR), e-way bill, ITC-04 data for job work, Tally export.
- Communication hub: WhatsApp Business, email, SMS in one timeline.
- Customer portal (PWA).
- AI agents, wave 1 (see [04-AI-AGENTS.md](04-AI-AGENTS.md)).
- Data migration from Perfex with complete history.

### Out of scope (v1). Revisit later.
- Full accounting ledger (Tally stays the books of record; we sync to it).
- Payroll and HR attendance.
- Native iOS/Android apps (the PWA covers v1; Expo/React Native is a later option).
- Multi-company SaaS resale (the architecture keeps the option open with a `tenant_id` on every row, but v1 is single-tenant in practice).

## 6. Guiding principles

1. **Capture once.** No data is typed twice. AI and integrations do the copying.
2. **Fast by default.** Every screen has a performance budget ([06](06-PERFORMANCE.md)).
3. **Human-in-the-loop AI.** AI drafts and humans approve anything external or financial ([04](04-AI-AGENTS.md)).
4. **Secure by design.** Least privilege, full audit trail, encrypted everywhere ([07](07-SECURITY-AND-COMPLIANCE.md)).
5. **Boring, proven tech.** Choose well-supported mainstream tools over novel ones.
6. **Ship in slices.** Each phase ends in something staff use in production.
