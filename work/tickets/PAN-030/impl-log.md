## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| `src/components/data-table/list-search-input.tsx` | `inputRef`, `invalid`, `describedBy` props (AC 1a, 1c) |
| `src/features/{organizations,apps}/components/*-toolbar.tsx` | pass search ref / invalid / describedBy through |
| `src/features/{organizations,apps}/components/*-table.tsx` | Reset focuses search; 422 message id + new text; `aria-busy` only pending/placeholder |
| `src/styles/theme.css` | `--input` and `--ring`, light and dark (AC 1b) |
| `src/features/roles/components/role-permissions-dialog.tsx` | phase focus, reason ids, loading in status, read-only text, `send()` guards and confirm snapshot |
| `src/features/roles/components/role-permission-picker.tsx` | `limitId` prop |
| `src/features/roles/components/role-create-dialog.tsx` | `aria-describedby` on Create/Retry; always-mounted loading status |
| `src/features/roles/components/roles-row-actions.tsx` | menu items: `aria-disabled` + `preventDefault`; reason colour |
| `src/features/roles/components/roles-dialogs.tsx` | `CSS.escape` in `focusOpener` |
| `src/features/roles/index.tsx` | persistent apps-loading status node |
| `src/lib/plain-label.ts` (new) | `toPlainLabel` |
| `src/features/users/data/sessions.ts` | `sanitizeUserAgent` wraps `toPlainLabel` |
| `src/features/users/components/assign-pickers.tsx` | Choose `aria-label` through `toPlainLabel`, non-empty fallback |
| `src/features/users/components/role-assign-dialog.tsx` | `showOrg &&` guard on the org error |
| `src/features/users/data/status.ts` (new), `users-status-dialog.tsx` | `DISABLE_EFFECT` / `ENABLE_EFFECT` |

### Tests added / changed
- organizations-table.test.tsx, apps-table.test.tsx: Reset focuses search; 422 invalid + linked message; aria-busy not set on background refetch (refetch triggered with a `visibilitychange` event). The old organizations aria-busy test (placeholder case) is kept and still passes.
- `src/styles/theme-contrast.test.ts` (new): `--input` >= 3:1, `--ring` >= 3:1 and stronger than `--input`, light and dark.
- role-permissions-dialog.test.tsx: confirm/Back/failure focus; Save described while loading and over limit; loading in status; read-only text (extended existing test); no PUT when the refetch fails during confirm; role changed during confirm returns to edit, no PUT.
- role-create-dialog.test.tsx: Create described by over-limit reason (201 checkboxes, one click per tick); loading status is the same node.
- roles-table.test.tsx: Delete and Set as default (admin app) keyboard reachable, aria-disabled, reason in name, Enter opens nothing; focus return for key `x"]b\`; apps loading status same node.
- `src/lib/plain-label.test.ts` (new, cases copied from sessions.test.ts; sessions.test.ts unchanged and green).
- role-assign-dialog.test.tsx: Choose name without bidi and never empty; no org error when org hidden.
- `src/features/users/data/status.test.ts` (new); users-status-dialog.test.tsx updated (`next admin request`, `up to 12 hours`).

Failed before the fix (run): Reset focus x2, 422 x2, aria-busy refetch x2 (aria-busy stayed true), theme contrast (light input 1.23:1, dark ring 2.63:1), permissions dialog focus / description / status / no-PUT / role-changed (the PUT was sent), the four roles-table tests (End key never reached the disabled item; `CSS.escape` SyntaxError; status node replaced), Choose bidi name, status dialog copy.
Not run before the fix (reasoned): create-dialog over-limit description (no `aria-describedby` existed) and same-node status (the `<p>` sat in a ternary branch and was unmounted); `plain-label.test.ts` (module did not exist). `no org error when org hidden` cannot fail before the fix: the stale `orgError` was never rendered while the field was hidden (role-fixed target has a constant app), so it guards behaviour only.

### Decisions
- Menu items: `aria-disabled` + `onSelect` `preventDefault` + guarded `onClick` (the preferred approach). Radix `disabled` makes the item unfocusable, so arrow keys skip it. With `aria-disabled` the item is focusable, its reason is part of the accessible name, and Enter neither closes the menu nor opens a dialog (tests confirm). The trigger `aria-describedby` fallback was not needed. Label gets `opacity-60`; the reason text is `text-foreground/80`.
- Alert focus in the permissions dialog: a local `div tabIndex=-1` wrapper around `RoleAlertView` (it cannot take a ref); `RoleAlertView` unchanged.
- Tokens: plan values passed the contrast test unchanged. Light `--input` oklch(0.62 0.03 257.417), `--ring` oklch(0.446 0.043 257.281); dark `--input` oklch(0.52 0.03 264.364) (opaque), `--ring` oklch(0.704 0.04 256.788). Owner-visible design change: the PR description must call it out. No manual screenshot pass in both themes was made; the e2e axe scans (color-contrast included) pass on all pages.
- `toHaveFocus` on the confirm heading and the "role changed" check use the refetch trigger `window` `visibilitychange`.
- The existing `toBeDisabled()` at roles-table.test.tsx:286 is the New role button (a real `disabled`), so it was not changed; the Delete assertions already used `aria-disabled`.

### Checks (actual output summary)
- pnpm typecheck: clean
- pnpm lint: clean
- pnpm format / format:check: "All matched files use Prettier code style!"
- pnpm test (run twice): Test Files 115 passed (115), Tests 970 passed (970), both runs
- pnpm build: built in 1.47s
- pnpm e2e: 30 passed (1.6m)

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- `users-table.tsx:118` `aria-busy={q.isFetching}` (same defect as AC 1d).
- `role-holders-sheet.tsx:135`, `:146` "Loading…" status regions inserted with their text.
- Unescaped selectors from data: `apps-dialogs.tsx:12-20`, `app-permissions-tab.tsx:40-44`.
- org-admin-api: optimistic concurrency (ETag / If-Match) for `PUT …/roles/{id}/permissions`.
- PAN-015b 💭 items (landmarks, `<th scope='row'>`, "1 permissions" plural, em dash, picker helper describedby).
- Create-dialog over-limit test is slow-ish (201 clicks, ~5 s); a select-all control or a smaller limit in test config would help.

### Scope self-check
- Could the diff be smaller? No; each change maps to an AC.
- Diff size: not measured (no git repository in the workspace); roughly +230 production / +600 tests.
