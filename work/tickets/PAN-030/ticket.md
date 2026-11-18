# PAN-030: Accessibility and safety follow-ups (Roles, Assignments, list filters)

| Field | Value |
|---|---|
| State | REVIEW |
| Priority | P2 |
| Areas | ui, a11y, security |
| Attempts | 1 |
| Created | 2026-11-18 |
| PR | — |

## Goal
Fix the 🟡/💭 findings left open by the PAN-015b, PAN-015c, PAN-029 and PAN-017 reviews, so the new screens meet WCAG 2.2 AA (R10) and the copy does not overclaim (R9). No new features.

## Spec reference
`docs/spec-v1.md` §5.2–§5.4 (existing screens); CLAUDE.md R9, R10.

## Depends on
PAN-015b, PAN-015c, PAN-029, BUG-002 (all DONE). No org-admin-api changes.

## Acceptance criteria
- [ ] **List filters (PAN-029 a11y-review 🟡 1–4):** Reset filters does not drop focus to `<body>` (focus moves to the search input, or the button stays mounted); the form-field border (`--input` token) reaches ≥ 3:1 against the background in light and dark; on a 422 the search input gets `aria-invalid` + `aria-describedby` to the message; `aria-busy` only during initial/placeholder loads, not every background refetch.
- [ ] **Roles screen (PAN-015b a11y-review 🟡 1–5, security 💭):** the permissions dialog moves focus and announces the edit↔confirm step change; disabled Save/Create/Retry buttons are linked to their reason with `aria-describedby`; loading and read-only states are announced/explained; reasons on disabled row-menu items are reachable by keyboard and readable; "Loading…" status regions are mounted before their text changes; `focusOpener` escapes the key with `CSS.escape`; the permissions `send()` re-checks readiness.
- [ ] **Assignments (PAN-015c security 💭):** the "Choose …" `aria-label` strips bidi control characters (or uses `aria-labelledby`); "Choose an organization." is only set when the org field is shown.
- [ ] **Users status dialog (PAN-017 follow-up):** the disable copy no longer claims the user is "signed out of every mmlabs app"; it matches the BUG-001 wording (admin access ends on the next admin request; other apps' tokens last until expiry, up to 12 hours).
- [ ] Each fix has a test (keyboard/focus/ARIA assertion or copy guard); all checks pass (R8).

## Notes / answers from owner
- 2026-11-18 (owner): "merge rồi gom follow-up thành ticket làm luôn".
