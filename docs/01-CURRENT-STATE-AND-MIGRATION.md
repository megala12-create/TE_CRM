# 01 — Current State & Migration Plan

## 1. Current system (to be confirmed in Phase 0)

| Item | Assumed | Confirm |
|---|---|---|
| Platform | Perfex CRM (CodeIgniter 3, PHP 8.x, MySQL/MariaDB) | Exact Perfex version, PHP version |
| Hosting | Shared hosting or VPS with cPanel | Provider, server specs, backup routine |
| URL | `www.tiruppuremboss.com` (login page + Knowledge Base link + about 28 languages enabled) | Which languages are actually used |
| Customisations | Custom modules and/or core edits | Full list, source code access |
| Third-party modules | Possibly purchased Perfex add-ons (WhatsApp, GST, etc.) | List and licences |
| Integrations | Email (SMTP), maybe payment gateway | All endpoints, credentials owner |

### Phase 0 audit checklist
- [ ] Get a **full DB dump** and the **complete `application/` + `modules/` + `uploads/` folders**.
- [ ] Diff the codebase against the stock Perfex of the same version to isolate customisations.
- [ ] List all custom fields (`tblcustomfields`) and the entities they attach to.
- [ ] List the active modules, roles, permissions, staff, and email templates.
- [ ] Record volumes per table (clients, invoices, items, files, activity log).
- [ ] Interview each persona (see [00](00-VISION-AND-SCOPE.md) §3): screen-record their real daily flow.
- [ ] Take baseline metrics: quote turnaround, DSO, page load times.
- [ ] Capture invoice/estimate number series and formats (GST requires continuity within a financial year).

## 2. Perfex → TE-CRM module mapping

| Perfex module | Perfex tables (default `tbl` prefix) | TE-CRM module | Notes |
|---|---|---|---|
| Customers / Contacts | `tblclients`, `tblcontacts`, `tblcustomer_groups` | `accounts`, `contacts` | Add GSTIN validation, multiple addresses, credit limits |
| Leads | `tblleads`, `tblleads_status`, `tblleads_sources` | `leads` | Add AI intake + scoring, WhatsApp/IndiaMART sources |
| Estimates / Proposals | `tblestimates`, `tblproposals`, `tblitemable` | `quotes` | Rate cards, versions, e-sign, AI drafting |
| Invoices / Payments / Credit notes | `tblinvoices`, `tblinvoicepaymentrecords`, `tblcreditnotes`, `tblitemable`, `tblitems` | `billing` | E-invoice IRN, UPI links, Tally sync |
| Expenses | `tblexpenses`, `tblexpenses_categories` | `expenses` | Receipt OCR via AI |
| Contracts | `tblcontracts` | `contracts` | E-sign, renewal reminders |
| Projects / Tasks / Timesheets | `tblprojects`, `tbltasks`, `tbltaskstimers` | `tasks` (+ `production` for job work) | Job orders replace "projects" for production work |
| Support tickets | `tbltickets`, `tblticket_replies` | `support` | AI triage, WhatsApp channel |
| Knowledge base | `tblknowledge_base`, `tblknowledge_base_groups` | `knowledge` | Also feeds the AI's RAG index |
| Staff / Roles | `tblstaff`, `tblroles`, `tblstaff_permissions` | `iam` | Redesigned RBAC + record-level rules |
| Custom fields | `tblcustomfields`, `tblcustomfieldsvalues` | Promoted to real columns where common, JSONB otherwise | |
| Files | `tblfiles` + `uploads/` | `files` (object storage) | Checksums, virus scan on import |
| Notes / Activity | `tblnotes`, `tblactivity_log` | `timeline` | Unified activity timeline |
| Email templates | `tblemailtemplates` | `notifications` | Multi-channel templates |
| Custom modules | (unknown) | Mapped after audit | |

## 3. Migration strategy: strangler with parallel run

```
Phase A  Build      New CRM built against a nightly copy of migrated data (staging only)
Phase B  Pilot      Selected users work in new CRM; one-way Perfex→TE-CRM delta sync every 15 min
Phase C  Cutover    Weekend freeze → final delta → verification → DNS/route switch
Phase D  Fallback   Perfex kept READ-ONLY for 90 days at an internal URL, then archived
```

### Migration tooling
- A standalone **ETL package** (`packages/migrator`) written in TypeScript:
  - **Extract:** reads MySQL directly (read-only user).
  - **Transform:** pure, unit-tested mapping functions per entity. Phone numbers become E.164, GSTINs are checksum-validated, and HTML notes are sanitised.
  - **Load:** idempotent upserts keyed on `legacy_source='perfex'` + `legacy_id`, so the migration can be re-run any number of times.
  - Files are copied to object storage with a SHA-256 checksum.
- **Reconciliation report** after every run: row counts per entity, sums of invoice totals and payments per financial year, and outstanding balance per customer. **Cutover is blocked unless every total matches to the paisa.**
- **Invoice numbering:** migrated documents keep their original numbers. New series continue from the last number in each series (GST rule: unique and sequential within a financial year).

### Cutover runbook (outline; full version written in Phase 4)
1. Announce freeze (Friday 6 pm).
2. Put Perfex in maintenance mode, take a final dump and back it up off-site.
3. Run the final delta migration, then the reconciliation report.
4. Smoke-test with owner and accounts (scripted checklist).
5. Switch DNS / reverse proxy. Issue new logins and enforce 2FA enrolment.
6. Hypercare: the dev team is on call for 2 weeks, with daily stand-up with users.
7. **Rollback trigger:** any reconciliation mismatch or blocking defect within 48 h → revert DNS to Perfex (data entered in the new CRM in the meantime is exported and replayed).

## 4. Risks

| Risk | Mitigation |
|---|---|
| Unknown customisations hide business rules | Code diff + persona interviews in Phase 0. Write rules down as tests. |
| Dirty legacy data (duplicates, bad GSTINs) | AI data-hygiene agent proposes merges and a human approves them ([04](04-AI-AGENTS.md)) |
| Staff resistance | Involve power users from Phase 0, pilot group, Tamil UI, short video guides |
| Customer portal links/emails break | Redirect old portal URLs, email customers in advance |
| Licence constraints on Perfex add-ons | We migrate **data**, not their code. Rebuild the functionality ourselves. |
