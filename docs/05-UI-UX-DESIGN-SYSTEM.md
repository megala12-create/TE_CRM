# 05 — UI/UX & Design System

## 1. UX principles

1. **Three clicks to anything, zero to the important thing.** Each persona's home screen shows exactly what they need today.
2. **Keyboard-first on desktop, thumb-first on mobile.**
3. **Never lose work.** Autosave drafts, undo for destructive actions, offline queue on the shop floor.
4. **Show, don't make them hunt.** Status colours, progress bars and badges replace "open the record to find out".
5. **Feel instant.** Optimistic updates, skeletons instead of spinners, prefetch on hover/viewport.
6. **AI is a teammate, not a popup.** AI suggestions appear inline where the work happens, clearly marked, with accept/edit/dismiss.
7. **Plain language, bilingual.** Labels in Tamil and English. Avoid jargon. Use Indian number formatting (₹1,23,456.00) and DD-MM-YYYY dates.

## 2. Information architecture

```
Home (persona dashboard)
├─ Sales:        Leads · Pipeline · Quotes · Accounts · Contacts
├─ Operations:   Job Orders · Artwork · Inward · Planning Board · Job Cards · QC · Dispatch · Dies · Stock
├─ Finance:      Invoices · Payments · Receivables · Expenses · Tally Sync
├─ Inbox:        WhatsApp · Email · Tickets   (one unified inbox)
├─ Tasks & Calendar
├─ Reports & Insights (+ Ask your data)
└─ Settings
```

## 3. Layout patterns

| Pattern | Where | Behaviour |
|---|---|---|
| **App shell** | Everywhere | Collapsible left nav, top bar with search/command palette, notifications, AI button, profile |
| **List → split view** | Leads, accounts, invoices, tickets | Click a row and the record opens in a right pane, keeping list context. `J/K` moves to next/previous. |
| **Record page** | Any entity | Header (key facts + primary actions) · tabs (Overview, Timeline, Documents, related lists) · right rail (AI summary, next actions) |
| **Kanban** | Pipeline, job stages, tickets | Drag to change stage. WIP limits. Swimlanes by owner/machine. |
| **Planning board** | Production | Machines × time grid, drag jobs, conflict warnings |
| **Shop-floor mode** | Job cards (tablet/phone) | Large tap targets (≥ 48 px), high contrast, scan QR → 2-tap actions, works offline |
| **Portal** | Customers | Minimal, mobile-first, brandable |
| **Wizard** | Imports, cutover tools, onboarding | Step indicator, validation per step, preview before commit |

## 4. Design system (`packages/ui`)

**Tokens** (CSS variables, light + dark themes):
- Colour: neutral scale + brand primary (from the company logo) + semantic `success / warning / danger / info` + status colours for job stages. All text meets WCAG 2.2 AA contrast.
- Typography: Inter (Latin) + Noto Sans Tamil, self-hosted with `font-display: swap`. Type scale 12/14/16/20/24/32.
- Spacing: 4 px base grid. Radius: 6/10/16. Elevation: 3 shadow levels.
- Motion: 150–200 ms ease-out. Respect `prefers-reduced-motion`.

**Core components:** Button, IconButton, Input, Select/Combobox (async search), DatePicker (Indian formats), Currency input (₹, lakh/crore grouping), DataGrid (virtualised, inline edit, column pinning), Tabs, Drawer, Dialog, Toast, Badge/StatusPill, Avatar, Timeline, FileDropzone with previews, Kanban, EmptyState, Skeleton, CommandPalette, AI Suggestion Card, Approval Card, Signature pad.

**AI UI patterns**
- ✨ marker + "AI draft" label on anything generated.
- Streaming text with a stop button.
- "Why?" expander showing sources/citations and the tools used.
- Diff view when AI proposes edits to an existing record.
- One-click 👍/👎 feedback.

## 5. Accessibility

- WCAG 2.2 AA target. Automated axe checks in CI plus a manual screen-reader pass per release.
- Full keyboard operability and visible focus rings.
- Labels, error messages and status are never conveyed by colour alone.

## 6. Internationalisation

- `next-intl` (or equivalent) with ICU messages. All strings are externalised from day one.
- Tamil + English at launch. Language is switchable per user, and per customer for outbound messages.
- Number, date and currency formatting via `Intl` with `en-IN` / `ta-IN`.

## 7. Design process

1. Phase 0: persona interviews, current-flow recordings, pain-point map.
2. Low-fi wireframes for the top 10 flows (inquiry→quote, PO→job order, inward, job card, dispatch+DC, invoice+e-invoice, payment, collections, ticket, owner dashboard).
3. Clickable prototype (Figma) → usability test with 5 real users per persona.
4. Hi-fi design + component specs → build in `packages/ui` with Storybook.
5. Post-launch: session analytics (privacy-respecting) + quarterly UX review.
