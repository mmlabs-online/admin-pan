## Attempt 1 — 2026-11-15
Verdict: PASS

### Checks (run by reviewer)
- pnpm typecheck: clean (`tsc -b`, exit 0)
- pnpm lint: clean (`eslint .`, no output)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): 45 files, 273 tests passed. This matches impl-log.md.
- pnpm build: "built in 1.06s". `git status` was clean afterwards, so the route tree is in sync.
- api:types drift: `pnpm api:types` regenerated `src/api/schema.d.ts` with no diff.
- pnpm e2e: not planned.

### Acceptance criteria
- [x] Route `/verify-email` reads the token from the URL fragment only, validates it, and strips it from the URL.
  - Evidence:
    - `src/features/auth/verify-email/index.tsx:16` calls `useFragmentToken('/verify-email')`. That hook uses a regex check and `#token=` only, and its existing StrictMode test shows the hash is stripped exactly once (`src/lib/fragment-token.test.tsx:31-45`).
    - Tests in `verify-email.test.tsx` › page: `no hash`, `malformed token (#token=short)` and `?token= in search only` each show the invalid link and send no request (`fetch` spy). `valid fragment …` shows the button, sets `location.hash === ''`, and the token appears neither in the href nor in `innerHTML`. All pass.
    - `src/routeTree.gen.ts:71-75`: `getParentRoute: () => rootRouteImport`, so the route sits outside `_authenticated` (R3).
- [x] An explicit "Confirm my email" button sends one `POST /api/v1/auth/verify-email`.
  - Evidence:
    - Panel tests `no request on mount`, `click sends exactly one POST with {token}, no Authorization / X-MM-App, credentials omit` and `double click sends one request` (ref guard at `verify-email-panel.tsx:43-44`).
    - `public-auth.test.ts` › `verify sends body {token} …; 204 resolves`.
    - The endpoint, body and 204 match org-admin-api `app/modules/auth/router.py:273-291`.
- [x] States: invalid link, verifying, success (link to `/sign-in`), `token_invalid` ("…sign in to request a new one"), 429 with wait time, network retry.
  - Evidence: one test per state, all passing:
    - pending (disabled button + `role=status` "Verifying…")
    - 204 (focused heading, `/sign-in` link, button gone)
    - 422 `token_invalid` and 422 `validation_error` (invalid-or-expired panel)
    - 429 ("Try again in 30 s", button enabled, same-token resend)
    - network (alert, then a retry that succeeds with the same token)
    - 500/403 generic ("leak" is never rendered)
- [x] Tests for each state. All the tests listed in the plan exist and pass. The page also has a keyboard test and a terminal-state mutation-cache-cleared test.

### Issues
None.

### Rules R1–R11
No violations found.
- R2: HTTP only via `src/api/public-auth.ts:27-29`, with the generated `VerifyEmailRequest` type.
- R3: public exception applied: `credentials: 'omit'` and no bearer token (asserted). The route is outside the guard.
- R4: the endpoint declares no `admin:*` permission. A 403 falls into the generic alert.
- R5: the token appears only in the request body. The hook has `gcTime: 0`, no `mutationKey`, and `handlesOwnErrors` (`mutations.ts:36-43`), and the no-toast test now includes verify. The `/sign-in` link carries no `redirect`.
- R6: only fixed strings are rendered.
- R7: no out-of-plan source files. The `work/` changes are orchestrator bookkeeping.
- R9: n/a.
- R10: the button is labelled, the heading takes focus, `role=alert` and `role=status` are used, and the keyboard test passes.

### Security / a11y blockers
None. No `security-review.md` or `a11y-review.md` for PAN-012b existed at review time; the orchestrator adds any 🔴 items from them.

### Nits (do not block)
- `verify-email/index.tsx:25-27`: the CardDescription "Confirm the email address of your account." nearly repeats the panel line "Confirm the email address for your mmlabs account." (`verify-email-panel.tsx:97`).
- The page test does not assert `replace` was called exactly once with `'/verify-email'` as the plan wording says. This is covered by `fragment-token.test.tsx:31-45`.
- Panel request tests do not run under StrictMode. "No request on mount" under StrictMode is covered by the page test's `fetch` spy, because `client.ts:23` looks up `globalThis.fetch` at call time.

### Follow-ups (out of scope)
- These follow-ups are already listed in plan.md:
  - PAN-010: fresh token after verify, and resend.
  - Reset/forgot: `mutation.reset()`.
  - org-admin-api ops: register the admin origins.
  - PAN-022: no-store, SPA fallback and CSP for `/verify-email`.
  - PAN-023: axe run.
  - `StatusPanel` may double-announce.
