# 06 — Performance

## 1. Budgets (enforced in CI where possible)

| Metric | Target | Measured on |
|---|---|---|
| Largest Contentful Paint (LCP) | < 1.5 s desktop · < 2.5 s mobile | Mid-range Android, throttled 4G |
| Interaction to Next Paint (INP) | < 200 ms (p75) | Real-user monitoring |
| Cumulative Layout Shift | < 0.05 | |
| JS shipped per route (gzipped) | ≤ 170 KB initial | Bundle analyser in CI |
| API latency | p95 < 200 ms reads · < 400 ms writes | APM |
| Search-as-you-type | < 100 ms server time | |
| List of 10,000 rows | Smooth scroll at 60 fps | Virtualised grid |
| PDF generation (invoice) | < 2 s, async with notification | Worker |
| AI first token (Copilot) | < 2 s | Streaming |

## 2. Frontend techniques
- React Server Components + streaming SSR: data is fetched server-side, close to the DB.
- Route-level code splitting. Heavy widgets (charts, planning board, editor) are lazy-loaded.
- TanStack Query cache with stale-while-revalidate, prefetch on hover, optimistic mutations.
- Virtualised tables and lists. Debounced search.
- Images through an optimiser (AVIF/WebP, responsive sizes). Thumbnails for artwork.
- Self-hosted, subset fonts (Latin + Tamil).
- Service worker: cache the app shell, and keep an offline mutation queue for shop-floor actions.
- No layout shift: reserve sizes, skeletons that match the final layout.

## 3. Backend techniques
- **Keyset (cursor) pagination** everywhere. No `OFFSET` on large tables.
- Indexes designed per query: composite indexes on `(tenant_id, status, updated_at)` etc. `pg_stat_statements` reviewed weekly in the first months.
- Avoid N+1 queries: dataloader-style batching in services. Use the Drizzle query builder with explicit selects.
- Redis caching for reference data (rate cards, tax, users, permissions), with event-driven invalidation.
- Everything slow goes to the queue: PDFs, e-invoice calls, WhatsApp sends, Tally sync, AI batch work.
- Read replica for reports and analytics, so heavy reports never slow down the shop floor.
- Materialised views for dashboards, refreshed incrementally.
- HTTP: Brotli, HTTP/2+, CDN for static assets with immutable caching.

## 4. Load & capacity targets
- 100 concurrent staff users + 500 portal users with headroom of 5×.
- Load tests (k6) on the top 10 endpoints before every major release.

## 5. Monitoring
- Real-user monitoring (Web Vitals) per route, with alerts on regression.
- APM traces with DB spans. Slow-query log > 100 ms.
- Lighthouse CI on key pages in every pull request.
