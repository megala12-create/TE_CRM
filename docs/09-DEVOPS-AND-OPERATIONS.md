# 09 — DevOps & Operations (Production Readiness)

## 1. Environments

| Env | Purpose | Data |
|---|---|---|
| `local` | Developer machines (Docker Compose: Postgres, Redis, MinIO, Mailpit) | Seed + anonymised samples |
| `preview` | One per pull request (optional, if budget allows) | Seed |
| `staging` | Production-like. Migration rehearsals. UAT. | **Anonymised** copy of production |
| `production` | Live (India region) | Real |

## 2. CI/CD (GitHub Actions or equivalent)

On every PR: install (pnpm, cached) → lint + typecheck → unit tests → integration tests (Testcontainers Postgres/Redis) → build → bundle-size check → Lighthouse CI on key routes → SAST + dependency + secret scan → AI eval smoke set (if `packages/ai` changed) → preview deploy.

On merge to `main`: build signed images → deploy to staging → E2E (Playwright) → manual approval → production deploy (rolling / blue-green) → post-deploy smoke tests → automatic rollback on failed health checks.

**DB migrations:** forward-only, backward-compatible (expand → migrate → contract), run as a separate step before the app rollout.

## 3. Observability

| Signal | Tooling | Alerts |
|---|---|---|
| Errors | Sentry (web + api + worker) | New error type, error-rate spike |
| Traces/metrics | OpenTelemetry → Grafana (Tempo/Prometheus) or a hosted APM | p95 latency, saturation |
| Logs | Structured JSON (pino) → Loki or hosted | PII-redacted |
| Uptime | External probe (1-min interval) | Down > 2 min → phone/WhatsApp alert |
| Queues | BullMQ dashboard + metrics | Backlog age > 5 min, failed jobs |
| Integrations | Health checks per integration (GSP, WhatsApp, payments, Tally) | Consecutive failures |
| AI | Cost/day, error rate, refusal rate, approval-without-edit rate | Budget thresholds |
| Business | Invoices pending IRN, DCs without e-way bill, failed WhatsApp sends | Daily digest |

## 4. Reliability targets

- Availability ≥ 99.9 % (business hours). **RPO ≤ 5 min** (WAL archiving). **RTO ≤ 2 h**.
- Graceful degradation: if the GSP is down, invoices are queued and the user is informed. If the AI is down, manual flows continue. If WhatsApp is down, fall back to email/SMS.
- Idempotency keys on all external calls and webhooks.

## 5. Backups & disaster recovery

- Managed Postgres automated backups + PITR (30 days) + **weekly logical dump to a separate account/region**.
- Object storage versioning + lifecycle rules.
- **Monthly restore drill** into staging, with the result logged.
- DR runbook: provision from IaC → restore DB → repoint DNS. Rehearsed twice a year.

## 6. Runbooks (to write before go-live)

- Deploy & rollback · DB migration failure · GSP outage · WhatsApp template rejected · Payment webhook mismatch · Suspected account compromise · Data breach (DPDP) · AI misbehaviour / kill switch · Restore from backup · Cutover (see [01](01-CURRENT-STATE-AND-MIGRATION.md)).

## 7. Go-live readiness checklist

- [ ] All Must features accepted in UAT by each persona
- [ ] Migration reconciliation 100 % matched (two consecutive rehearsals)
- [ ] Pen-test done, no open critical/high findings
- [ ] Performance budgets met on staging with production-size data
- [ ] Backups + restore drill passed
- [ ] Monitoring + on-call rota active
- [ ] Runbooks written and reviewed
- [ ] Staff trained (Tamil + English guides, short videos)
- [ ] Customer communication for portal change sent
- [ ] Rollback plan rehearsed
