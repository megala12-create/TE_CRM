# 03 — Modules & Features

Priority key (MoSCoW): **M** = Must (v1), **S** = Should (v1 if time allows, else v1.1), **C** = Could (later), **W** = Won't (now).
AI = an AI agent assists (see [04-AI-AGENTS.md](04-AI-AGENTS.md)).

## 1. Platform-wide features

| Feature | Pri | Notes |
|---|---|---|
| Global command palette (`Ctrl/⌘+K`) | M | Search any record, run any action, ask AI |
| Global search (fuzzy, typo-tolerant, Tamil + English) | M | Postgres FTS + trigram |
| Unified activity timeline on every record | M | Calls, WhatsApp, emails, notes, status changes, AI actions |
| Saved views, filters, column chooser, bulk actions | M | Per user + shared views |
| Inline edit + keyboard navigation in grids | M | |
| Custom fields (typed, validated, permissioned) | M | Replaces Perfex custom fields |
| Workflow automation builder ("When X, if Y, do Z") | S | No-code rules: assign, notify, create task, call webhook, run AI agent |
| Notifications centre (in-app, push, WhatsApp, email) + user preferences | M | |
| Tamil + English UI (others on demand) | M | i18n from day one |
| Dark mode | S | |
| Import/export (CSV/XLSX) with mapping + preview + undo | M | |
| Webhooks + public REST API with API keys | S | |
| Full audit log (who changed what, before/after) | M | Includes AI actions |
| Document templates (invoice, DC, quote) with a visual editor | S | |
| Approvals engine (multi-level, amount thresholds) | M | Quotes, discounts, credit notes, write-offs |

## 2. Sales & CRM

| Feature | Pri | Notes |
|---|---|---|
| Accounts (customers) with GSTIN validation + auto-fill from GST portal lookup | M | Multiple billing/shipping addresses, credit limit, payment terms |
| Contacts with WhatsApp opt-in status | M | DPDP consent tracking |
| Leads: capture from web form, WhatsApp, email, IndiaMART/TradeIndia, phone | M | AI: extract + qualify + dedupe |
| Lead scoring + next-best-action | S | AI |
| Pipeline (Kanban) with stages, probabilities, forecasts | M | |
| Quotes / estimates with rate cards, versions, discounts needing approval | M | AI: draft from inquiry |
| Quote acceptance online (portal, e-sign, WhatsApp link) | M | |
| Follow-up reminders + sequences | S | AI: drafts follow-ups |
| Customer 360 dashboard (orders, dues, quality, communication, sentiment) | M | AI: account summary |
| Contracts with renewal reminders | C | |

## 3. Print, transfer & job-work operations (domain core — see [13-BUSINESS-PROFILE.md](13-BUSINESS-PROFILE.md))

Supports both flows: **make-and-sell transfers** (own materials) and **job work** (customer's garments).

| Feature | Pri | Notes |
|---|---|---|
| **Process catalogue** (Sublimation, HD, single/multi-colour transfer, Silicon HD glossy/matte/puff, DTF, embossing, PU transfer, flock, metallic, rainbow, glow, reflective, glitter, sequin, 3D TPU, laser) with **configurable spec attributes** per process (colours, size, film/finish, fabric, placement) | M | Drives rate cards, job cards and the BOM |
| **Rate-card engine** (per piece by size band × colours × process × qty slab, plus setup/screen/die charges) | M | |
| **Job Order** (sales order) from accepted quote or customer PO | M | AI: extract from PO PDF/image |
| **Artwork / design management** with versions, annotations, customer approval in portal | M | AI: detect colour count, size, detail, and suggest the best process |
| **Strike-off / sample approval** (sample job → photo → customer approves in portal/WhatsApp) | M | Gate before bulk production |
| **Raw-material inventory + BOM per product** (films, inks, silicone, foils, TPU, adhesive, sequins) with purchase orders, reorder levels, issue to job | M | AI: reorder suggestions |
| **Inward DC / goods receipt** (customer's goods received for job work) | M | Count by style/colour/size. Photo evidence. QR label. |
| **Process routing** (configurable steps: e.g. embossing → QC → packing) | M | Per product/process template |
| **Production planning board** (machines × days, drag-and-drop) | M | Capacity view, die availability |
| **Job cards with QR** for shop floor (start/stop/output/rejects in 2 taps) | M | PWA, works offline and syncs later |
| **Tooling register** (screens, embossing dies, TPU moulds, laser and plotter files) with location, condition, usage count, owner | M | |
| **Quality control** (defect types, rejection, rework, photos) | M | |
| **Piece reconciliation** (inward = outward + rejected + pending) per job | M | Blocks job close if unbalanced |
| **Outward DC / dispatch** + e-way bill | M | |
| **ITC-04** job-work report data (goods sent/received) | M | Validate applicability with the auditor |
| Production costing per job (machine time, consumables, labour) | S | Margin per job/customer |

## 4. Billing & finance

| Feature | Pri | Notes |
|---|---|---|
| GST invoices (CGST/SGST/IGST auto by place of supply), HSN/SAC | M | |
| **E-invoice (IRN + signed QR)** via GSP | M | Mandatory if AATO above the threshold (confirm) |
| Invoice from DC (one or many DCs → one invoice) | M | |
| Credit / debit notes | M | |
| Payments: record, UPI/Razorpay payment links, auto-reconcile | M | |
| Receivables ageing + collections workflow | M | AI: collections agent |
| Expenses with receipt capture | S | AI: receipt OCR |
| **Tally Prime sync** (vouchers, ledgers) | M | Tally stays the accounting system of record |
| TDS handling on receipts | S | |
| Recurring invoices | C | |

## 5. Support & portal

| Feature | Pri | Notes |
|---|---|---|
| Tickets from portal, email, WhatsApp | M | AI: triage + suggested replies |
| Knowledge base (public + internal) | M | Migrated from Perfex. Also the source for AI answers. |
| **Customer portal (PWA)**: job status, artwork approvals, DCs, invoices, statements, pay online, tickets | M | |
| Portal AI assistant (order status, documents, FAQs) | S | Strictly scoped to that customer's data |
| Customer feedback / NPS after dispatch | C | |

## 6. Communication hub

| Feature | Pri | Notes |
|---|---|---|
| **WhatsApp Business (Cloud API)**: shared team inbox, templates, media, assignment | M | |
| Email (send/receive, tracking) | M | |
| SMS with DLT-registered templates | S | |
| Click-to-call + call logging (cloud telephony) | C | |
| Voice-note → summary → tasks (Tamil/English) | S | AI (speech-to-text service + Claude summary) |

## 7. Tasks, team & productivity

| Feature | Pri | Notes |
|---|---|---|
| Tasks with assignees, due dates, checklists, recurring tasks | M | |
| Calendar (tasks, follow-ups, dispatch dates) | M | Google Calendar sync = S |
| Internal comments with @mentions on any record | M | |
| Announcements | C | |
| Timesheets | C | Only if in use today |

## 8. Reporting & analytics

| Feature | Pri | Notes |
|---|---|---|
| Owner dashboard (today's inward/outward, WIP, sales, collections, overdue) | M | |
| Standard reports (sales, ageing, production output, rejection %, machine utilisation, customer profitability) | M | |
| Report builder + scheduled email/WhatsApp delivery | S | |
| **"Ask your data" — natural-language analytics** | S | AI, read-only, RBAC-scoped |
| Daily AI briefing to owner | S | AI |
| Anomaly alerts (sudden rejection spike, customer silent for N days, margin drop) | C | AI |

## 9. Administration

| Feature | Pri |
|---|---|
| Users, teams, roles, field- and record-level permissions | M |
| SSO (Google Workspace / Microsoft) for staff | C |
| Branding, number series, tax settings, financial year | M |
| Integration settings with health status | M |
| AI settings: agents on/off, monthly budget, approval rules | M |
| Data retention + export (DPDP) | M |
