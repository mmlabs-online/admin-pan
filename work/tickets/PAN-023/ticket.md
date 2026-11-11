# PAN-023: End-to-end smoke tests

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Areas | ui, a11y |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Playwright e2e: sign in, open each main page, one safe action per page, axe accessibility check on each page.

## Spec reference
`docs/spec-v1.md` §6

## Depends on
PAN-010

## Acceptance criteria
- [ ] `pnpm e2e` runs against mocks in CI
- [ ] axe finds no serious/critical issues on main pages (R10)

## Notes / answers from owner
None yet.
