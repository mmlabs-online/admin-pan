# BUG-xxx: <short description of the wrong behaviour>

| Field | Value |
|---|---|
| Type | bug |
| State | BACKLOG |
| Severity | S1 / S2 / S3 |
| Priority | P1 |
| Areas | <architecture, ui, ux, api, auth, security, a11y> |
| Found in | <release / image tag or commit> (production / local dev / mock data) / unknown |
| Introduced in | <PAN-xxx or commit> / unknown |
| Attempts | 0 |
| Created | YYYY-MM-DD |
| Record PR | — |
| PR | — |

## Report
<What the owner saw, in their words (quote), with the date. Screenshot: describe it; never commit images, and never copy
tokens, passwords, emails or other personal data from it (R5).>

## Environment
- Where: production (`admin-portal.mmlabs.online`) / local dev / mock data · API: real org-admin-api / mock
- Browser and device · Light/dark · Viewport · Signed-in permissions (`admin:*`) if relevant

## Steps to reproduce
1. …

## Expected
- …

## Actual
- …

## Root cause
<file:line and why, once known; "unknown — planner investigates" otherwise. Mark it **confirmed** (reproduced) or
**suspected**. Say whether the cause is in this repo or in org-admin-api.>

## Depends on
<PAN-xxx tickets; `org-admin-api <ID>` when the API must change first ("ticket needed" if none exists). "None" otherwise.>

## Scope
- Fix the cause above; nothing else (R7).

## Out of scope
- …

## Acceptance criteria
- [ ] A regression test reproduces the bug: it fails on `origin/main` before the fix and passes after (name the test).
- [ ] The expected behaviour above holds (light/dark, keyboard and screen reader when it is UI — R10).
- [ ] All checks pass (R8).

## Technical notes
- Files: …
- Test level: a Vitest browser-mode test (`*.test.tsx` next to the code, real Chromium) — it sees CSS, focus, layout
  and real browser APIs. Headers, CSP and caching served by nginx: extend `scripts/smoke-image.sh`. A multi-page flow:
  a Playwright e2e test once PAN-023 adds `pnpm e2e`; until then a route-level browser-mode test, or, only if neither
  can reproduce it, a one-off Playwright check (script outside the repo) whose result is recorded in impl-log.md.

## Notes / answers from owner
