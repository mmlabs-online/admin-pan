## Attempt 1 — 2026-11-18
Verdict: REWORK

Reviewed commit 2457f39 against origin/main.

### Checks (run by reviewer)
- pnpm typecheck: clean (`tsc -b`, no output)
- pnpm lint: clean
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium), run 1: Test Files 115 passed (115), Tests 970 passed (970). Run 2: same, 115/970 passed. This matches impl-log.
- pnpm build: "built in 1.32s"
- pnpm e2e: 30 passed (1.6m)

### Mutation checks (each production change reverted alone, then the named tests run; everything restored with `git checkout HEAD --`)
| Mutation | Test result |
|---|---|
| Removed `searchRef.current?.focus()` in organizations and apps tables | Both "Reset filters moves focus" tests FAIL (good) |
| `aria-invalid={undefined}` / removed `aria-describedby` in `list-search-input.tsx` | Both "422 marks…" tests FAIL (good) |
| `aria-busy={q.isFetching}` | Both background-refetch tests FAIL (good). `pending` only (no placeholder): the existing placeholder test FAILS (good) |
| Light `--input` back to `oklch(0.929 …)` | theme-contrast light FAILS (good) |
| Dark `--input` back to `oklch(1 0 0 / 15%)` (the original defect) | theme-contrast **PASSES**. See Issue 1 |
| Dark `--ring` back to `oklch(0.551 …)` | theme-contrast **PASSES**. See Issue 3 |
| `send()` guard reduced to `if (inFlight.current) return` | "no PUT when the role refetch fails during confirm" **PASSES**. See Issue 2 |
| Confirm snapshot check disabled (`false &&`) | "role changed during confirm…" FAILS (good) |
| Confirm heading focus removed / alert focus replaced by Save | Focus test FAILS in both cases (good) |
| Save `aria-describedby` removed | Both "Save is described…" tests FAIL (good) |
| "Loading permissions…" removed from the status region | "loading is announced" FAILS (good) |
| Menu items back to `disabled` | Both keyboard-reachable tests FAIL (good) |
| `onSelect` preventDefault and `onClick` guard removed / only `onClick` guard removed | Both tests FAIL (Enter opens the dialog) (good) |
| `CSS.escape` removed | "focus returns … quotes and backslashes" FAILS (good) |
| Apps-loading status only in the pending branch | "apps loading status is the same node" FAILS (good) |
| Create-dialog status back inside the ternary | "permissions loading status is the same node" FAILS (good) |
| Create role/Retry `aria-describedby` removed | "Create role is described by the over-limit reason" FAILS (good) |
| `toPlainLabel` removed from the Choose `aria-label` | "Choose button name has no bidi controls…" FAILS (good) |
| `showOrg &&` removed from the org error | "no org error when the org field is hidden" passes. This is expected: it is unreachable, because every app change resets the scope to `app`. impl-log documents it |
| `DISABLE_EFFECT` reworded to "signed out of every mmlabs app" | `status.test.ts` and `users-status-dialog.test.tsx` FAIL (good) |

I also ran a temporary test, deleted afterwards. Escape from the confirm step returns focus to the row's Actions button, and so does a successful "Remove and save". So the new phase-focus effect does not steal focus on close.

### Acceptance criteria
- [x] 1a Reset focuses the search input. Evidence: `organizations-table.tsx:152`, `apps-table.tsx:160`; tests "Reset filters moves focus to the search input" in both table test files, mutation-proven. Reset stays unmounted when nothing is set; the existing "no Reset" test passes.
- [ ] 1b `--input` ≥ 3:1 in light and dark. The shipped values are correct. Computed independently (OKLCH → sRGB), I get light input 3.64:1, dark input 3.66:1 (opaque), light ring 7.56:1, dark ring 7.68:1. But the dark half of the guarding test does not detect the original defect. FAILED, see Issue 1.
- [x] 1c 422: `aria-invalid` and `aria-describedby` point to the alert id (`organizations-table.tsx:194`, `apps-table.tsx:200`, `list-search-input.tsx`). Tests "422 marks the search input invalid…" ×2, mutation-proven; both also assert the attributes are absent before the 422.
- [x] 1d `aria-busy` only on pending or placeholder (`organizations-table.tsx:161`, `apps-table.tsx:169`). Background-refetch tests ×2 plus the existing placeholder test, mutation-proven.
- [x] 2a Phase focus (`role-permissions-dialog.tsx:164-172`, `<h3 tabIndex=-1>` at :228). Test at `role-permissions-dialog.test.tsx:372`, mutation-proven for the heading and alert targets.
- [x] 2b Reasons linked: Save `:321`, Remove and save `:298`, Create/Retry `role-create-dialog.tsx:324,336` → picker `limitId`. Tests `:402`, `:414`, and `role-create-dialog.test.tsx` "over-limit reason", mutation-proven. (Retry is not separately asserted. It shares the same expression, so this is acceptable.)
- [x] 2c Loading announced (`:259-265`) and read-only explained (`:266`). Tests `:430` and the extended read-only test, mutation-proven for loading.
- [x] 2d Menu items `aria-disabled` + `onSelect` preventDefault + guarded `onClick` (`roles-row-actions.tsx:80-87,105-112`), with the reason in the accessible name. Tests `roles-table.test.tsx:428,449`, mutation-proven (`disabled` → unreachable; guards removed → Enter opens the dialog).
- [x] 2e Status nodes persist: `roles/index.tsx:74`, `role-create-dialog.tsx:278`. Same-node tests, mutation-proven.
- [x] 2f `CSS.escape` (`roles-dialogs.tsx:19`). Test `roles-table.test.tsx:470`, mutation-proven.
- [ ] 2g `send()` re-checks readiness (`role-permissions-dialog.tsx:106`) plus the confirm snapshot (`:107-118`). The snapshot is proven, but no test fails when the readiness guard is removed. FAILED, see Issue 2.
- [x] 3a Bidi stripped through `toPlainLabel` (`src/lib/plain-label.ts`, `assign-pickers.tsx:189`), with a non-empty fallback. Unit tests plus the dialog test, mutation-proven. `sanitizeUserAgent` wraps it, and `sessions.test.ts` still passes.
- [x] 3b `showOrg &&` guard (`role-assign-dialog.tsx:241`). The test is a behaviour guard only, which is unavoidable (see the mutation table).
- [x] 4 Disable copy (`src/features/users/data/status.ts`). I checked it against org-admin-api `app/modules/users/service.py:42-118`. It revokes all account sessions, calls `invalidate_all` on email tokens, cancels pending join requests, and has an admin per-request status check (`admin_auth/service.py:46`). `access_token_ttl_seconds` le=43200 (`app/core/config.py:93`) → "up to 12 hours" is correct, built from `APP_TOKEN_MAX_HOURS`. Guard test and dialog test are mutation-proven.
- [ ] 5 Each fix has a discriminating test. Not met for 1b (dark) and 2g, see Issues 1–2. All checks are green.

### Issues
#### Issue 1 — 🔴 blocker — the contrast test composites alpha in linear light, so the dark-mode defect is invisible to it
- **Where**: `src/styles/theme-contrast.test.ts:40` (`rgb.map((v, i) => v * alpha + over[i] * (1 - alpha))`, where `rgb` and `over` are linear-light values).
- **Expected**: The test fails for the original dark token `--input: oklch(1 0 0 / 15%)`. Browsers blend in gamma-encoded sRGB, which gives about 1.44:1 on `--background`, and that was the PAN-029 defect.
- **Actual**: Blending in linear light gives 3.88:1, so with the original dark `--input` restored the test passes (mutation run above). The dark half of AC 1b has no guard against going back to an alpha token.
- **Fix instruction**: In `token()`, when `alpha < 1`, convert both colours to gamma-encoded sRGB (`v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055`), blend there (`fg * alpha + bg * (1 - alpha)`), then decode back to linear (`v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4`) before `luminance`. Add a small case that pins the compositor, e.g. `oklch(1 0 0 / 15%)` over the dark `--background` must be < 3:1. Then confirm the current opaque values still pass (they should: 3.66 and 7.68).

#### Issue 2 — 🔴 blocker — the `send()` readiness guard (AC 2g) has no discriminating test
- **Where**: guard at `src/features/roles/components/role-permissions-dialog.tsx:106`; test at `role-permissions-dialog.test.tsx:444-468`.
- **Expected**: Removing `!ready || loadError` from the guard fails a test.
- **Actual**: With the guard reduced to `if (inFlight.current) return`, the test still passes. The snapshot check (`:107-118`) sees `base === null`, switches to edit with "This role changed while you were reviewing…" and sends nothing. So the test only proves the snapshot, not the readiness re-check, and with the guard gone the user gets the wrong alert. The guard does matter in its own right: it is the only thing that stops a send when the role detail is fresh but `permsQ` has errored.
- **Fix instruction**: In the test at `:444`, after `press(confirm)` and the wait, also assert that the dialog stayed on the confirm step and showed no "role changed" alert. For example: `await expect.element(dialog.getByText(/This role changed while you were reviewing/)).not.toBeInTheDocument()` and `await expect.element(dialog.getByRole('button', { name: 'Remove and save' })).toBeInTheDocument()`. Then check that the test fails with the guard reduced to `if (inFlight.current) return`, and record that run in impl-log.

#### Issue 3 — 🟡 should-fix — impl-log evidence for the theme test is inaccurate
- **Where**: `work/tickets/PAN-030/impl-log.md`, Attempt 1, "Failed before the fix (run): … theme contrast (light input 1.23:1, dark ring 2.63:1)".
- **Expected**: Failure evidence that matches what the test does.
- **Actual**: With the original dark `--ring: oklch(0.551 0.027 264.364)` restored, the test passes. Its contrast is about 4.17:1, and it is still stronger than the new dark `--input`. Only the light input failed before the fix.
- **Fix instruction**: In the Attempt 2 impl-log, record the real before-fix results of the theme test after Issue 1 is fixed (the light input and the original dark alpha `--input` should both fail). Do not change the dark `--ring` value; that change is a plan decision, not something this test requires.

### Rules R1–R11
No violations found.
- R1/R2: no HTTP added.
- R6: `toPlainLabel` strips bidi characters; no new HTML sinks.
- R7: every changed `src/` file is in the plan's file list, and impl-log says "Out-of-plan files: None", which is true. `work/backlog.md` and `work/tickets/PAN-031/ticket.md` come from the orchestrator's commit 6d155da, not the implementer.
- R9: copy verified against the API.
- R10: the purpose of the ticket.

### Security / a11y blockers
None. `security-review.md` and `a11y-review.md` (attempt 1) report no 🔴 items.

### Nits (do not block)
- 💭 The Choose fallback reads "Choose organizations result 2" (`assign-pickers.tsx:189`, plural `noun`). Something like "Choose result 2" or a singular noun would read better.
- 💭 `role-create-dialog.tsx:278` is a visible `<p role='status'>` that stays mounted when empty. In a `space-y` container it may add an empty gap. `sr-only` plus the existing visible text, or `empty:hidden`, would avoid that.
- 💭 The "no org error when the org field is hidden" test cannot fail. That is documented and acceptable.
- 💭 security-review 💭1: the CSS.escape test could also spy on `console.error` and window `error` events, as the plan suggested.

### Follow-ups (out of scope)
- As in impl-log: `users-table.tsx:118` `aria-busy={q.isFetching}`; `role-holders-sheet.tsx` status regions; unescaped selectors in `apps-dialogs.tsx` and `app-permissions-tab.tsx`; org-admin-api optimistic concurrency for `PUT …/roles/{id}/permissions`; PAN-015b 💭 items.

## Attempt 2 — 2026-11-18
Verdict: PASS

Reviewed commit 2c2bd67 (changes since a9b48bc) against origin/main.

### Checks (run by reviewer)
- pnpm typecheck: clean (`tsc -b`)
- pnpm lint: clean
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium), run 1: Test Files 115 passed (115), Tests 973 passed (973). Run 2: same. This matches impl-log.
- pnpm build: "built in 1.27s"
- pnpm e2e: 30 passed (1.6m)

### Mutation checks (each change applied alone, the named tests run, then restored with `git checkout HEAD --`)
| Mutation | Result |
|---|---|
| Dark `--input` back to `oklch(1 0 0 / 15%)` (`theme.css:54`) | theme-contrast FAILS: "expected 1.4420265630548335 to be greater than or equal to 3". Issue 1 is fixed |
| `send()` guard reduced to `if (inFlight.current) return` | "no PUT when the role refetch fails during confirm" FAILS (1 failed, 18 passed). Issue 2 is fixed |
| `searchInvalid={rejected}` (no term check) in both tables | Both "422 marks the search input invalid…" tests FAIL |
| Button base ring back to `focus-visible:ring-ring/50` | "buttons use a full-opacity focus ring" FAILS |
| `forbidden = false` in `role-permissions-dialog.tsx:151` | "403 on the role refetch during confirm does not say Loading" FAILS |

Baseline theme-contrast: 6 passed. The new pinned compositor case covers the alpha blend directly.

### Attempt 1 issues
- Issue 1 🔴 (alpha composited in linear light): fixed. `theme-contrast.test.ts` now blends in gamma-encoded sRGB, and the pinned case `oklch(1 0 0 / 15%)` < 3:1 is mutation-proven above.
- Issue 2 🔴 (no test discriminates the readiness guard): fixed. The test now asserts that no "role changed" alert appears and that "Remove and save" remains, and it is mutation-proven.
- Issue 3 🟡 (inaccurate before-fix evidence): fixed. The Attempt 2 impl-log corrects the "dark ring 2.63:1" claim and records the real before-fix failures. I reproduced the dark-input failure value exactly.
- Nits addressed: the CSS.escape test now spies on `console.error` and the window `error` event, and asserts none fired. The Choose fallback is singular (`assign-pickers.tsx:189`, e.g. "Choose organization 2"); no test pins the fallback text, which is acceptable for a nit.

### Acceptance criteria
Every criterion has evidence: the Attempt 1 evidence still holds and the full suite is green. 1b and 2g are now met (mutation table above), and 5 is met, since every fix has a discriminating test.

### Scope
- `src/components/ui/button.tsx` is outside the plan. impl-log justifies it under Out-of-plan files: the a11y reviewer flagged it 🟡 in Attempt 1. It changes one class and has a guard test. Accepted.
- Every other changed `src/` file is in the plan.
- `role-permissions-dialog.tsx` adds a `forbidden` reason. This is a small correctness fix inside the planned file, it is tested, and it is noted in impl-log.

### Rules R1–R11
No violations. No HTTP is added (R1/R2), there are no new sinks (R6), the guards and confirm snapshot are intact (R9), and the a11y fixes are tested (R10).

### Security / a11y
- `security-review.md` Attempt 2: no blockers and nothing should-fix.
- `a11y-review.md` Attempt 2: no blockers and one new 🟡. The destructive button variant (`button.tsx:14`) keeps `focus-visible:ring-destructive/20` / `dark:…/40`, which twMerge lets override the new base ring. This problem predates PAN-030; base and variant were both faint before. Fixing it would widen the scope of a shared primitive beyond the plan. It is recorded as a follow-up and does not block.

### Nits (do not block)
- 💭 `noun.replace(/s$/, '')` is fine for 'users'/'organizations'. A `singular` prop would be sturdier if irregular nouns are added later.

### Follow-ups (out of scope)
- The destructive button variant focus ring (`button.tsx:14`, and `badge.tsx:16` for `[a&]`): use `focus-visible:ring-ring` and extend the theme-contrast class assertion to forbid `ring-destructive/` (a11y-review Attempt 2 🟡 1).
- Carried over from Attempt 1: `users-table.tsx:118` `aria-busy={q.isFetching}`; `role-holders-sheet.tsx` status regions; unescaped selectors in `apps-dialogs.tsx` / `app-permissions-tab.tsx`; org-admin-api optimistic concurrency for `PUT …/roles/{id}/permissions`; the PAN-015b 💭 items.
