# 08 — Data Model

## 1. Conventions

- PostgreSQL, `snake_case`, plural table names.
- Primary keys: **UUIDv7** (sortable by time, safe to expose).
- Every business table has: `id`, `tenant_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at` (soft delete; financial docs are never deleted, only cancelled), `version` (optimistic locking).
- Migrated rows carry `legacy_source` + `legacy_id` (unique together).
- Money is stored as `numeric(14,2)` with a currency code. Never floats. Quantities are `numeric(14,3)`.
- Enums are Postgres enums or lookup tables (lookup tables when users must be able to edit them).
- Custom fields go in a `custom jsonb` column, validated against `custom_field_definitions`. Fields that are used often get promoted to real columns.
- RLS policy on `tenant_id` for every business table.

## 2. Core entities (v1)

```
tenants ─┬─ users ── user_roles ── roles ── role_permissions
         │
         ├─ accounts (customers/vendors) ─┬─ contacts
         │      │                          ├─ addresses (GSTIN per address)
         │      │                          └─ consents (whatsapp/email/sms, DPDP)
         │      │
         │      ├─ leads ── lead_activities
         │      ├─ quotes ── quote_lines (→ rate_card_items)
         │      ├─ job_orders ─┬─ job_order_lines (style, colour, size, qty, process, rate)
         │      │              ├─ artworks ── artwork_versions ── artwork_approvals
         │      │              ├─ inward_dcs ── inward_dc_lines
         │      │              ├─ job_cards (per step) ── job_card_events (start/stop/output/reject)
         │      │              ├─ qc_inspections ── qc_defects
         │      │              ├─ outward_dcs ── outward_dc_lines ── eway_bills
         │      │              └─ piece_ledger (every movement: in, processed, rejected, out)
         │      ├─ invoices ── invoice_lines ── e_invoices (IRN, ack, QR)
         │      ├─ credit_notes / debit_notes
         │      ├─ payments ── payment_allocations (→ invoices)
         │      └─ tickets ── ticket_messages
         │
         ├─ machines · tooling (screens, dies, TPU moulds, laser/plotter files)
         ├─ processes ── process_attributes (spec schema per process) · process_routes ── process_steps
         ├─ products (transfer/label designs) ── boms ── bom_lines (→ items)
         ├─ items (raw materials: films, inks, silicone, foils, TPU…) ── stock_movements · purchase_orders
         ├─ samples (strike-offs) ── sample_approvals
         ├─ rate_cards ── rate_card_items
         ├─ tasks · calendar_events · notes · attachments(files)
         ├─ conversations (whatsapp/email/sms) ── messages
         ├─ timeline_events (polymorphic: subject_type, subject_id)
         ├─ kb_articles ── kb_chunks (pgvector embeddings for AI retrieval)
         ├─ automations ── automation_runs
         ├─ outbox_events (transactional outbox)
         ├─ audit_log (append-only, hash-chained)
         └─ ai_runs ── ai_tool_calls ── ai_feedback
```

## 3. Key invariants (enforced in `packages/domain` + DB constraints)

1. **Piece balance:** for each job order line, `Σ inward = Σ outward + Σ rejected_returned + Σ scrap_approved + WIP`. A job cannot close while WIP ≠ 0.
2. **Invoice numbering:** unique per (tenant, series, financial year). Gap-free. Assigned at *issue* time, not at draft.
3. **Issued financial documents are immutable.** Corrections are made via credit/debit notes or cancellation (IRN cancel window).
4. **Payment allocations** never exceed the invoice balance or the payment amount.
5. **GSTIN:** format + checksum validated. State code drives the IGST vs CGST/SGST split.
6. **Outward DC** quantities cannot exceed available processed quantity per line.

## 4. Search & AI data

- `search_vector tsvector` columns (generated) on accounts, contacts, leads, job orders, invoices, tickets, plus `pg_trgm` indexes on names/phones/GSTIN.
- `kb_chunks.embedding vector(…)` for knowledge-base retrieval. The embedding provider is chosen in Phase 0.
- Analytics semantic layer: SQL **views** (`v_sales_daily`, `v_receivables_ageing`, `v_production_output`, `v_rejection_rate` …) are the only objects the analytics agent may query, through a read-only DB role.

## 5. Next step

Produce the full ERD and Drizzle schema in Phase 1, after the Phase 0 audit confirms the real fields and custom fields in Perfex.
