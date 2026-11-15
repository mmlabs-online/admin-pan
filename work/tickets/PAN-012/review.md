## Attempt 1 — 2026-11-15
Verdict: REWORK

### Checks (run by reviewer)
- pnpm typecheck: clean (`tsc -b`, exit 0)
- pnpm lint: clean (`eslint .`, no output)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 44 files, 250 tests passed. Matches impl-log.
- pnpm build: "built in 1.23s". The working tree is still clean afterwards, so `routeTree.gen.ts` is in sync.
- api:types drift: running `openapi-typescript src/api/openapi.json` into a scratch file gives output identical to `src/api/schema.d.ts`. `openapi.json` and `schema.d.ts` are not in the diff.
- pnpm e2e: not planned.

### Acceptance criteria
- [x] AC1: forgot shows the same message for any email. Evidence:
  - `forgot-password-form.test.tsx › shows the identical confirmation for two different emails` and `› never renders the email after submit` pass.
  - `forgot-password-form.tsx:86-93` shows fixed copy, with no toast and no navigation.
- [ ] AC2: reset validates the password and handles expired/used tokens. Partly met:
  - Met: `reset-password-form.test.tsx` covers required/match (:63), the 128-character limit (:78), `weak_password` (:85), `token_invalid` (:95), 204 (:107) and 429/network (:120). `schema.test.ts` passes.
  - Not met: the plan's AC2 evidence "malformed or missing token shows invalid link and sends no request" does not exercise the behaviour. See Issue 1.
- [ ] AC4: tests for each state. Every planned test name exists and is green. However, the page-level token states (valid link, malformed link, hash stripped) have no real test. See Issues 1 and 2.
- [x] AC5: no bearer token on `/api/v1/auth/*` and tokens kept out of URLs. Evidence:
  - `client.test.ts:178-215`, the four "public auth paths" tests.
  - `public-auth.test.ts › never sets an origin header` and the reset test that checks for no X-MM-App or Authorization.
  - `client.ts:12-13`, `:56-58` and `:88-89`.
  - The hash strip is only checked against a mocked `replace`. See Issue 2.
- AC3 (verify-email) moved to PAN-012b and resend moved to PAN-010 (owner, 2026-11-15). Not assessed here.

### Issues
#### Issue 1 — 🔴 blocker — test gap for AC2 evidence (malformed or missing link)
- **Where**: `src/features/auth/reset-password/components/reset-password-form.test.tsx:55-61`. The behaviour it should cover is at `src/features/auth/reset-password/index.tsx:30`.
- **Expected**: The plan (AC2 row and the "Tests to write" table) lists `› malformed or missing token shows invalid link and sends no request` as evidence. That test should prove the page renders `InvalidLink` and makes no request when the fragment token is missing or malformed.
- **Actual**: The test renders `<InvalidLink />` directly. It never goes through `ResetPassword` or `useFragmentToken`, and `seen` stays empty because no client is ever created. The `token ? form : InvalidLink` decision has no test.
- **Fix instruction**: Rewrite this test in `reset-password-form.test.tsx` to render the page, `ResetPassword` from `../index`:
  - Wrap it in `QueryClientProvider`.
  - Add `useRouter: () => ({ history: { replace } })` to the existing `vi.mock('@tanstack/react-router')`. Here `replace` is a `vi.fn((p) => window.history.replaceState(null, '', p))`.
  - Cover three cases:
    - (a) No hash: the "Invalid link" heading and the `/forgot-password` link appear, and there is no "New password" field.
    - (b) `#token=short`: the same result.
    - (c) `#token=<43 valid chars>`: the "New password" field is shown.
  - For (a) and (b), assert that no request was made. Spy on `globalThis.fetch`, or assert that the form, and so the mutation, is not rendered.
  - Reset `window.history` to `/` after each case.

#### Issue 2 — 🟡 should-fix — unrecorded plan deviation in token capture, and the hash-strip tests are hollow
- **Where**: `src/lib/fragment-token.ts:19` (the `useState` initializer), `src/lib/fragment-token.test.tsx:31-41` and `reset-password-form.test.tsx:145-149`.
- **Expected**:
  - plan.md Approach step 2 says "reads `window.location.hash` once, inside a ref-guarded effect (or the route `beforeLoad`)".
  - "Specialist input used" explicitly **rejects** "a `useState` initialiser for capturing the token (it breaks under StrictMode, per appsec R-3)".
  - Any deviation must be listed under impl-log "Deviations from plan".
  - appsec R-3 tests: "after mount, `window.location.hash === ''` and `location.href` has no token".
- **Actual**:
  - The hook uses a `useState` initializer, and impl-log does not mention it.
  - The functional risk is low: React runs both StrictMode initializer calls in the same render, before the strip effect. That is exactly what has to be proven, though, and the test does not prove it:
    - the mocked `replace` never removes the hash;
    - nothing asserts it is called once;
    - nothing asserts the token survives the strip.
  - `reset-password-form.test.tsx:145-149` checks `location.href` but never puts the token in the URL, so it can never fail.
- **Fix instruction**: Either keep the `useState` initializer or switch to the plan's ref-guarded approach.
  - **If you keep it**, add an impl-log "Deviations from plan" entry explaining why it is StrictMode-safe. Then, in `fragment-token.test.tsx`, make the mocked `replace` call `window.history.replaceState(null, '', p)` and assert:
    - the token is still rendered after the strip;
    - `window.location.hash === ''`;
    - `window.location.href` does not contain the token;
    - `replace` was called exactly once (`toHaveBeenCalledTimes(1)`; call `replace.mockClear()` before render).
  - **If you switch**, the hook needs a third "not read yet" state. Otherwise the page briefly renders `InvalidLink` and moves focus to its heading. Keep the same test assertions.
  - In both cases, remove the location assertion from `reset-password-form.test.tsx:145-149` or fold it into the page-level test from Issue 1 case (c), where the URL really contains the token before mount.

### Rules R1–R11
No violations found.
- **R1**: only USR-04b endpoints are used.
- **R2**: HTTP stays in `src/api/`, and the types come from `schema.d.ts`. The `as never` cast at `public-auth.ts:17` is documented and covered by a test.
- **R3**: matches the amended exception:
  - `credentials: 'omit'` is forced (`client.test.ts › keeps credentials omit for auth paths`);
  - no `Authorization` header is sent;
  - `/reset-password` is a public `(auth)` route;
  - no token is stored.
- **R4**: not applicable; these are public endpoints.
- **R5**:
  - `VITE_TURNSTILE_SITE_KEY=` is in `.env.example` with no value.
  - The email, password and token never appear in a toast, the DOM or the URL.
  - Mutations use `gcTime: 0` and `retry: false`.
  - API `msg` text is never echoed (`password-errors.ts:19-41`).
- **R6**: no HTML sinks; the copy is fixed.
- **R7**: every implementer file is in the plan's file list. The `.test.tsx` renames are recorded as a deviation. The CLAUDE.md, spec and `work/` edits are the orchestrator's and were approved by the owner.
- **R9**: not applicable, and there is no optimistic UI.
- **R10**:
  - inputs have labels;
  - `aria-invalid` and `aria-describedby` are tested;
  - status panels use `role="status"` and move focus to their heading.
- **R11**: these are recovery flows for staff accounts.
- CORS: forgot sends only `Content-Type` and `X-MM-App`, which matches org-admin-api `app/core/cors.py:19`.

### Security / a11y blockers
None reported to the reviewer. `security-review.md` and `a11y-review.md` are not present yet; the orchestrator triggers them.

### Nits (do not block)
- `forgot-password-form.tsx:109`: the email `Input` has no `type='email'` and no `autoComplete='email'`. This predates the ticket, but the field was touched.
- `reset-password/index.tsx:21`: the token stays in page state after success or `token_invalid`. The plan says "drop the token" on success. The risk is negligible because the token is spent, but a `key` change or a lifted status would clear it.
- `public-auth.test.ts`: the planned name "202/204 resolve" exists only implicitly, through the forgot and reset happy-path tests.

### Follow-ups (out of scope)
- org-admin-api USR-08: decide whether auth-client takes over forgot, reset, verify and resend.
- org-admin-api docs: the OpenAPI marks the `origin` header as required on forgot, which forces the cast in `public-auth.ts`. `consumers.md` recommends `credentials: "include"` for forgot, which is not needed.
- org-admin-api ops:
  - register the admin origins on app `admin`;
  - add the admin host to `TURNSTILE_ALLOWED_HOSTNAMES`.
- PAN-010:
  - drop the hash from the 401 `redirect` (`src/main.tsx`);
  - own resend-verification.
- PAN-022:
  - CSP `script-src` and `frame-src https://challenges.cloudflare.com`;
  - `Referrer-Policy: no-referrer`;
  - SPA fallback and `no-store` on `/reset-password`.

## Attempt 2 — 2026-11-15
Verdict: PASS

### Checks (run by reviewer)
- pnpm typecheck: clean (`tsc -b`, exit 0)
- pnpm lint: clean (`eslint .`, no output)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): 44 files, 253 tests passed. Matches impl-log attempt 2.
- pnpm build: "built in 1.18s". `git status` is clean afterwards, so `routeTree.gen.ts` is in sync.
- api:types drift: `openapi-typescript src/api/openapi.json` into a scratch file is identical to `src/api/schema.d.ts`. Neither file is in the diff.
- pnpm e2e: not planned.

### Attempt-1 issues
- **Issue 1 (🔴, AC2 page-level test): fixed.** `reset-password-form.test.tsx › page token handling`:
  - The test renders the real `ResetPassword` from `../index`, with a `replace` mock that calls `history.replaceState`.
  - `no hash` and `#token=short`: the "Invalid link" heading and the `/forgot-password` link appear, there is no "New password" field, and the `globalThis.fetch` spy is not called.
  - Valid token: the form is shown, `location.hash === ''`, and the href no longer contains the token, which really was in the URL before mount.
- **Issue 2 (🟡, `useState` deviation and hollow strip test): fixed.**
  - The deviation is now recorded in impl-log attempt 2 "Deviations from plan".
  - `fragment-token.test.tsx` under StrictMode asserts:
    - the token is still rendered;
    - `location.hash === ''`;
    - the href has no token;
    - `replace` was called exactly once.
  - The strip effect only runs while a hash is present (`fragment-token.ts:20-22`), so the StrictMode re-run is a no-op.
  - The always-passing location assertion was removed from the form test.

### Security / a11y should-fix items
- **Security 🟡 (app-wide mutation toast): fixed.**
  - Both hooks set `meta: { handlesOwnErrors: true }` (`mutations.ts:20,29`), and `query-client.ts:42-47` skips them.
  - `mutations.test.tsx › failures do not trigger the app-wide error toast` uses `createQueryClient()` and fails both mutations with 422, and `toast.error` is not called. A control mutation without the flag toasts once, which proves the test can fail.
- **a11y 1 (focus after "sent"): fixed.** Shared `StatusPanel` (`src/features/auth/components/status-panel.tsx`) with a focused `h2`, used for "Check your email" (`forgot-password-form.tsx:93-98`) and the reset panels.
- **a11y 2 (silent Turnstile failure / disabled button): fixed.**
  - `turnstile.tsx:49-52,94-110` adds a `role='alert'` message and a Retry button that calls `api.reset`.
  - `forgot-password-form.tsx:134-143` adds the hint "Complete the verification to continue.", linked to the button through `aria-describedby`.
  - Untested, see Nits.
- **a11y 3 (server field errors): fixed.** `{ shouldFocus: true }` at `forgot-password-form.tsx:76-80` and `reset-password-form.tsx:71-75`.
- **a11y 4 (email input purpose): fixed.**
  - `type='email' autoComplete='email'` at `forgot-password-form.tsx:117-122`.
  - `noValidate` on the form is justified: without it, native validation would pre-empt the zod message. The existing invalid-email test still passes.

### Out-of-plan files
- `src/features/auth/components/status-panel.tsx`: new file. Justified by the a11y review (extract the shared panel), and listed under impl-log Deviations.
- `src/components/turnstile.tsx`: already in the plan's file list. The attempt-2 change is the a11y 2 fix.
- `src/lib/query-client.ts`: out of plan. Justified by the security should-fix. The change is minimal (a meta opt-out), and other mutations keep their behaviour (control assertion).

### Acceptance criteria
- [x] AC1: the forgot page shows the same message for any email.
  - Evidence: `forgot-password-form.test.tsx › shows the identical confirmation for two different emails` and `› never renders the email after submit` pass.
  - Fixed copy in `StatusPanel`, with no toast (now also proven against the app-wide cache).
- [x] AC2: reset validates the password and handles expired or used tokens.
  - Evidence: the `reset-password-form.test.tsx` state tests (required/match, 128 limit, `weak_password`, `token_invalid`, 204, 429/network) plus the new page-level malformed/missing/valid token tests.
  - `schema.test.ts` passes.
- [x] AC4: there are tests for each state. Every planned test name exists and is green, and the page-level token states are now really exercised.
- [x] AC5: no bearer token on `/api/v1/auth/*`, and the token is kept out of URLs.
  - Evidence: `client.test.ts` "public auth paths" tests and `public-auth.test.ts`.
  - The hash strip is now proven against the real `window.location` (fragment-token and page tests).
- AC3 (verify-email) moved to PAN-012b and resend moved to PAN-010 (owner, 2026-11-15). Not assessed here.

### Issues
None.

### Rules R1–R11
No violations found. Attempt-1 findings still hold, and attempt 2 adds nothing against the rules.
- **R5**: the only new `meta` is a boolean and holds no user data. The hard-coded hint copy reveals nothing.
- **R6**: no HTML sinks.
- **R10**: improved as listed above.

### Security / a11y blockers
None. `security-review.md` and `a11y-review.md` attempt 1 report no 🔴 items, and their 🟡 items are fixed as listed above.

### Nits (do not block)
- `turnstile.test.tsx`: no test for the new widget-error state. Missing assertions:
  - `error-callback` → `role='alert'` with "Verification failed";
  - Retry → `api.reset('w1')` and the alert disappears;
  - a later success clears the alert.
- `forgot-password-form.test.tsx`: the hint is not tested. Missing assertions:
  - the hint is shown and the button's `aria-describedby="turnstile-hint"` while there is no token;
  - the hint is gone once there is a token.
- Focus is not asserted in tests:
  - the `StatusPanel` heading on mount (`toHaveFocus()`);
  - the field after a server `setError`.
- `forgot-password-form.tsx:135`: the hard-coded `id='turnstile-hint'`. Prefer `useId()` in case the form is ever rendered twice.
- `status-panel.tsx:14`: `role='status'` together with a focused heading may be announced twice (a11y 💭 5).
- Carried from the security notes, not done: `mutation.reset()` after terminal states (the variables stay in the mutation until unmount; `gcTime: 0` drops them afterwards), and the `as never` header cast in `public-auth.ts`.

### Follow-ups (out of scope)
- Unchanged from attempt 1: org-admin-api USR-08 (auth-client ownership of forgot, reset, verify and resend), org-admin-api OpenAPI/`consumers.md` docs, ops (admin origins, Turnstile hostnames), PAN-010 (hash in the 401 redirect, resend), PAN-022 (CSP, Referrer-Policy, `no-store` on `/reset-password`).
- a11y follow-ups from `a11y-review.md`:
  - a per-route document title;
  - a `FormMessage` live-region decision;
  - axe runs in PAN-023;
  - a manual screen-reader pass on Turnstile.
