# PAN-030: security review

## Attempt 1

## PAN-030: security review (REVIEW, attempt 1, commit 2457f39)

**Verdict: no blockers. All five consult items are in place, and nothing new renders API data unsafely.**

I read the full `git diff origin/main...HEAD`. I did not run the checks: my mode only allows `make check`, and this repo uses pnpm, so R8 green checks still need confirming by the reviewer.

## Findings

### 💭 1. The CSS.escape focus test does not watch for errors
- **Where:** `/home/user/admin-pan/src/features/roles/components/roles-table.test.tsx:470-484`, test "focus returns to the row actions of a key with quotes and backslashes".
- **What's missing:** the plan (and impl-log row 2f) promised a `console.error` / `window` `error` spy that stays empty. The test has no such spy.
- **Why it still mostly works:** focus landing on the right button already fails without the escape, because `querySelector` would throw and focus would be lost.
- **Risk:** low. A later change could swallow the throw and still restore focus by some other path, and the test would not notice.
- **Fix:** add `const errs = vi.spyOn(console, 'error')` and a `window` `error` listener before opening Rename, then `expect(errs).not.toHaveBeenCalled()` after the focus assertion.

### 💭 2. A 403 during the confirm step shows "Loading…" as the reason
- **Where:** `/home/user/admin-pan/src/features/roles/components/role-permissions-dialog.tsx:158-161`.
- **What happens:** if the role refetch returns 403 while the confirm step is open, `view.status` is `'forbidden'`, so `loadError` is null. `ready` is false, so `waiting` is true and the reason under "Remove and save" reads "Loading…".
- **Safety is fine:** `send()` still returns early on `!ready`, so no PUT goes out, and the body shows the ForbiddenPanel.
- **Problem:** only the wording next to the disabled button is misleading.
- **Fix:** `const confirmReason = pending ? 'Saving…' : view.status === 'forbidden' ? view.copy… /* or 'You no longer have access to this role.' */ : (loadError ?? (waiting ? 'Loading…' : null))`.

### 💭 3. The confirm list can show a different set from what was confirmed
- **Where:** `/home/user/admin-pan/src/features/roles/components/role-permissions-dialog.tsx:86`, with the confirm list at about lines 235-239.
- **What happens:** `removed` is recomputed from the live `base`. During a refetch it is briefly empty, and after one it can differ from what the user saw.
- **Safety is fine:** the snapshot check (lines 107-117) stops the PUT and sends the user back to edit with an alert.
- **Possible hardening (not required):** render the list from a `removed` snapshot taken at the same time as `confirmBase`.

## Consult items: verification

1. **DISABLE/ENABLE copy (🟡 in the consult): met.**
   - The text lives in `/home/user/admin-pan/src/features/users/data/status.ts:8-11`. It matches my consult wording and what org-admin-api actually does (`users/service.py set_status`):
     - admin access ends on the next admin request;
     - tokens already held by other apps last up to `APP_TOKEN_MAX_HOURS` (12, a single constant in `assignments.ts:11`, pinned by `assignments.test.ts`);
     - sessions are revoked, join requests cancelled and links invalidated;
     - re-enabling does not bring back sessions or links.
   - The copy guard in `/home/user/admin-pan/src/features/users/data/status.test.ts:6-17` requires "next admin request" and "up to 12 hours". It rejects `signed out|logged out|immediately|every mmlabs app`.
   - The dialog test in `users-status-dialog.test.tsx:87-89` was updated to match.
   - Nothing overclaims.

2. **Permissions `send()` readiness and snapshot (🟡 in the consult): met.**
   - `role-permissions-dialog.tsx:106`: `send()` returns early on `inFlight || !ready || loadError`.
   - Lines 107-117 compare the sorted live `base` against `confirmBase`, which is captured at line 146 when entering confirm. On a mismatch the dialog goes back to edit with an alert and sends nothing.
   - `confirmBlocked` puts `aria-disabled` and an `aria-describedby` reason on "Remove and save" (lines 158-161, 286-300).
   - `ready` requires `fresh`, which excludes `isFetching` and placeholder data, so the button cannot send in the middle of a refetch.
   - Tests "no PUT when the role refetch fails during confirm" and "role changed during confirm…" (test file around lines 445-500) assert that zero writes happen.
   - The happy path (one sorted PUT) is still covered by the existing tests.

3. **CSS.escape in `focusOpener`: met.** It is at `/home/user/admin-pan/src/features/roles/components/roles-dialogs.tsx:19`. The test gap is Finding 1.

4. **Bidi/control stripping: met.**
   - `/home/user/admin-pan/src/lib/plain-label.ts` holds `toPlainLabel`. Its regex is the same as the old one, and `sanitizeUserAgent` is now a thin wrapper (`sessions.ts:20-22`).
   - It is used in the Choose aria-label (`/home/user/admin-pan/src/features/users/components/assign-pickers.tsx:189`), with a non-empty fallback `${noun} result ${n}`.
   - Unit tests in `plain-label.test.ts` cover C0/C1, bidi, zero-width, tag and interlinear characters, and line separators.
   - The browser test in `role-assign-dialog.test.tsx:821-856` checks the name `Choose Acmeevil`, that no bidi characters remain, and that a name made only of bidi characters still gets a non-empty label.

5. **Org error guard: met.**
   - `/home/user/admin-pan/src/features/users/components/role-assign-dialog.tsx:241` now reads `if (showOrg && !orgChosen)`.
   - The test at `role-assign-dialog.test.tsx:858-869` checks that no org error appears and no POST is sent. Its comment honestly says it guards latent behaviour.

**Other checks:**
- **Theme token change** (`/home/user/admin-pan/src/styles/theme.css:19-20,54-55`): it only changes the `--input` and `--ring` OKLCH values, and `theme-contrast.test.ts` reads the CSS through `?raw`. No security impact.
- **Unsafe rendering:** the diff adds no `dangerouslySetInnerHTML`, `innerHTML`, data-driven `href`, storage use, logging or direct `fetch`. New text comes from constants or React text nodes (role keys in the `<h3>`, the 422 message), and aria attributes take only ids and constants (R2, R3, R5 and R6 all hold).
- **Disabled menu items in `roles-row-actions.tsx`:** these moved from `disabled` to `aria-disabled` plus guards in `onSelect` and `onClick`. Both mouse and keyboard paths are guarded (tests at `roles-table.test.tsx:428-468`), and the `Can` gate is unchanged. The API stays the authority (R4).

## Follow-ups (outside PAN-030 scope, R7)
- The same unescaped-selector pattern still exists in `/home/user/admin-pan/src/features/apps/components/apps-dialogs.tsx:12-20` and `/home/user/admin-pan/src/features/apps/components/app-permissions-tab.tsx:40-44`. Share one `focusByData()` helper there; PAN-031 may already cover this, so check it.
- Lost update on the full-replace `PUT …/roles/{id}/permissions`: the snapshot check only narrows the window on this client. Propose an org-admin-api ticket for optimistic concurrency (ETag/If-Match or a version field) if one isn't already planned.

## Attempt 2

## PAN-030 security re-review, attempt 2 (`a9b48bc..HEAD`, commit 2c2bd67)

**Verdict: no blockers and nothing should-fix. Both Attempt 1 💭 items are resolved, and the rework did not weaken the `send()` guard, the snapshot check, the DISABLE/ENABLE copy, or the no-unsafe-rendering status.**

I read the whole source diff since a9b48bc and the surrounding code in `role-permissions-dialog.tsx`. I did not run the checks: in this mode I can only run `make check`, and this repo uses pnpm. So whether R8 checks are green is still for the reviewer to confirm.

### Attempt 1 items

1. **💭1, the CSS.escape test now watches for errors. Resolved.**
   - In `/home/user/admin-pan/src/features/roles/components/roles-table.test.tsx:470-492`, the test spies on `console.error` and adds a `window` `error` listener before opening Rename.
   - After the focus check it asserts there were no `console.error` calls and no window errors, then cleans both up.
   - Minor: the cleanup is not in a `finally`, so if an earlier assertion fails the spy and listener stay installed. That only affects later tests in the same file, not product code.

2. **💭2, a 403 during confirm no longer shows "Loading…". Resolved.**
   - In `/home/user/admin-pan/src/features/roles/components/role-permissions-dialog.tsx:151-167`, `forbidden` is excluded from `waiting`. `confirmReason` now says "You no longer have access to this role."
   - On the edit step, a 403 now gives no "Loading…" reason. The Save button keeps `aria-disabled` (`!ready`, line 326), and the ForbiddenPanel explains why in the body.
   - **No PUT is still guaranteed.** A 403 refetch puts `roleQ` in an error state, so `fresh` is false (line 79), which makes `ready` false. `confirmBlocked` (line 159) and the early return in `send()` (line 106) both depend on `!ready`.
   - The new test (`role-permissions-dialog.test.tsx:476-500`) checks that the button is `aria-disabled`, that its accessible description is the new text, and that zero writes happened.

3. **💭3, the confirm list comes from live `base`.** Not changed. That is acceptable: it was optional hardening, and the snapshot check still prevents any wrong write.

### Regression check
- **`send()` guard and snapshot:** lines 105-118 are unchanged. `confirmBlocked` is unchanged. The "refetch fails during confirm" test now also asserts that no stale-role alert appears and that the confirm button is still there.
- **DISABLE/ENABLE copy:** `src/features/users/data/status.ts` and its guard test are not touched by this diff.
- **Unsafe rendering:** none added. No `dangerouslySetInnerHTML`, `innerHTML`, data-driven `href`, storage, logging or `fetch`.
  - The new aria-label fallback in `/home/user/admin-pan/src/features/users/components/assign-pickers.tsx:189` changes only the fallback after `toPlainLabel` (`noun.replace(/s$/, '')`). `noun` is a constant, not API data, and the bidi/control stripping still applies first.
- **Other changes, no security impact:**
  - `searchInvalid={rejected && Boolean(term)}` in `apps-table.tsx:146` and `organizations-table.tsx:146` only changes the `aria-invalid` state.
  - The `button.tsx` focus-ring class change is styling only.
  - The `theme-contrast.test.ts` changes are test-only (sRGB compositing, plus a `?raw` import of `button.tsx`).

## Findings
- **💭** `/home/user/admin-pan/src/features/roles/components/role-permissions-dialog.test.tsx:476-500`: the 403 test asserts zero writes but never clicks "Remove and save" after the 403. The guard is correct by code inspection (lines 79, 83, 106). To prove it at runtime too, add `press(confirm)`, a short wait, then `expect(writes(seen)).toHaveLength(0)`, the same way the refetch-failure test does.
- **💭** `/home/user/admin-pan/src/features/roles/components/roles-table.test.tsx:488-491`: move the `mockRestore()` and `removeEventListener` calls into `try/finally` (or `afterEach`) so a failing assertion cannot leave them installed. This is test hygiene only.

## Follow-ups (outside PAN-030, unchanged from attempt 1)
- The same unescaped selector is still in `/home/user/admin-pan/src/features/apps/components/apps-dialogs.tsx:12-20` and `/home/user/admin-pan/src/features/apps/components/app-permissions-tab.tsx:40-44`. A shared `focusByData()` helper would fix both; PAN-031 may already cover it.
- Updates can still be lost on the full-replace `PUT …/roles/{id}/permissions`. Propose an org-admin-api ticket for optimistic concurrency (ETag/If-Match or a version field).
