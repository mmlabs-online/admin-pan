# Security review — PAN-012b

## Attempt 1

**Verdict: no blockers and nothing that must be fixed before merge.** Every V-1 to V-7 check holds in the code. `pnpm test` (Chromium): 45 files, 273 tests passed. Typecheck/lint/build not run (reviewer covers R8). No changes to dependencies, `index.html`, nginx, Docker or CI.

### Verified
- **V-1 One POST, explicit click only:** `onConfirm` only from the button's `onClick` (`verify-email-panel.tsx:42-72, 106`); no effect/loader/`beforeLoad`. Double click blocked by the `inFlight` ref (`:43-44`) and `disabled={mutation.isPending}` (`:106`). Tests: no request on mount (incl. StrictMode), two sync clicks → one request, Enter → one request.
- **V-2 Fragment token:** `useFragmentToken('/verify-email')` reused unchanged (`index.tsx:16`); missing/malformed token or `?token=` → `InvalidVerifyLink`, no button, no fetch (tested). Route `/(auth)/verify-email` hangs off root (`routeTree.gen.ts:71-75`).
- **V-3 Token only in the request body:** prop + `mutate` body only; not rendered, not in `value`/`data-*`/`aria-*`; tests check `document.body.innerHTML`, `location.href`, empty hash. Hook: `retry: false`, `gcTime: 0`, `meta: { handlesOwnErrors: true }`, no `mutationKey` (`mutations.ts:36-43`); no-toast test extended to verify (422) under `createQueryClient()`. No `console`.
- **V-4 `mutation.reset()` after terminal states:** in `onSuccess` and the 422 branch (`:50-57`); per-call `onSettled` still runs after `reset()` (query-core 5.99.0), so `inFlight` is released; cache-empty test after 204 and `token_invalid`; token kept and resent after 429/network.
- **V-5 Fixed texts:** any 422 → invalid/expired panel; 429 → `formatRetryAfter`; network/timeout → "Could not reach the server"; 500/403 → generic; test asserts server `'leak'` message never appears.
- **V-6** Success/invalid link to plain `/sign-in`; no token refresh.
- **V-7 Request shape:** `api.POST('/api/v1/auth/verify-email', { body })` (`public-auth.ts:27-29`), no header cast; client skips bearer on `/api/v1/auth/*` and forces `credentials: 'omit'`, `redirect: 'error'`, `cache: 'no-store'`, `referrerPolicy: 'no-referrer'`; tests assert no `Authorization`, no `X-MM-App`, `credentials === 'omit'`.
- **Third-party scripts:** no Turnstile import; `index.html` loads only `/src/main.tsx` (Google Fonts pre-existing).

### Findings
1. 💭 **Token stays in page memory after a terminal state** (`index.tsx:16`, `verify-email-panel.tsx:30-35`) — still in `useFragmentToken` state/prop; spent and unusable (button gone). Optional: lift `status` into `VerifyEmail`, or accept and note.
2. 💭 **Retry enabled immediately after a 429** (`verify-email-panel.tsx:58-61, 106`) — meets the minimum (no auto-retry); optional `retryUntil` disable with a test.
3. 💭 **No-toast check covers only 422** — optional 429 case in `mutations.test.tsx` under `createQueryClient()`.

### Follow-ups (out of scope, R7)
- PAN-010: remove the hash from the 401 `redirect` (`src/main.tsx:34`); refresh a signed-in session's token after verify.
- PAN-022: `Referrer-Policy`, CSP, `frame-ancestors 'none'`, self-hosted fonts.
- Ops / org-admin-api: register the production `admin` origin and `http://localhost:5173` on app `admin` (otherwise CORS looks like "Could not reach the server").
- Owner: dev-only "check origin registration" hint on the network-error state? (not implemented)
