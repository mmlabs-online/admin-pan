## Attempt 1 — 2026-11-16

### Library install (plan §1)
- `vendor/mmlabs-auth-client-0.1.0.tgz` copied from the scratchpad (it was already committed in the WIP commit; the copy is byte-identical). `sha256sum -c vendor/SHA256SUMS`: OK (`f1303c17…08f2`). The owner still confirms the hash against the release page before merge (ticket note); put it in the PR description.
- Read-only look at `package/package.json` (extracted into a scratch dir): no `preinstall`/`install`/`postinstall`/`prepare` scripts, no runtime `dependencies`, `react >=18` is an optional peer, exports are `.` and `./react`. Never built from `/home/user/mmlabs-auth`.
- `pnpm add ./vendor/mmlabs-auth-client-0.1.0.tgz`: dependency `file:vendor/mmlabs-auth-client-0.1.0.tgz`; the lockfile resolution has `integrity: sha512-3CIMh2nh…`. Not added to `onlyBuiltDependencies` (pnpm's "ignored build scripts: esbuild" warning is the existing one).
- The library is built with TS 7; `pnpm typecheck` passes against its `.d.ts` with our TS 6.0.

### Files touched
| File | Required because |
|---|---|
| `vendor/mmlabs-auth-client-0.1.0.tgz`, `vendor/SHA256SUMS` | Vendored release artifact and its checksum. |
| `package.json`, `pnpm-lock.yaml` | Dependency on the vendored tarball. |
| `Dockerfile` | `COPY vendor/` + `sha256sum -c` before `pnpm install`. |
| `.github/workflows/ci.yml` | `sha256sum -c vendor/SHA256SUMS` before install in the `check` job. |
| `eslint.config.js` | `@mmlabs/auth-client` only in `src/api` (+ tests, + `test-utils`); `useAccessToken` only in `features/auth/gate`. The http path/pattern lists became two constants to avoid repeating them in three blocks. |
| `src/api/auth-client.ts` (new) | Lazy singleton, `createAdminAuthClient`, `authTimeoutFetch`, `authFailure`, `Account` re-export. |
| `src/api/client.ts` | `bearerFetch` option; `/api/v1/auth/*` skips it; token attachment removed; `onError` notifies the gate for gate-relevant auth codes. |
| `src/api/auth-hooks.ts` | Removed `setAccessTokenProvider` / `getAccessToken`. |
| `src/api/errors.ts` | New kind `auth`; `NetworkError` → `network`, `ConfigurationError` → `config`, other `AuthError` → `auth`. |
| `src/api/index.ts` | Exports; `getApi()` passes `bearerFetch`. |
| `src/lib/safe-redirect.ts` (new) | One validator for the `redirect` value. |
| `src/lib/query-client.ts`, `src/lib/handle-server-error.ts` | `clearOnAuthChange`; `auth` errors are silent except rate limit. |
| `src/stores/session-recheck-store.ts` (new) | Bridge from final 401 to the gate. |
| `src/stores/auth-store.ts`, `auth-store.test.ts` | Deleted (no `__screenshots__` for it was tracked). |
| `src/main.tsx` | `AuthProvider`, `clearOnAuthChange`, unauthorized handler → recheck store, static config-error message. |
| `src/features/auth/gate/{auth-gate,use-access-check,use-return-to,access-pages,account-picker}.ts(x)` (new) | Guard, token check, access pages, account picker. `use-return-to.ts` is a 7-line helper shared by the gate, picker and pages (not listed in the plan; same folder). |
| `src/routes/_authenticated/route.tsx` | Renders `AuthGate`. |
| `src/routes/(auth)/sign-in.tsx` | `redirect` search schema (max 2048, `.catch(undefined)`). |
| `src/features/auth/sign-in/components/user-auth-form.tsx` | Rewritten on `useAuth().login`. |
| `src/components/sign-out-dialog.tsx` | `scope` account/all, names the target, not optimistic. |
| `src/components/layout/nav-user.tsx`, `src/components/profile-dropdown.tsx` | Real account, switch account, sign out (one/all); template Billing / Upgrade / Notifications / New Team removed. |
| `src/components/layout/{app-sidebar.tsx,types.ts,data/sidebar-data.ts}` | Mock `user` removed. |
| `src/test-utils/auth.tsx` (new) | Fake identity API (network layer), real `AuthClient`, `renderWithAuth`. |
| `docs/adr/0003-auth-client-integration.md` (new), `docs/adr/0001-api-client.md`, `README.md`, `.env.example` | Docs (plan §9). |

### Tests added / changed
- `src/lib/safe-redirect.test.ts` › rejected inputs → "/", keeps pathname+search / drops hash, auth pages fall back to "/"
- `src/api/auth-client.test.ts` › `createAdminAuthClient` (baseUrl, apiOrigins, appKey, config error); `authTimeoutFetch` (hung request aborts, Request passes through); `authFailure` table of all library errors
- `src/api/errors.test.ts` › AuthError → kind auth; NetworkError → network; ConfigurationError → config; fixed messages
- `src/api/client.test.ts` › provider cases removed; new "bearer transport" block with a real `AuthClient` on the fake API: Bearer via `bearerFetch`; `/auth/*` skips it; 401 refresh-once-and-retry; 401 twice notifies once; 403 does not notify; not_member / email_unverified / session_invalid from getToken → kind auth + one notification; rate_limited → retryAfter, no notification
- `src/api/auth-hooks.test.ts` › provider test removed
- `src/lib/query-client.test.ts` › auth not retried; `clearOnAuthChange`
- `src/lib/handle-server-error.test.ts` › auth rate_limited toast, other auth codes silent
- `src/features/auth/gate/auth-gate.test.tsx` › 12 tests: loading, signed-out redirect (no hash; none at "/"), restore from device cookie, no token in storage/cookie, no child/query until the token check, picker, accounts error + retry, 429, network + retry, config + request id, unauthorized signal + 60 s "rejected", account switch clears cache and re-checks
- `src/features/auth/gate/access-pages.test.tsx` › not_member page, unverified page (text only, no external link, no resend, no resend call), continue forces refresh, still unverified alert, other accounts listed
- `src/features/auth/sign-in/components/user-auth-form.test.tsx` › rewritten: single `/login` POST with credentials and no password elsewhere, validated redirect (and `//evil.com` → "/"), invalid credentials + cleared password, Turnstile reveal/token/reset, 429, network, no forgot link + hint, empty-field validation and no 7-char rule
- `src/components/sign-out-dialog.test.tsx` › rewritten: account scope, all scope, cancel, server failure
- `src/components/layout/nav-user.test.tsx` (new) › current account, switch account, no Billing / Upgrade items

### Checks (actual output summary)
- pnpm typecheck: `tsc -b` no errors
- pnpm lint: `eslint .` no output (clean)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`): Test Files 50 passed (50); Tests 345 passed (345)
- pnpm build: built OK (`✓ built in 1.68s`)
- `sha256sum -c vendor/SHA256SUMS`: OK
- Docker (Dockerfile changed): started `dockerd`, built from a scratchpad copy of the Dockerfile (adds the sandbox CA bundle and `NODE_EXTRA_CA_CERTS`; not committed, `Dockerfile.pan010` in the scratchpad) with `--network host`, `VITE_API_BASE_URL=https://api.mmlabs.online`, `VITE_APP_KEY=admin`; the `sha256sum -c` step and the build passed. `bash scripts/smoke-image.sh admin-pan:pan010 https://api.mmlabs.online`: "smoke test passed".
- pnpm e2e: not planned.

### Deviations from the plan (all small)
- **Redirect after sign-out.** The plan has `logout` → `reload` → `navigate('/')`. That races with the gate, which redirects to `/sign-in?redirect=<old page>` as soon as the list is empty. The dialog now navigates to `/` first, then calls `logout`; the library already clears local state before its request, so nothing is shown as signed out early. It does not call `reload()` itself: the provider's `logout` already does.
- **Gate redirect.** `<Navigate>` navigates again on every render and cancelled its own transition (the browser hung in the first test run). `RedirectToSignIn` uses one `navigate()` in an effect and freezes the `redirect` value at first render (the location becomes `/sign-in` while it is still mounted).
- **Sign-out server failure** with a device session that the server still lists ends on the account picker, not on `/sign-in` (local `mm_account_id` is cleared; accounts are listed again). The test asserts that.
- `renderWithAuth` takes an optional `extra` node (rendered inside the gate) so the dialog and NavUser tests need no extra router code, and it wires `clearOnAuthChange` like `main.tsx` does.
- API client tests import the fake identity API from `src/test-utils/auth.tsx` (that file imports `AuthGate`); the cycle is test-only.

### Out-of-plan files
- `src/features/auth/gate/use-return-to.ts` — tiny shared hook (see above). No other files.

### Follow-ups (noticed, not done)
- PAN-010b (resend verification), PAN-012c (`/forgot-password`, `forgotPassword()` in `src/api/public-auth.ts`, the "Sign in to request a new one" copy in `verify-email-panel.tsx`): as in the plan.
- Spec §5.1 still says resend and the forgot link belong to PAN-010: update it to the owner's 2026-11-16 decisions.
- ADR 0001 / Vite dev proxy: ADM-012 gives admin Bearer paths CORS, so the proxy and the README line about "no CORS yet" can go. Local dev still uses `VITE_API_BASE_URL=http://localhost:5173` through the proxy; I did not test it against a live org-admin-api here (tests never call a real server). The device cookie is `Secure` on `http://localhost`: needs a manual check (plan assumption 3).
- `requestId` on `ApiError`; CSP `require-trusted-types-for 'script'`; remaining template leftovers (team switcher, `/settings/account` link text "Settings" in the menu).
- org-admin-api: an endpoint with the caller's effective admin permissions, for PAN-011's permission-filtered navigation (never decode the JWT in the UI).
- `pnpm test` with `PLAYWRIGHT_CHROMIUM_PATH` is needed in this sandbox; `pnpm vitest` (not headless) cannot start Chromium here.

### Scope self-check
- Could the diff be smaller? No: the removed zustand store forces sign-in, sign-out and the shell user to change together (plan, "Split proposal"). About half of the diff is tests.
- Diff size: about +1650 / -520 lines including tests and the ADR (tracked files +926 / -524, plus ~725 lines in new files; the tarball and lockfile are excluded from this estimate).
- Not committed (the orchestrator commits).
