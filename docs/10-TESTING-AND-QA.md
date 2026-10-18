# 10 — Testing & QA

## 1. Test pyramid

| Layer | Tool | Scope | Target |
|---|---|---|---|
| Unit | Vitest | `packages/domain` rules (GST calc, piece balance, numbering, rate cards), mappers in `packages/migrator` | ≥ 90 % line coverage on `domain` |
| Integration | Vitest + Testcontainers (real Postgres/Redis) | API modules, RBAC/RLS, outbox, queues | Every endpoint covered for happy path + auth failure |
| Contract | OpenAPI schema tests, recorded fixtures for GSP/WhatsApp/Razorpay | External integrations | All adapters |
| E2E | Playwright | Top 10 business flows ([05](05-UI-UX-DESIGN-SYSTEM.md) §7) on desktop + mobile viewport | Run on staging for every release |
| Accessibility | axe-core in Playwright + manual pass | All main screens | No serious violations |
| Performance | Lighthouse CI, k6 | Budgets in [06](06-PERFORMANCE.md) | Fail the build on regression |
| Security | SAST, DAST (ZAP baseline), dependency scan, pen-test | Whole app | No high/critical issues |
| Migration | Reconciliation suite | Counts + financial totals per FY | 100 % match |

## 2. Access-control test matrix

An automatically generated test runs **every role × every endpoint × own/other record**. Any unexpected 200 fails the build. This includes portal users trying to reach other customers' data, and AI tools called under each role.

## 3. AI evaluation

Each agent in [04](04-AI-AGENTS.md) has its own eval set in `packages/ai/evals/<agent>/`:

| Agent | Eval data | Grading | Ship bar (initial) |
|---|---|---|---|
| A2 Lead intake | 150 real (anonymised) WhatsApp/email inquiries, Tamil + English + mixed | Field-level exact/fuzzy match vs. human labels | ≥ 95 % field accuracy on name/phone/qty |
| A3 PO extraction | 100 real POs (PDF/photo) | Line-level match | ≥ 97 % line accuracy, 0 wrong totals accepted |
| A4 Quote drafting | 50 past inquiries with the actual quote | Price within tolerance + rubric (LLM-judge + human spot check) | ≥ 85 % acceptable without major edit |
| A5 Collections | 40 accounts | Rubric: tone, correctness of amounts, language | 100 % amount correctness |
| A6 Support | 100 past tickets | Correct category, grounded answer with valid citation | ≥ 90 % |
| A9 Analytics | 80 owner questions with known answers | Exact numeric match | ≥ 95 % |
| Security | Prompt-injection suite (malicious inquiries, poisoned PDFs) | No unauthorised tool proposals | 100 % |

- Evals run in CI on any change to prompts/tools/models (smoke subset) and in full nightly.
- Production feedback (👎 + corrections) is reviewed weekly and added to the eval sets.
- Any model change (version or tier) requires a full eval run and a side-by-side comparison.

## 4. UAT

- A persona champion per area signs off scripted scenarios plus one week of real parallel use.
- Bugs are triaged as P1 (blocks work) / P2 (workaround exists) / P3 (cosmetic). Go-live requires zero P1s.
