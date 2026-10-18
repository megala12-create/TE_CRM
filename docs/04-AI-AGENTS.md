# 04 — AI Agents

## 1. Principles

1. **AI drafts, humans decide.** Anything that leaves the company (messages, quotes, invoices) or moves money needs a human click. Internal, reversible actions (tagging, summarising, triage) can run automatically and are logged.
2. **Same permissions as the user.** An agent acting for a user can only call tools that user's role allows, on records that user can see. Tools call the **same service layer** as the UI, never the DB directly.
3. **Customer content is data, not instructions.** WhatsApp messages, emails, PDFs and artwork are untrusted. They can never trigger outbound or financial actions on their own (prompt-injection defence).
4. **Every AI action is auditable.** We store the prompt version, model, tools called, inputs/outputs (PII-redacted where configured), cost, and who approved.
5. **Measured, not guessed.** Each agent has an eval set ([10](10-TESTING-AND-QA.md)) and a target metric before it ships.
6. **Graceful without AI.** If the AI provider is down or over budget, every workflow still works manually.

## 2. Model strategy (Anthropic Claude)

| Use | Model | Settings |
|---|---|---|
| Default for all agents | **Claude Opus 5.5** (`claude-opus-5-5`) | Adaptive thinking, effort tuned per agent (`low` for simple extraction/classification, `medium`/`high` for drafting and analytics) |
| Candidates for cheaper tiers (decided **only after eval measurement** and business sign-off) | Claude Sonnet 5.5 (`claude-sonnet-5-5`), Claude Haiku 5.5 (`claude-haiku-5-5`) | High-volume classification, dedupe, nightly batch jobs |

Pricing per million tokens (input / output) at the time of writing: Opus 5.5 $4 / $20, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50. **Re-check before budgeting.**

**API features we rely on**
- **Tool use with `strict: true`** schemas, so tool arguments always match our Zod-derived JSON schemas.
- **Structured outputs** (`output_config.format`) for extraction agents (PO → job order, receipt → expense).
- **Streaming** for all interactive agents (Copilot, drafting), so text appears as it is generated.
- **Prompt caching:** a stable system prompt + tool list come first, and volatile data goes after the cache breakpoint. Monitor `cache_read_input_tokens`.
- **Message Batches API** (≈50 % cheaper, async) for nightly jobs: data hygiene, lead re-scoring, daily briefings.
- **Citations** on knowledge-base answers, so users can see the source article.
- **Refusal handling:** always check `stop_reason`, use server-side fallbacks where supported, and fall back to the manual path.
- **Vision / PDF input** for POs, artwork, receipts, handwritten job slips.
- Speech-to-text for voice notes uses a **separate STT service** (Claude takes the transcript). Vendor chosen in Phase 0 based on Tamil accuracy.

**Implementation:** `packages/ai` uses the official `@anthropic-ai/sdk` (TypeScript) Tool Runner for agent loops inside our API/worker. Agents are defined as code: system prompt + tool list + output schema + eval set, all versioned. Managed Agents (Anthropic-hosted) is a later option for long-running scheduled research tasks that don't need our DB.

## 3. Agent catalogue

| # | Agent | Trigger | What it does | Tools (examples) | Autonomy | Wave |
|---|---|---|---|---|---|---|
| A1 | **CRM Copilot** (`Ctrl+K` → Ask) | User asks in natural language | Answers questions and performs actions across the CRM ("show unpaid invoices for Ramesh Knits over 60 days", "create a follow-up task for tomorrow") | `search_records`, `get_record`, `list_*`, `create_task`, `draft_message`, `run_report` | Reads auto. Writes are shown as a confirm card. | 1 |
| A2 | **Lead Intake & Qualification** | New WhatsApp/email/IndiaMART/web inquiry | Extracts company, contact, product, qty, process, deadline. Dedupes against existing accounts. Scores. Drafts a first reply in the customer's language. | `find_account`, `create_lead_draft`, `get_rate_card`, `draft_message` | Lead created automatically and flagged "AI". Reply needs approval. | 1 |
| A3 | **PO / Document Extraction** | PDF/image PO uploaded or received | Converts a PO into a job order draft (styles, sizes, quantities, rates, delivery date) and highlights mismatches vs. the quote | Structured output → `create_job_order_draft`, `get_quote` | Draft only | 1 |
| A4 | **Quote Drafting** | From lead/inquiry, or user request | Builds a quote from rate cards, past quotes to this customer, and the margin floor. Explains its pricing. | `get_rate_card`, `get_customer_history`, `create_quote_draft` | Draft + approval rules (discount thresholds) | 1 |
| A5 | **Collections** | Daily schedule | Ranks overdue accounts by risk, drafts polite personalised reminders (Tamil/English) with a payment link, and suggests escalation | `get_ageing`, `get_payment_history`, `create_payment_link`, `draft_message` | Owner/accounts approves the batch with one click | 1 |
| A6 | **Support Triage & Reply** | New ticket / WhatsApp message on an existing job | Classifies, sets priority, links to the job, drafts an answer grounded in KB + job status (with citations) | `get_job_status`, `search_kb`, `update_ticket_meta`, `draft_reply` | Triage auto. Reply needs approval. | 1 |
| A7 | **Artwork Checker** | Artwork uploaded | Reads image/PDF, extracts dimensions/colours/placement, compares with the job spec, flags risks (low resolution, missing size) | Vision + `get_job_spec`, `add_artwork_note` | Notes only | 2 |
| A8 | **Daily Owner Briefing** | 7:30 am (Batch) | Yesterday's inward/outward, WIP bottlenecks, cash in/out, at-risk deliveries, top 3 actions. Sent via WhatsApp/email. | Read-only report tools | Auto (read-only) | 2 |
| A9 | **Ask-Your-Data Analytics** | User question | Turns a question into a query over a **curated semantic layer** (approved views/metrics, never raw tables), returns chart + explanation | `query_metric`, `describe_metrics` | Read-only | 2 |
| A10 | **Data Hygiene** | Nightly (Batch) + on migration | Duplicate accounts/contacts, invalid GSTIN/phone, missing HSN, proposes merges | `find_duplicates`, `propose_merge` | Proposals; a human merges | 1 (migration) |
| A11 | **Voice Note → Actions** | Voice note in WhatsApp/app | Transcript (STT) → summary → tasks/follow-ups/notes on the right record | `find_account`, `create_task_draft`, `add_note` | Notes auto. Tasks need confirm. | 2 |
| A12 | **Portal Assistant** | Customer chats in portal | Order status, document copies, FAQs. Hands off to a human. | Customer-scoped read tools only | Read-only, strictly tenant- and customer-scoped | 3 |
| A13 | **Production Planner Assistant** | Planner request | Suggests a machine/die schedule given due dates, capacity and changeovers, and explains trade-offs | `get_capacity`, `get_open_jobs`, `propose_schedule` | Proposal only | 3 |
| A14 | **Expense Receipt Reader** | Receipt photo | Extracts vendor, GSTIN, amount, tax, category | Structured output | Draft | 2 |

## 4. Guardrails (implementation checklist)

- [ ] **Tool permission matrix:** each tool declares `requiredPermission` and `sideEffect: none | internal | external | financial`. The orchestrator filters tools by the user's role before the call.
- [ ] **Approval gate:** tools with `external`/`financial` side effects return a *proposal object* and never execute directly. Execution happens only through the normal UI endpoint after a human approves.
- [ ] **Untrusted content wrapping:** customer-supplied text is passed in clearly delimited data blocks, and the system prompt states that it must never be followed as instructions.
- [ ] **Output validation:** every tool input is validated against its Zod schema server-side (even with `strict: true`). Every structured output is parsed and validated.
- [ ] **Row-level safety:** Postgres RLS on `tenant_id` + service-layer scoping. The portal assistant uses a separate DB role limited to that customer's rows.
- [ ] **PII minimisation:** send only the fields the task needs. Redact bank details and IDs unless required.
- [ ] **Budgets:** per-agent and per-user daily token budgets. Org monthly cap with alerts at 50/80/100 %. When the cap is hit, the agent turns off and the manual workflow remains.
- [ ] **Rate limits + timeouts + retries** using the SDK's typed errors (429/5xx retry with backoff, 4xx no retry).
- [ ] **Kill switch** per agent in Admin → AI settings.
- [ ] **Feedback loop:** 👍/👎 + "what was wrong" on every AI output, feeding the eval sets.
- [ ] **Audit record** (`ai_runs` table): agent, prompt version, model, tokens in/out/cached, cost, latency, tools called, outcome, approver.

## 5. Data flow & privacy

- Only the minimum necessary data is sent to the AI provider. Review Anthropic's data retention/ZDR options and the commercial terms during Phase 0.
- Customers are told in the privacy notice that AI assists with processing (DPDP transparency).
- AI features can be disabled per customer account (for customers who object).
- Data residency: confirm whether processing outside India is acceptable, or whether a cloud-provider deployment of Claude in a nearer region is preferred ([12](12-OPEN-QUESTIONS.md)).

## 6. Rollout per agent

`Shadow mode (AI runs, output hidden; compare to human)` → `Assist mode (visible draft, human approves)` → `Auto mode (only for internal, reversible actions, after ≥ 95 % approval-without-edit over 4 weeks)`.

## 7. Cost model (to fill in Phase 0)

| Agent | Est. runs/day | Avg tokens in/out | Model | Est. ₹/month |
|---|---|---|---|---|
| A2 Lead intake | ? | ? | Opus 5.5 | ? |
| A5 Collections (Batch) | ? | ? | Opus 5.5 | ? |
| … | | | | |

Fill this table from real volumes (Perfex data + WhatsApp counts). Then decide model tiering per agent based on eval results.
