## Attempt 1 — 2026-11-17
Verdict: PASS

Base `origin/main` 8227348, head 7b57287. API reference org-admin-api 33db316 (`app/modules/app_credentials/{router,service}.py`, read-only).

### Checks (run by reviewer)
- pnpm typecheck: pass (`tsc -b`, exit 0)
- pnpm lint: pass (`eslint .`, exit 0)
- pnpm format:check: pass ("All matched files use Prettier code style!")
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): 82 files, 607 tests passed. Run 3 times in full, green every time. These counts match impl-log.
- pnpm build: pass (`✓ built in 1.68s`)
- pnpm e2e: 25 passed, including `pages.e2e.ts:214` "apps credentials: …" (5.6s)
- Flaky test note (impl-log): `app-status-dialog.test.tsx:56` (`toast.success … disabled`) passed in all 3 of my full runs. The file comes from PAN-015 (3972004) and this diff does not touch it. It is not a blocker for this ticket. It is recorded as a follow-up.

### Acceptance criteria
- [x] **Credentials list from the API, paginated.** It shows key id, created, last used and active/revoked.
  - Evidence: `app-credentials-tab.tsx:52-58` and `:131-236`. `queries.ts:117-134` sends `GET …/credentials?limit=20&offset=0`.
  - Tests in `app-credentials-tab.test.tsx`: `:43` (lazy fetch, `?limit=20&offset=0`), `:115` (rows, "Never", "Revoked <date>", no Revoke on revoked rows), `:148` (pager, offset=20 and back).
  - e2e `pages.e2e.ts:214` sees `e2e0000000000001`.
- [x] **Issue shows the full value once, with Copy and a warning. The value is never stored in the query cache, in state that outlives the dialog, in storage, in logs or in URLs.**
  - Data layer: `queries.ts:237-275`. The secret goes only to the caller's sink (`:260`), and the mutation resolves with metadata only (`:261`). It sets `retry: false` and `gcTime: 0` (`:263-264`), has no `mutationKey` and no `setQueryData`, and sets `handlesOwnErrors`, so the global `MutationCache.onError` (`src/lib/query-client.ts:57-61`) never toasts.
  - Dialog: the only holder is `useState` (`app-credential-issue-dialog.tsx:46`). It is cleared on `pagehide` and on unmount (`:54-61`) and on "I've saved it" (`:93-96`). The tab mounts the dialog only while it is open (`app-credentials-tab.tsx:240-246`).
  - Masking: the value is masked by default (`:156`). The input has no `name`, is outside any form, and has autocomplete off (`:145-157`). The status lines never contain the value (`:125-128`, `:180-186`). There is no toast on issue.
  - Tests in `app-credential-issue-dialog.test.tsx`:
    - `:165` leak regression. It dumps the mutation and query cache state while revealed, after Show and after close. After close it checks the DOM, local and session storage keys and values, `location.href`, console log/info/warn/error/debug and the toast mocks.
    - `:82` masked by default and the input attributes.
    - `:121` Copy without Show.
    - `:214` pagehide.
    - `:228` reopen shows no value.
  - `queries.test.tsx`: the sink gets the value, the result has no `credential`, and the mutation state has no secret.
  - e2e checks `page.content()`, storage and `page.url()` after close, and that exactly one POST was sent.
- [x] **Revoke confirms by naming the key id. It is non-optimistic, and the list refreshes after success.**
  - Evidence: `app-credential-revoke-dialog.tsx` (ConfirmDialog with the key id and app, an in-flight ref guard, `credential.id` in the path).
  - `app-credentials-tab.test.tsx:217` (cancel: no DELETE, focus goes back to the row).
  - `:234` covers four things: the row id is used, not the `key_id`; a double click sends one DELETE; the row stays "Active" until the held refetch is released, then shows "Revoked"; the toast names the key id.
  - e2e revoke step.
- [x] **API errors shown inline: 403 (including `admin:*` for issue) and 409 `admin_app` / `app_disabled` / limit.**
  - Code: `errors.ts:220-265`. The codes match the API: `admin_wildcard_required` at org-admin-api `app/core/errors.py:66`, and the `_refusal` reasons at service.py:60-102.
  - Tests:
    - `errors.test.ts` (new tables);
    - `app-credential-issue-dialog.test.tsx:242` (all 403/409/404 cases inline, the dialog stays in the confirm phase) and `:285` (502 is an unknown outcome: the Issue button is removed and the list is refetched);
    - `app-credentials-tab.test.tsx:285` (revoke 403/404 inline);
    - e2e second issue gets the inline `credential_limit` message.
- [x] **Loading, empty, error and 403 states tested with the fake fetch.** Evidence: `app-credentials-tab.test.tsx:59`.
- [x] **Plan row 6: `app_credential.*` audit labels.** Evidence: `src/features/audit-log/data/data.test.ts` (new) passes.

### Issues
None blocking. The 🟡 items below can be fixed in a later ticket. They do not cause REWORK.

#### Issue 1 — 🟡 should-fix — a11y: Show/Hide toggle double-encodes its state (from a11y-review #1)
- **Where**: `src/features/apps/components/app-credential-issue-dialog.tsx:158-170`
- **Expected**: a toggle button keeps a constant name and uses `aria-pressed`, or changes its name and has no `aria-pressed` (APG).
- **Actual**: `aria-pressed={shown}` and a label that flips between "Show" and "Hide". A screen reader says "Hide, toggle button, pressed". The plan asked for exactly this, so the implementer followed it.
- **Fix instruction**: keep the label "Show credential" with `aria-pressed`, and update the locators in the tests (`:110`, `:116`, `:188`, `:219`, `:233`) and in `e2e/pages.e2e.ts`. Or drop `aria-pressed` and keep the changing label.

#### Issue 2 — 🟡 should-fix — a11y: focus is lost when `pagehide` clears the value (from a11y-review #3)
- **Where**: `app-credential-issue-dialog.tsx:54-61` and `:136-141`
- **Expected**: focus stays inside the dialog that cannot be dismissed.
- **Actual**: the Copy button had focus. It unmounts with the value row, so focus falls to `<body>` after a bfcache restore.
- **Fix instruction**: when `issued && secret === null`, focus "I've saved it" through a ref.

### Rules R1–R11
No violations found.
- **R1**: the UI shows only API fields. It derives no active count and does not show `created_by`.
- **R2**: types come from the generated schema (`app-schema.ts`, `AppCredentialRead`). Only `src/api` makes HTTP calls, through `queries.ts`.
- **R3/R5**: see AC2. There is no new `VITE_*` var, and the fake constant is obviously fake (`src/test-utils/fake-credential.ts`).
- **R4**: the registry entries match the API's `require_permission` (router.py: POST and DELETE need `admin:apps:write`, GET needs `admin:apps:read`; `registry.ts:109-124`). Issue uses `Can` in disable mode with a reason (test `:201`). Revoke is hidden when the permission is missing. `admin:*` is a hint plus the inline 403, consistent with the PAN-015 owner rule.
- **R6**: values render only as React text or an input value.
- **R7**: every changed file is in the plan's list. `work/backlog.md` and `ticket.md` are workflow state.
- **R9**: covered by AC3. The issue dialog also has a confirm phase.
- **R10**: the a11y review has no 🔴. See Issues 1 and 2.

### Security / a11y blockers
None.
- There is no `security-review.md` in the ticket folder.
- `a11y-review.md` has no 🔴.
- a11y-review finding #2 (a race on focus after a successful revoke) is **not confirmed**:
  - Radix's modal `DialogContent` composes `onCloseAutoFocus` to call `preventDefault()` and then focus `triggerRef`. That ref is null here because there is no Trigger (`node_modules/@radix-ui/react-dialog/dist/index.mjs:146-149`, v1.1.15). So FocusScope never moves focus back to the row's Revoke button, and the tab's heading focus (`app-credentials-tab.tsx:44-50`) stands.
  - An e2e focus assertion is a fair follow-up.

### Nits (do not block)
- `app-credential-issue-dialog.test.tsx:285` is named "network failure and 502" but only exercises 502. The network kind is covered by `errors.test.ts` and goes through the same code path.
- If a revoke has an unknown outcome (network/5xx), the list is not refetched: `useMutationOptions` refetches only on 404/409, `queries.ts:153-155`. The message says "Check the list", but the user has to reopen the tab or press Retry for a fresh list.
- `app-credential-issue-dialog.tsx:125-128`: the `role=status` mounts with its text, so it may not be announced. The title and description cover it.

### Follow-ups (out of scope)
- Spec conflict (flagged in the plan): the ticket cites §5.3, but apps are §5.4, and §5.4 should list app credentials. This is a product-manager edit.
- The plan follow-ups stand: registry `alsoRequires: 'admin:*'`, showing `created_by`, an `mmak_` scrubber for any future reporter, a gitleaks pattern, the PAN-015 `querySelector` focus restores, and org-admin-api documenting the 404 and `admin:*` in OpenAPI.
- `app-status-dialog.test.tsx:56`: the toast assertion runs right after the dialog closes. impl-log saw it fail once under load. Consider `await expect.poll(() => toast.success).toHaveBeenCalledWith(…)` (or a wait) in a /solo change.
- e2e focus assertions after issue-close, revoke-cancel and revoke-success (a11y-review follow-up).
- ADR 0007 is "Accepted pending owner merge": the owner confirms it by merging.
