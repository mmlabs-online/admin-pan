Status: READY

# Plan — PAN-030: Accessibility and safety follow-ups (Roles, Assignments, list filters)

## Spec summary
- `docs/spec-v1.md` §6: "WCAG 2.2 AA (rule R10). Works on current Chrome, Edge, Firefox, Safari desktop; usable on a tablet."
- §5.2: "List with email search and status filter (paginated), detail, enable/disable with confirmation."
- §5.3: "List (paginated), create, detail, edit, suspend/reactivate, delete with confirmation."
- §5.4: "Apps registry (join policy, org mode, origins, default role), roles and their permissions, role assignments per user (app scope or one org), revoke sessions."
- CLAUDE.md R9: destructive or access-changing actions need an explicit confirmation naming the target (the copy must be accurate: the ticket says it "does not overclaim"). R10: keyboard reachable, visible focus, labelled inputs with linked errors, status messages announced, contrast.

No new features, no new API calls. This plan only fixes existing screens.

## Acceptance criteria → verification
| # | Criterion (from ticket.md) | How the reviewer verifies it |
|---|---|---|
| 1a | Reset filters does not drop focus to `<body>`. Focus moves to the search input. | `organizations-table.test.tsx › Reset filters moves focus to the search input`, `apps-table.test.tsx › Reset filters moves focus to the search input`. The existing `apps-table.test.tsx › no Reset when nothing is set` still passes. |
| 1b | `--input` reaches ≥ 3:1 against `--background` in light and dark. Focus stays distinguishable (`--ring` adjusted). | `src/styles/theme-contrast.test.ts` (reads `theme.css?raw`). Plus a visual pass in both themes, recorded in impl-log. |
| 1c | On a 422 the search input gets `aria-invalid` and an `aria-describedby` pointing to the message, and the message says what to change. | `organizations-table.test.tsx › 422 marks the search input invalid and links the message`, same in `apps-table.test.tsx`. |
| 1d | `aria-busy` is true only during initial or placeholder loads, not during background refetches. | Rewritten `organizations-table.test.tsx` test (was lines 458-483) plus a new `apps-table.test.tsx` refetch test. |
| 2a | The permissions dialog moves focus and announces the edit↔confirm step change. | `role-permissions-dialog.test.tsx › Save with removals focuses the confirm heading; Back focuses Save; send failure focuses the alert` |
| 2b | Disabled Save, Create and Retry buttons are linked to their reason through `aria-describedby`. | `role-permissions-dialog.test.tsx › Save is described by its reason while loading` and `role-create-dialog.test.tsx › Create role is described by the over-limit reason` |
| 2c | The loading state is announced and the read-only state is explained. | `role-permissions-dialog.test.tsx › loading is announced in the status region`, `› read-only explains why there is no Save` |
| 2d | Reasons on disabled row-menu items can be reached by keyboard and read. | `roles-table.test.tsx › disabled Delete is keyboard reachable, aria-disabled, carries its reason, and Enter opens nothing`, plus the same test for Set as default on the admin app. Existing `toBeDisabled()` at `roles-table.test.tsx:286` is updated. |
| 2e | "Loading…" status regions are mounted before their text changes. | `roles-table.test.tsx` (or the test file that renders `RolesContent`) › `apps loading status is the same node before and after load`; `role-create-dialog.test.tsx › permissions loading status is the same node before and after load` |
| 2f | `focusOpener` escapes the key with `CSS.escape`. | `roles-table.test.tsx › focus returns to the row actions of a key with quotes and backslashes` |
| 2g | The permissions `send()` re-checks readiness. | `role-permissions-dialog.test.tsx › no PUT when the role refetch fails during confirm`, `› role changed during confirm returns to edit with an alert and sends nothing`, `› happy path sends exactly one PUT with sorted keys` |
| 3a | The "Choose …" `aria-label` strips bidi control characters. | `src/lib/plain-label.test.ts` (unit) and `role-assign-dialog.test.tsx › Choose button name has no bidi controls and is never empty` |
| 3b | "Choose an organization." is only set when the org field is shown. | `role-assign-dialog.test.tsx › no org error when the org field is hidden, and none appears later` |
| 4 | The disable copy matches the BUG-001 wording and does not claim "signed out of every mmlabs app". | `src/features/users/data/status.test.ts` (copy guard) plus the updated `users-status-dialog.test.tsx › confirm names the target and the side effects` |
| 5 | Each fix has a test that fails before the fix, and all checks pass. | The implementer records in impl-log, for each new test, that it failed before the fix (run or reasoning). `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` are green (R8). |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/components/data-table/list-search-input.tsx` | Add optional props `inputRef?: React.Ref<HTMLInputElement>`, `invalid?: boolean`, `describedBy?: string`, applied to `<Input>` as `ref`, `aria-invalid={invalid \|\| undefined}` and `aria-describedby`. | AC 1a, 1c |
| `src/features/organizations/components/organizations-toolbar.tsx` | Pass `searchRef`, `searchInvalid` and `searchDescribedBy` through to `ListSearchInput`. | AC 1a, 1c |
| `src/features/organizations/components/organizations-table.tsx` | `useRef` for the search input; `onReset` also focuses it. Add an id (`useId`) on the 422 `<p role='alert'>`, change its text, and pass invalid/describedBy while the 422 shows. Change `aria-busy` to `view.status === 'pending' \|\| q.isPlaceholderData`. | AC 1a, 1c, 1d |
| `src/features/apps/components/apps-toolbar.tsx` | Same as the organizations toolbar. | AC 1a, 1c |
| `src/features/apps/components/apps-table.tsx` | Same as the organizations table (`:141`, `:160`, `:188-191`). | AC 1a, 1c, 1d |
| `src/styles/theme.css` | Light and dark `--input` and `--ring` (see Approach §1b). | AC 1b |
| `src/features/roles/components/role-permissions-dialog.tsx` | Focus on phase change, confirm heading, reason id, loading text in the status region, read-only explanation, `send()` guards, confirm snapshot, `aria-disabled` and reason on "Remove and save". | AC 2a, 2b, 2c, 2g |
| `src/features/roles/components/role-permission-picker.tsx` | Optional `limitId?: string` prop used as the `id` of the over-limit `<p role='alert'>`. | AC 2b |
| `src/features/roles/components/role-create-dialog.tsx` | Link Create role and Retry to the over-limit message (`aria-describedby` when `overLimit`). Make the "Loading permissions…" `role='status'` always mounted, with its text changing. | AC 2b, 2e |
| `src/features/roles/components/roles-row-actions.tsx` | "Set as default" and "Delete": replace `disabled` with `aria-disabled` plus `preventDefault` (or the fallback, see Approach §2d). Fix the reason contrast. | AC 2d |
| `src/features/roles/components/roles-dialogs.tsx` | `CSS.escape(key)` in `focusOpener`. | AC 2f |
| `src/features/roles/index.tsx` | Persistent `role='status'` for "Loading apps…" that does not unmount when loading finishes. | AC 2e |
| `src/lib/plain-label.ts` (new) | `toPlainLabel(s)`: strips control and bidi characters (the body of today's `sanitizeUserAgent`). | AC 3a |
| `src/features/users/data/sessions.ts` | `sanitizeUserAgent` becomes `return toPlainLabel(s)` (a thin wrapper; the JSDoc stays). | AC 3a (shared helper, no duplicate regex) |
| `src/features/users/components/assign-pickers.tsx` | Choose `aria-label` uses `toPlainLabel(rowName(row))`, with a non-empty fallback. | AC 3a |
| `src/features/users/components/role-assign-dialog.tsx` | `:241`: `if (showOrg && !orgChosen) setOrgError(...)`. | AC 3b |
| `src/features/users/data/status.ts` (new) | `DISABLE_EFFECT` and `ENABLE_EFFECT`, built with `APP_TOKEN_MAX_HOURS` from `assignments.ts`. | AC 4 |
| `src/features/users/components/users-status-dialog.tsx` | Use `DISABLE_EFFECT` / `ENABLE_EFFECT` instead of the inline strings at `:69-70`. | AC 4 |
| Tests (see next table) | New and updated tests. | AC 5 |

The implementer must not touch any other file without recording why in impl-log. In particular, do not change `components/ui/*`.

## Tests to write
Every new test must fail before its fix. The implementer notes in impl-log how this was confirmed.

| Test (file › name) | Covers |
|---|---|
| `src/features/organizations/components/organizations-table.test.tsx › Reset filters moves focus to the search input` (set `q` and `status`, click Reset, `expect.element(getByLabelText('Search organizations')).toHaveFocus()`) | 1a |
| `src/features/apps/components/apps-table.test.tsx › Reset filters moves focus to the search input` | 1a |
| `src/styles/theme-contrast.test.ts › --input is at least 3:1 on --background (light and dark)`; `› --ring is at least 3:1 on --background and stronger than --input (light and dark)`. Parse the `:root` and `.dark` blocks of `theme.css?raw`, convert OKLCH → linear sRGB → relative luminance, composite any alpha over `--background`. The conversion helpers live inside the test file (about 30 lines; no production colour helper). | 1b |
| `organizations-table.test.tsx › 422 marks the search input invalid and links the message` (assert `aria-invalid="true"`, `aria-describedby` equals the alert's id, the text names the search; and that both attributes are absent on a successful load) | 1c |
| `apps-table.test.tsx › 422 marks the search input invalid and links the message` | 1c |
| `organizations-table.test.tsx` — rewrite the test at `:458-483` as `› aria-busy only on initial and placeholder loads, not on background refetch` (initial: true; after settle, invalidate or refetch the same key: stays false; change a filter → placeholder: true) | 1d |
| `apps-table.test.tsx › aria-busy stays false during a background refetch` | 1d |
| `src/features/roles/components/role-permissions-dialog.test.tsx › Save with removals focuses the confirm heading; Back focuses Save; send failure focuses the alert` | 2a |
| `role-permissions-dialog.test.tsx › Save is described by its reason while loading` (`toHaveAccessibleDescription(/Loading/)`), and while over the limit (`/at most 200/`) | 2b |
| `role-permissions-dialog.test.tsx › loading is announced in the status region` (the `role=status` holds "Loading permissions…" while not ready) | 2c |
| `role-permissions-dialog.test.tsx › read-only explains why there is no Save` (visible text naming `admin:roles:manage`; extend the existing test near `:300`) | 2c |
| `role-permissions-dialog.test.tsx › no PUT when the role refetch fails during confirm` (reach confirm, make the detail refetch return 500, click "Remove and save": zero PUTs in the request log; the button is `aria-disabled` with a linked reason) | 2g |
| `role-permissions-dialog.test.tsx › role changed during confirm returns to edit with an alert and sends nothing` (refetch returns different permissions; dialog returns to edit, alert text "This role changed while you were reviewing…", zero PUTs) | 2g |
| `role-permissions-dialog.test.tsx › happy path sends exactly one PUT with sorted keys` (keep the existing test if it already asserts this; otherwise add it) | 2g regression guard |
| `src/features/roles/components/role-create-dialog.test.tsx › Create role and Retry are described by the over-limit reason` | 2b |
| `role-create-dialog.test.tsx › permissions loading status is the same node before and after load` (hold the `role=status` element while pending, resolve, assert the same node's text changed or is empty and the node is still connected) | 2e |
| `src/features/roles/components/roles-table.test.tsx` (the file that renders `RolesContent` via `test-fixtures.tsx`) `› apps loading status is the same node before and after load` | 2e |
| `roles-table.test.tsx › disabled Delete is keyboard reachable, aria-disabled, carries its reason, and Enter opens nothing` and the same for "Set as default" on the admin app. Update the existing `toBeDisabled()` at `:286` and the Delete assertions near `:317-338` to `toHaveAttribute('aria-disabled','true')`. If the fallback is taken (Approach §2d), test that the Actions button's accessible description contains the reason instead. | 2d |
| `roles-table.test.tsx › focus returns to the row actions of a key with quotes and backslashes` (mock row key `x:a"]b\`; open Rename, press Escape; that row's Actions button has focus and a `console.error`/`window` error spy is empty; a normal key still restores focus) | 2f |
| `src/lib/plain-label.test.ts › strips C0/C1, bidi and invisible format characters; trims` (move or duplicate the cases from `sessions.test.ts:10-38`; `sessions.test.ts` stays unchanged and passing) | 3a |
| `src/features/users/components/role-assign-dialog.test.tsx › Choose button name has no bidi controls and is never empty` (org `Acme‮evil` → button named `Choose Acmeevil`; `aria-label` contains none of U+202A–202E, U+2066–2069, U+200E/F, U+061C; an org named only `‮⁦` gets a non-empty name) | 3a |
| `role-assign-dialog.test.tsx › no org error when the org field is hidden, and none appears later` (app with orgs → "One organization" → switch to an `org_mode: 'none'` app → Grant with no user: only "Choose a user."; switch back: no "Choose an organization.") | 3b |
| `src/features/users/data/status.test.ts › DISABLE_EFFECT states next-admin-request and up-to-12-hours and does not overclaim` (contains `next admin request`, `` `up to ${APP_TOKEN_MAX_HOURS} hours` ``; not `/signed out\|logged out\|immediately\|every mmlabs app/i`); `› ENABLE_EFFECT does not promise restored sessions` | 4 |
| `src/features/users/components/users-status-dialog.test.tsx › confirm names the target and the side effects` — replace the `:88` assertion with `/next admin request/` and `/up to 12 hours/`; keep `/sessions are revoked/` and the reset/verification links assertion (still true, appsec F1) | 4 |

## Approach

### 1. List filters (organizations, apps)
a. **Reset focus.** In each table, `const searchRef = useRef<HTMLInputElement>(null)`. `onReset` calls `setListSearch(...)` and then `searchRef.current?.focus()`. The input stays mounted, so focusing it straight away is safe. The ref goes table → toolbar → `ListSearchInput` → `<Input ref>`. Do not keep Reset mounted: `apps-table.test.tsx:442-454` must keep passing.

b. **Tokens** (`theme.css`). Starting values, to be confirmed by the contrast test (adjust L if a value misses):
   - Light: `--input: oklch(0.62 0.03 257.417)` (about 3.6:1 on white). `--ring: oklch(0.446 0.043 257.281)` (about 7:1, clearly darker than the resting border).
   - Dark: `--input: oklch(0.52 0.03 264.364)` (opaque, about 3.7:1 on `--background`). `--ring: oklch(0.704 0.04 256.788)` (lighter than the input, about 7:1).
   - The test asserts `contrast(input, background) ≥ 3`, `contrast(ring, background) ≥ 3`, and `contrast(ring, background) > contrast(input, background)` in both themes, so focus stays distinguishable from the resting border (2.4.7, 2.4.13).
   - **Owner-visible design change.** Every input, select, textarea, checkbox, radio, switch track, outline button, tab and calendar gets a darker border in light mode. Dark-mode `bg-input/30` fills get a little lighter. The focus ring changes colour in both themes. `--sidebar-ring` follows `--ring`. The implementer does a visual pass in both themes on a form-heavy screen (the organizations action dialog and the login form) and notes it in impl-log. The PR description must call this change out.
   - `--border` is unchanged (it is used for decorative borders, not form-control boundaries).

c. **422.** In each table, `const invalidId = useId()`. Render `<p role='alert' id={invalidId}>The search or filters weren't accepted. Shorten or change the search, or reset the filters.</p>`. While `view.status === 'error' && isApiError(view.error, 422)`, pass `searchInvalid` and `searchDescribedBy={invalidId}` to the toolbar, which forwards them to `ListSearchInput`. This is the same pattern as `audit-log-filters.tsx:260`.

d. **aria-busy.** `aria-busy={view.status === 'pending' || q.isPlaceholderData}` in both tables. The `role=status` line already handles the "Loading…" text and does not change.

### 2. Roles
a. **Phase focus** (`role-permissions-dialog.tsx`).
   - The confirm block gets `<h3 ref={confirmHeadingRef} tabIndex={-1}>Remove these permissions from {key}?</h3>`, replacing the `<p>` at `:191`.
   - Add a `saveRef` on Save.
   - A `useEffect` on `phase` (skipping the first render, using the `prevPhase` pattern from `role-assign-dialog.tsx:167-174`): on confirm, focus the heading; on edit after Back, focus Save; on edit after a send failure, focus the alert.
   - `RoleAlertView` renders the alert. If it cannot take a ref, wrap it in a `div` with `tabIndex={-1}` and a ref, local to this dialog. Record in impl-log which was used.
   - Focusing the heading announces the step. Do not add an extra live region.

b. **Reasons.**
   - Permissions dialog: the `reason` span gets `id={reasonId}`, and Save gets `aria-describedby={reason ? reasonId : undefined}`.
   - "Remove and save": `aria-disabled` when `pending || !ready || loadError`, with `aria-describedby` pointing to a visible reason ("Loading…" / the load error / "Saving…" as appropriate). Its `onClick` still calls `send()`, which guards itself.
   - Create dialog: `const limitId = useId()`, passed to `RolePermissionPicker` as `limitId`. Create role and Retry get `aria-describedby={overLimit ? limitId : undefined}`. The picker puts `id={limitId}` on its over-limit `<p role='alert'>`.

c. **Loading and read-only.**
   - The always-mounted sr-only status (`:214-216`) becomes `pending ? 'Saving permissions…' : waiting ? 'Loading permissions…' : ''`. The visible footer reason stays, but it is not a live region.
   - When `readOnly`, render `<p className='text-sm text-muted-foreground'>You can view these permissions but not change them. Changing them needs admin:roles:manage.</p>` where the footer would be.

d. **Menu items** (`roles-row-actions.tsx`).
   - Preferred: on "Set as default" and "Delete", drop `disabled` and set `aria-disabled={blocked || undefined}`. Add `onSelect={(e) => { if (blocked) e.preventDefault() }}` and make `onClick` a no-op when blocked.
   - Styling: `aria-disabled:opacity-60` on the label only. The `<Reason>` span uses `text-foreground/80` (or `text-muted-foreground` without inherited opacity) so it keeps ≥ 4.5:1.
   - The reason stays inside the item, so it is part of the accessible name and arrow keys reach it.
   - Fallback, if Radix makes this unreliable (Enter still closes the menu or opens the dialog in tests): keep `disabled` and add a visually hidden span with the reasons, linked from the Actions trigger's `aria-describedby`.
   - The implementer decides and records the choice and the reason in impl-log. Either way, existing tests that use `toBeDisabled()` on these items are updated, not deleted.

e. **Status regions** (minimal, two places only).
   - `role-create-dialog.tsx`: render `<p role='status' className='text-sm text-muted-foreground'>{permissions.isPending ? 'Loading permissions…' : ''}</p>` once, outside the error/picker ternary. The ternary keeps the error and picker branches, and the pending branch renders nothing else.
   - `roles/index.tsx`: the pending path is an early return that is replaced by `RolesProvider` on success.
     - Fix: render a single `<p role='status' className='sr-only'>{appsView.status === 'pending' ? 'Loading apps…' : ''}</p>` as a sibling before the conditional branches in `RolesContent`. Do this by returning a fragment that always starts with that `<p>` (the forbidden, error and success branches all include it), so the node persists across pending → success.
     - Keep a visible "Loading apps…" text (not a live region) in the pending branch for sighted users.

f. **focusOpener.** `` `[aria-label="Actions for ${CSS.escape(key)}"]` `` at `roles-dialogs.tsx:19`.

g. **`send()` readiness** (appsec F2).
   - Add `const confirmBase = useRef<string[] | null>(null)`.
   - In `save()`, before `setPhase('confirm')`, set `confirmBase.current = [...(base ?? [])].sort()`.
   - In `send()`, first: `if (inFlight.current || !ready || loadError) return`.
   - Then, if `phase === 'confirm'` and the current sorted `base` differs from `confirmBase.current`: `setPhase('edit')`, `setAlert(message('This role changed while you were reviewing. Check the selection and save again.'))`, and return without sending. Use the same `AppAlert` constructor the dialog already uses. If none fits, build the `{ kind: 'message', … }` shape that `AppAlert` accepts.
   - Clear `confirmBase` in `reset()`.
   - **Note.** `ready` already includes `fresh`, so during a pending refetch `send()` is a silent no-op. The button shows `aria-disabled` with the reason (§2b), so the user is not left guessing.

### 3. Assignments
a. **Helper.** `src/lib/plain-label.ts` exports `toPlainLabel(s: string): string`, with exactly the current `sanitizeUserAgent` body (the same regexes and the eslint-disable comment). `sanitizeUserAgent(s)` returns `toPlainLabel(s)`.
   - In `PickList`: ``aria-label={`Choose ${toPlainLabel(rowName(row)) || `${noun} result ${index + 1}`}`}``. Use the map index; `noun` is already a prop.
   - The visible "Choose" text is still the start of the name (2.5.3).

b. **Org error.** `role-assign-dialog.tsx:241`: `if (showOrg && !orgChosen) setOrgError('Choose an organization.')`. The focus line at `:242` is already correct: the outer condition means the org branch only runs when `showOrg`.

### 4. Users status dialog copy
`src/features/users/data/status.ts`, with a header comment in the same style as `sessions.ts` ("pinned by status.test.ts"):
- `DISABLE_EFFECT` = `` `They can't sign in or get new access tokens for any mmlabs app until re-enabled, and their access to this admin app ends on their next admin request. Tokens already issued to other apps stay valid until they expire, up to ${APP_TOKEN_MAX_HOURS} hours. All their sessions are revoked, pending join requests are cancelled, and any password-reset or verification links stop working.` ``
- `ENABLE_EFFECT` = `'They will be able to sign in to mmlabs apps again. Revoked sessions and old password-reset or verification links stay ended.'`

The dialog renders `{disabling ? DISABLE_EFFECT : ENABLE_EFFECT}` after the target. The facts come from appsec F1, which checked them against org-admin-api `users/service.py:41-118`.

### Rules
- R1, R2: no new HTTP and no API change.
- R7: scope limited to the AC; same-pattern defects elsewhere go to follow-ups.
- R8: all checks are green.
- R9: the copy no longer overclaims, the permissions PUT is never sent on stale data, and failures are shown.
- R10: this is the purpose of the ticket.
- R6: `toPlainLabel` reduces spoofing in accessible names.
- R5, R11: not affected.

### Size
The production diff is about 200 lines and the tests about 350 lines, with no migrations and no new feature. The owner asked for the batch as one ticket ("gom follow-up thành ticket làm luôn"), so it is not split. If the menu-item change (§2d) grows, take the fallback rather than expanding the diff.

### Follow-ups (record in impl-log, not in the diff)
- `users-table.tsx:118` `aria-busy={q.isFetching}` (same defect as AC 1d).
- `role-holders-sheet.tsx:135`, `:146` "Loading…" status regions inserted with their text (same defect as AC 2e).
- Unescaped selectors built from data: `apps-dialogs.tsx:12-20` and `app-permissions-tab.tsx:40-44` → one shared `focusByData()` helper.
- org-admin-api: optimistic concurrency (ETag / `If-Match` or a version field) for `PUT …/roles/{id}/permissions` (lost update between two staff; appsec risk). Propose there after checking its backlog (R1).
- PAN-015b 💭 items not in the AC: picker region landmarks and h4 jump, `<th scope='row'>`, "1 permissions" plural, the em dash in the Privileged column, picker helper `aria-describedby`.
- Axe-core scans with PAN-023.

## Specialist input used
- **frontend-developer:**
  - Adopted: A1 (ref on `ListSearchInput`, keep the "no Reset" test), A2 (token test via `?raw`; values adjusted to the owner-decided ring change), A3 (invalid/describedBy props, message names what to change), A4 (`pending \|\| isPlaceholderData`, rewrite `:458-483`), B1–B3, B4 (with the fallback), B5 (narrowed to the two AC locations, with a persistent wrapper for `roles/index.tsx`), B6, B7, C1, C2, D.
  - Rejected or deferred: `users-table` and `role-holders-sheet` (out of AC, R7 → follow-ups). A shared `StatusRegion` component is not created; two inline always-mounted `<p role='status'>` are smaller.
  - The open questions were answered by the orchestrator's decisions (see Assumptions).
- **appsec-engineer:**
  - Adopted: F1 (verified disable semantics, `status.ts` constants, copy guard, keep the sessions-revoked and links assertions), F2 (`!ready \|\| loadError` guard, confirm snapshot, `aria-disabled` and reason on the confirm button), F3 minimal `CSS.escape` (the `data-*` alternative is not needed for this ticket), F4 (`toPlainLabel` in `src/lib`, `sanitizeUserAgent` as wrapper, non-empty fallback), F5.
  - Outside scope, sent to follow-ups: other unescaped selectors and the lost-update risk.

## Assumptions
- Disable copy: the semantics are as appsec F1 verified in org-admin-api (sessions revoked, no new tokens, sign-in refused, reset and verification links invalidated, pending join requests cancelled, admin access ends on the next admin request, other apps' tokens valid until expiry, up to 12 h). The "12" comes only from `APP_TOKEN_MAX_HOURS`.
- Reset moves focus to the search input. The existing "no Reset when nothing is set" test stays.
- `--input` and `--ring` both change in light and dark (owner decision via orchestrator). This is an **owner-visible design change** to be called out in the PR.
- The 422 marks only the search input as invalid (the only free-text field). The message also mentions filters, because a select can cause it too.
- `aria-busy` changes only in the organizations and apps tables.
- For menu items the implementer chooses `aria-disabled` + `preventDefault` or the trigger `aria-describedby` fallback, and records the choice.
- Status-region fix only in `roles/index.tsx` and `role-create-dialog.tsx`.
- The suggested token L values are estimates. The contrast test is the authority, and the implementer may tune L within the constraints in §1b.
- UI copy is in English, like the existing screens (spec §8 Q3 unchanged).

## Blocking questions
None.

## Split proposal
None. The owner asked for one batch ticket. See Approach › Size for the fallback if the diff grows.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/organizations` | `admin:organizations:read` (unchanged) | loading (`aria-busy` initial/placeholder only), 422 (input invalid + linked message); others unchanged | Reset filters → focus to search; no mutation | — |
| `/apps` | `admin:apps:read` (unchanged) | same as above | same as above | — |
| `/roles` | unchanged (`admin:roles:read`; set permissions `admin:roles:manage`) | apps loading in a persistent status; permissions dialog: loading announced, read-only explained, load error blocks confirm | Set permissions → `PUT …/roles/{id}/permissions` (unchanged; now guarded by readiness and snapshot) | unchanged |
| `/users` (status dialog, assign dialog) | unchanged (`admin:users:write`, assignments as today) | copy only; assign-dialog validation | unchanged | unchanged |

## API calls used
None. No API call is added or changed. The existing `PUT /api/v1/apps/{key}/roles/{role_id}/permissions` call is only guarded on the client.
