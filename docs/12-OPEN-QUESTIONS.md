# 12 — Open Questions

Answer these in Phase 0. Each answer may change scope, cost or design. Record the answer, the date, and who decided.

## Business & domain
| # | Question | Why it matters | Answer |
|---|---|---|---|
| B1 | ~~What processes do you offer?~~ **Answered:** 22 print/transfer/embossing/laser processes ([13](13-BUSINESS-PROFILE.md)) | — | Website |
| B2 | What share of work is **make-and-sell transfers** vs. **job work on customer garments**? | Inventory/BOM vs. inward-DC flows, ITC-04 | |
| B3 | How is each process priced (per piece by size × colours × qty slab, setup/screen/die charges)? Minimum order quantities? | Rate-card engine | |
| B4 | Are screens, dies and TPU moulds charged to customers, and kept for repeat orders? | Tooling register, billing | |
| B5 | Typical monthly volume: inquiries, job orders, DCs, invoices, pieces? | Capacity planning, AI cost estimates | |
| B6 | Number of machines, shifts, branches/units? | Planning board, multi-location | |
| B7 | Main customer channels today (WhatsApp, phone, email, IndiaMART, visits)? | Integration priorities | |
| B8 | Which reports does the owner look at weekly (or build in Excel)? | Dashboard design | |

## Current system
Not needed in depth. The owner will share screenshots of the screens in use, and these set the parity scope.

| # | Question | Answer |
|---|---|---|
| C1 | Screenshots of each screen and report used today | Pending |
| C2 | Should existing data (customers, invoices) be migrated, or do we start fresh with an opening-balance import? | |

## Finance & compliance
| # | Question | Answer |
|---|---|---|
| F1 | Is e-invoicing currently mandatory for you (AATO threshold)? Which GSP/portal do you use today? | |
| F2 | Is Tally used? Which version, and who maintains it? What should sync (sales, receipts, ledgers)? | |
| F3 | Invoice/DC number formats and series per financial year? | |
| F4 | Payment methods (UPI, NEFT, cheque, cash) and the gateway preference (Razorpay, etc.)? | |
| F5 | Auditor's view on ITC-04 and job-work documentation responsibilities? | |
| F6 | DPDP readiness: who is responsible for data protection? Any existing privacy notice? | |

## Technology & AI
| # | Question | Answer |
|---|---|---|
| T1 | Hosting preference and budget (Lean vs. Scale, see [02](02-ARCHITECTURE.md) §6)? Any existing cloud account? | |
| T2 | Is sending business data to an AI provider outside India acceptable, with minimisation and contractual safeguards? Or should a regional cloud deployment be required? | |
| T3 | Monthly AI budget ceiling? | |
| T4 | WhatsApp: existing WhatsApp Business number(s)? Willing to move to the Cloud API (Meta) or a BSP? | |
| T5 | In-house team or external vendor to build? Who maintains it after launch? | |
| T6 | Domain/subdomain plan (e.g. `app.tiruppuremboss.com`, `portal.tiruppuremboss.com`)? | |
| T7 | Brand assets (logo, colours, fonts) available? | |

## Decision log
| Date | Decision | By | Doc updated |
|---|---|---|---|
| 2026-10-12 | Plan drafted with assumptions in README | — | All |
