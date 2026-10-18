# 14 — Detailed Plan: Leads → Quotations → Sample Orders → Production Orders

**Goal:** one connected flow from the first inquiry to the finished, dispatched and invoiced order, with no re-typing between steps.

```
 Inquiry (website / WhatsApp / IndiaMART / phone)
      │  AI extracts details, checks duplicates
      ▼
 LEAD ──follow-ups──► QUALIFIED ──► QUOTATION (rate card, versions, PDF/WhatsApp link)
                                         │ customer accepts online
                        ┌────────────────┴────────────────┐
                        ▼                                 ▼
                 SAMPLE ORDER (strike-off)          (repeat design — skip sample)
                        │ customer approves sample        │
                        ▼                                 ▼
                 PRODUCTION ORDER ──► job cards per step ──► QC ──► packing ──► dispatch (DC)
                                                                                  │
                                                                                  ▼
                                                                    INVOICE (already built)
```

Every step keeps a link to the one before it. From an invoice you can trace back to the production order, sample, quotation and original inquiry.

---

## 0. Shared foundations (built first, used by all four modules)

| # | Item | Why |
|---|---|---|
| F1 | **Document number series** for `LD` (lead), `QT` (quotation), `ES` (estimate), `SO` (sample order), `PRD` (production order), restarting every financial year (e.g. `QT/2026-27/0001`). Prefixes editable in Setup. | Same engine as invoices (`nextNumber`) |
| F2 | **Activity timeline** table for leads, quotations, samples and production orders: calls, WhatsApp, notes, status changes, files, AI actions | One history per record |
| F3 | **Attachments** (reuses the expense receipt storage): artwork, photos, PDFs with versions | Artwork and sample photos are central |
| F4 | **Reminders / follow-ups** with "Due today" on the dashboard and a bell icon | Nothing slips |
| F5 | **Status configuration** in Setup: rename, reorder and colour statuses per module, and mark which are "won"/"lost"/"closed" | Admin flexibility, like custom fields |
| F6 | **Custom fields** extended to `leads`, `quotations`, `sample_orders`, `production_orders` | The admin-defined fields requirement |
| F7 | **Public share links** (signed, expiring tokens) for quotation acceptance and sample approval | Customers act from a WhatsApp link, no login |
| F8 | **Rate card engine** (see §2.2) | Consistent pricing for all quotes |

---

## 1. Leads

### 1.1 What users can do
- **Capture** leads from:
  1. **Website contact form** (`tiruppurembossing.com` already has a "Share your thoughts" form with a service dropdown). A public endpoint `POST /api/public/leads` with honeypot, rate limit and allowed-origin check. Lead source = Website, and the service is pre-tagged.
  2. **Manual entry** (phone call, walk-in, exhibition, referral).
  3. **CSV import** with column mapping and duplicate preview.
  4. **WhatsApp** (when WhatsBot is built): a new chat creates a lead automatically.
  5. **IndiaMART / TradeIndia** pull API (later, optional).
- **Duplicate check** on phone, WhatsApp, email and GSTIN. If a match exists, the user sees "This looks like *Sri Murugan Knits* (customer #12)" and can link instead of creating a new lead.
- **List view** with filters (status, source, assigned to, process interest, date), saved views, columns chooser, bulk assign and bulk status change.
- **Kanban view** by status with drag-and-drop. Each card shows value, next follow-up and age.
- **Lead page:** details, activity timeline, follow-ups, files, related quotations.
- **Log activity** in one click: Called, WhatsApp sent, Visited, Note. Each can set the next follow-up date.
- **Convert to customer:** creates the customer and contact (keeps all history) and optionally starts a quotation.
- **Mark lost** with a required reason (Price, Quality, Delivery time, No response, Chose competitor, Other).

### 1.2 Data
`leads`: number, name, company, phone, whatsapp, email, city, stateCode, gstin, source, status, assignedTo, processesInterested[] (from Items), estQty, estValue, expectedCloseDate, tags[], lostReason, customerId (when converted), convertedAt, custom jsonb, createdBy, timestamps.
`lead_sources`, `lead_statuses` (admin-editable), `activities` (shared, F2), `reminders` (shared, F4).

### 1.3 Permissions (already in the role editor)
`leads.view / view_own / create / edit / delete`. "Own" means assigned to me or created by me. Add `leads.import` and `leads.assign`.

### 1.4 Reports
Leads by source and status, conversion rate per source and per salesperson, average days to convert, lost reasons, and follow-ups overdue.

### 1.5 AI (optional in this release)
**A2 Lead intake** ([04-AI-AGENTS.md](04-AI-AGENTS.md)): paste a WhatsApp message or email. AI fills name, company, phone, process, quantity and deadline, flags duplicates, and drafts a reply. A human reviews before saving.

### 1.6 Done when
- [ ] Website form submission appears as a lead within 5 seconds, tagged with the service.
- [ ] Duplicate phone or GSTIN is detected on create and on import.
- [ ] Converting a lead creates a customer + contact and carries over notes, files and activities.
- [ ] Sales users with "view own" see only their leads (covered by automated RBAC tests).
- [ ] Follow-ups due today appear on the dashboard and in the bell.

---

## 2. Quotations (and Estimates)

> **To confirm with you:** the Sales menu has both **Quotations** and **Estimates**. This plan assumes:
> - **Quotation** = the price offer sent to a lead or customer for a design/process. It can carry quantity slabs, and there may be no customer record yet.
> - **Estimate** = the formal GST estimate for a confirmed customer that converts 1:1 into an invoice (Perfex-style).
>
> If you use them differently, tell us and we'll adjust.

### 2.1 Quotation features
- **Create from** a lead, a customer, or blank. **Duplicate** an old quotation for repeat designs.
- **Lines per design/process**, each with:
  - item/process (DTF, Silicon HD, Embossing…), artwork thumbnail, print size (W × H cm), placement, number of colours, fabric type/colour, finish
  - **quantity slabs** (e.g. 500 / 1,000 / 5,000 pcs, each with its own rate)
  - setup/screen/die charges (one-time) and HSN/SAC + GST
- **Rate suggestion** from the rate card (§2.2), shown next to the rate the user types. Going below the **minimum margin / floor price** needs approval.
- **Approval workflow:** a discount above X% or a price below floor sends it to a Manager, who approves or rejects with a comment. The quotation can't be sent until approved.
- **Versions:** editing a sent quotation creates Rev 2, Rev 3… Previous versions stay read-only.
- **Validity date.** It auto-expires and the status becomes Expired.
- **Send:**
  - PDF download/print (brand template with logo and artwork thumbnails)
  - email
  - **WhatsApp share link** that opens a mobile-friendly public page
- **Customer online acceptance:** the public page has Accept / Request changes buttons, captures name + timestamp + IP, and records "Viewed" when opened.
- **Statuses:** Draft → Pending approval → Sent → Viewed → Accepted / Declined / Expired → Converted.
- **Convert to:**
  - Sample Order (new design)
  - Production Order (repeat design, sample skipped)
  - Estimate / Invoice (direct sale)
- **Lead linkage:** sending a quote moves the lead to "Quoted", and acceptance moves it to "Won" and offers to convert it to a customer.

### 2.2 Rate card engine (new: Sales → Items gets a "Rate card" tab)
- Per process: **size bands** (e.g. up to A6, A5, A4, A3), **colour count**, **quantity slabs**, giving the rate per piece. Plus setup charge rules.
- **Customer-specific price lists** override the standard card (e.g. exporters get rate list B).
- Admin-editable grid, with CSV import/export. Every change is in the audit log.

### 2.3 Estimates (Perfex-style)
Same editor as invoices: customer, lines, GST, terms. Statuses Draft → Sent → Accepted/Declined/Expired. One-click **Convert to invoice**, which copies lines, custom fields and links both ways.

### 2.4 Data
`quotations` (number, revision, parentId, leadId | customerId, status, validUntil, totals, approval fields, acceptedBy/at/ip, shareToken hash, custom), `quotation_lines` (process item, artworkFileId, widthCm, heightCm, colours, placement, fabric, finish, hsnSac, taxRate, setupCharge), `quotation_line_slabs` (qty, rate), `rate_cards`, `rate_card_rules`, `price_lists`, `estimates` + `estimate_lines` (mirror of invoices).

### 2.5 Permissions
New module **`quotations`**: view / view_own / create / edit / delete / **approve**. Estimates keep `estimates.*`.

### 2.6 Reports
Quotes sent, win rate (by person, process, customer), average turnaround (inquiry → quote), value pipeline, expiring this week, and average discount.

### 2.7 AI (optional)
**A4 Quote drafting:** a draft quotation from the lead details + rate card + this customer's history, with a short explanation of the price. **A7 Artwork checker:** upload artwork and AI estimates colour count and size, flags low resolution, and suggests the best process (DTF vs screen vs Silicon HD).

### 2.8 Done when
- [ ] A quotation with 3 qty slabs and a setup charge prints correctly and totals match the GST engine tests.
- [ ] A price below floor cannot be sent without Manager approval (tested per role).
- [ ] The customer opens the WhatsApp link on a phone, sees the quote, accepts it, and status + lead update instantly.
- [ ] An accepted quotation converts into a Sample or Production Order with all lines and artwork carried over.

---

## 3. Sample Orders (strike-offs)

### 3.1 Features
- **Create from** an accepted quotation, a customer, or a lead.
- **Specs per sample:** process, artwork version, size, placement, number of colours with **Pantone/colour references**, fabric type and colour, finish, sample quantity, required-by date, special instructions.
- **Stages (configurable):** Requested → Artwork preparation → Screen/Die/Film ready → Sampling → Internal QC → Sent to customer → **Approved** / **Rework** / Rejected.
- **Assign** a person and a machine for each stage. A "My samples today" view for the production team.
- **Photos:** upload photos of the sample at QC and before sending.
- **Customer approval** via WhatsApp/portal link with photos. The customer can Approve or Request changes (comments + markup). Rework creates **Round 2** with history kept.
- **Golden sample:** the approved sample is locked as the reference (photo, specs, colour references) for production.
- **Sample charges:** optional billable amount that can go on the next invoice.
- **Convert to Production Order:** one click, copying specs and the golden-sample reference.

### 3.2 Data
`sample_orders` (number, customerId/leadId, quotationId, status, round, dueDate, assignedTo, machine, charges, billable, approvedAt/by, custom), `sample_order_specs`, `sample_rounds` (photos, customer feedback), shared `activities` and attachments.

### 3.3 Permissions
`sample_orders.view / create / edit / delete` (exist) + **`sample_orders.approve_internal`** for the QC sign-off.

### 3.4 Reports
Samples per week, average turnaround (request → approval), first-time approval rate, rework reasons, and sample-to-order conversion rate.

### 3.5 Done when
- [ ] A sample moves through all stages on a phone screen (big buttons, photo capture).
- [ ] The customer approves from a WhatsApp link, and the approval is timestamped with photos attached.
- [ ] Rework keeps every round's photos and comments.
- [ ] The approved sample converts to a Production Order with specs and reference.

---

## 4. Production Orders

### 4.1 Features
- **Create from** an approved sample, an accepted quotation (repeat design), or directly. Optional: upload the customer's PO PDF; AI agent **A3** can extract the lines.
- **Order type:**
  - **Job work:** the customer sends garments/panels, so **Inward DC** quantities are recorded first.
  - **Make & sell:** our own materials, producing transfers/labels.
- **Lines:** style / colour / size-wise quantities (size matrix input: S, M, L, XL…), process, design, golden-sample reference, rate, due date.
- **Routing:** steps generated from the process template (editable per order), e.g. Artwork/film → Screen or die prep → Printing / Embossing / Heat press → Curing → QC → Packing → Dispatch.
- **Job cards with QR** per step: printable and shown on the tablet. Scan to **Start / Pause / Complete**, then enter output qty and rejected qty with reason and photo.
- **Shop-floor mode (PWA):** large buttons, works on a phone/tablet, and keeps working through brief network drops by syncing later.
- **Planning board:** machines × days, drag job steps onto machines, with capacity and conflict warnings (two jobs on one machine, die not available).
- **Piece reconciliation:** inward = processed + rejected + returned + WIP. The order can't be closed until it balances.
- **Materials (basic):** record films/inks issued per order (full Inventory module later), giving cost per order.
- **Dispatch:** partial dispatches allowed. Each creates an **Outward DC** (printable, with e-way bill fields), and **Create invoice from DC** feeds the existing invoice module.
- **Order Roadmap** (menu item): timeline of every open order by stage, delayed orders in red, filter by customer or due date.
- **Alerts:** a step running late, a rejection rate above threshold, or a due date at risk go to the supervisor and the owner.

### 4.2 Data
`production_orders` (number, type, customerId, quotationId, sampleOrderId, customerPoNumber, status, dueDate, priority, custom), `production_order_lines` (style, colour, size, qty, process, rate), `routing_steps` (sequence, process, machineId, plannedStart/End, status), `job_card_events` (step, user, action, qtyOk, qtyRejected, reason, photo, at), `machines`, `inward_dcs` + lines, `outward_dcs` + lines, `material_issues`.

### 4.3 Permissions
`production_orders.view / create / edit / delete` (exist) + **`production_orders.shopfloor`** (operators can only log job-card events) + **`production_orders.plan`** (planning board) + **`production_orders.dispatch`**.

### 4.4 Reports
WIP by stage, throughput per machine per day, rejection % by process/machine/reason, on-time delivery %, cycle time (order → dispatch), and order profitability (rate − materials − machine time).

### 4.5 Done when
- [ ] An operator with only `production_orders.shopfloor` can scan a QR, start and complete a step, and log output and rejects, but cannot see prices.
- [ ] The planning board blocks double-booking a machine.
- [ ] Reconciliation prevents closing an order with unaccounted pieces.
- [ ] A partial dispatch creates an Outward DC, then an invoice with the correct quantities.
- [ ] Order Roadmap shows every open order with its current stage.

---

## 5. Delivery schedule (indicative)

Two-week sprints, team of 2–3 developers + part-time designer/QA. Each sprint ends with a demo and goes live behind a role permission.

| Sprint | Weeks | Scope | Live for users |
|---|---|---|---|
| S1 | 1–2 | Foundations F1–F6 + **Leads** core (list, kanban, activities, follow-ups, duplicate check, convert) | Sales team |
| S2 | 3–4 | Leads: website form endpoint, CSV import, reports. **Rate card engine** | Sales + website inquiries |
| S3 | 5–6 | **Quotations**: editor, slabs, versions, approvals, PDF | Sales + Manager approvals |
| S4 | 7–8 | Quotations: WhatsApp share link + online accept (F7), conversions. **Estimates** + convert to invoice | Customers accept online |
| S5 | 9–10 | **Sample Orders**: stages, photos, customer approval link, rework rounds, convert | Production + customers |
| S6 | 11–12 | **Production Orders**: lines/size matrix, routing, job cards + QR, shop-floor PWA | Production floor |
| S7 | 13–14 | Planning board, inward/outward DC, piece reconciliation, dispatch → invoice, Order Roadmap | Full flow |
| S8 | 15–16 | Reports, alerts, AI agents A2/A4 (optional), hardening, UAT, data import from Perfex leads/estimates | Go-live of the whole flow |

**Total: about 16 weeks (4 months)** for the complete flow. Leads can go live after week 2–4 and Quotations after week 8, so value arrives early.

## 6. Quality gates for every sprint
- Type check, unit tests (pricing, numbering, reconciliation rules), production build, and automated page + permission smoke tests (as used for Release 1).
- New screens follow the existing design and support custom fields and the column chooser where they have lists.
- Every create/update/delete/approve/convert action is audit-logged.
- A UAT checklist is signed off by the persona champion (Vignesh for sales, Navaneethan for production, Meghala for accounts).

## 7. Questions to answer before Sprint 1
1. How do you use **Quotations vs Estimates** today? (See §2.)
2. Your **price structure** per process: size bands, colour count, quantity slabs, setup/screen/die charges. Even a rough Excel sheet helps.
3. **Lead statuses and sources** you want (we can start from Perfex's list).
4. The **steps** each process goes through on the floor, and the **machines** list (rotary, laser, embossing press, plotter, DTF printer, heat presses…).
5. Do operators have phones or tablets on the floor? Is Wi-Fi reliable there?
6. Do you need **size-wise** (S/M/L/XL) quantities on orders, or only total pieces?
7. Is the website form editable by us, so we can point it at the CRM?
