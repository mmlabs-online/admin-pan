# PAN-020 a11y review

## Attempt 1

WCAG 2.2 AA, R10. Static read of the diff; axe, e2e, tests and screen readers not run by the auditor. **No 🔴 blockers.** Two 🟡, some 💭.

### Findings
1. 🟡 **Partial-month bar may fail non-text contrast (1.4.11)** — `src/features/dashboard/components/charts.tsx:63`: last bar uses `fillOpacity` 0.45 on `fill-primary`; blended colour not computed, may be near or below 3:1 (esp. dark mode). Not a blocker: the partial month is also stated in text (description, table row "Nov 2026 (partial)"). Fix: measure in both themes and raise opacity to ≥0.6, or add a non-colour cue (dashed stroke / hatch) on the partial `Cell`. Axe does not check SVG fills.
2. 🟡 **Cards have no heading semantics (1.3.1, 2.4.6)** — `dashboard-content.tsx:99, 117, 129`, `kpi-cards.tsx:21`: shadcn `CardTitle` is a `div`, so "New sign-ups", "Needs attention", "Members per app" are not headings. Fix: `<CardTitle asChild><h2>…</h2></CardTitle>` (or `role='heading' aria-level={2}`) for the three section titles; KPI labels can stay.
3. 💭 Attention link name (`attention-list.tsx:25-28`) lacks whitespace between label and count spans; add `{' '}` or an explicit `aria-label`.
4. 💭 Refresh button (`dashboard-content.tsx:46-53`): `aria-disabled` keeps focus (good); "Refreshing…" announced twice; nothing announced on completion; add `aria-disabled:opacity-50` styling.
5. 💭 "Updated" time (`dashboard-content.tsx:38-40`): correct `<time dateTime>`; consider showing the time zone.
6. 💭 Chart tooltips are mouse-only (`charts.tsx:55`, `113`) — acceptable given `role='img'` labels pointing to `<details>` tables with `TableCaption` and `scope='col'`; check the `Table` overflow wrapper is keyboard-reachable if it scrolls on narrow screens (2.1.1).
7. 💭 E2E axe (`e2e/pages.e2e.ts:32-40`) covers only the success state with the first `<details>` open; loading/error/403 states, the second table and dark theme not scanned.

### Working well
- Loading: always-mounted sr-only `role=status`/`aria-live=polite`, `aria-busy` on the section, `aria-hidden` skeletons.
- Error: `role=alert` + Retry. 403: ForbiddenPanel with `role=alert` and "Try again".
- Charts: axis text `currentColor` on `text-muted-foreground` (AA in both themes), 12px.
- Single h1, `<time dateTime>`, icons `aria-hidden`, KPI sub-lines plain text.
- Attention link: visible focus ring, large target, hidden destination hint, hidden when audit permission denied (R4).
- Partial month stated in text in three places.

### Follow-ups
- Axe on loading/403 states and a dark-theme run.
- Shared heading-capable `CardTitle` across features.
