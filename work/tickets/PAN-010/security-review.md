## Attempt 1

**Verdict: no blockers. 2 should-fix items and 5 notes.** I ran `pnpm typecheck` and `pnpm lint`; both pass. Tests and build are covered by the reviewer.

### Verified correct
- **R3:**
  - The token stays in memory only: the auth-store is deleted, the token lives in the library's TokenCache, and the gate only awaits `getToken()` without storing the result.
  - The library writes only `mm_account_id`.
  - The dist has no sessionStorage, IndexedDB or cookie writes, no `console`, no `eval` and no `innerHTML`.
  - The password is passed only to `login()`. The form resets the field in onSettled and uses `method='post'`.
- **R2:**
  - Admin paths go only through `bearerFetch` → `fetchWithToken`. `/api/v1/auth/*` bypasses it.
  - The library also refuses Bearer on auth paths and on any origin other than `apiOrigins`.
  - `credentials: 'omit'` and `redirect: 'error'` are set, and `X-MM-App` is stripped.
  - Lint restricts imports of the core package and of `useAccessToken`.
- **Open redirect:** every producer and consumer goes through `safeRedirect`. The schema is `.max(2048).optional().catch(undefined)`. The old hash-including 401 handler is removed, explicit sign-out carries no `redirect`, and table tests cover the attack strings.
- **Cache:** `clearOnAuthChange` cancels and clears queries on every library event, including cross-tab ones. `ReadyGate` is keyed on `accountId`.
- **Errors:** messages are fixed text and only `requestId` is shown. Email appears on screen only.
- **Turnstile:** it is sent only after `turnstile_required` and reset after every attempt.
- **CSP:** no change needed.
- **Vendored tarball:**
  - The SHA-256 matches `SHA256SUMS`, and the sha512 matches the lockfile integrity.
  - It has no install scripts. Its contents are `dist/`, the README and package.json.
  - The checksum check runs before install in both CI and the Dockerfile. release.yml builds through the Dockerfile.
  - The dist logic matches tag ts-v0.1.0 (65ff811). I spot-checked bearer, transport, accounts and react.

### Findings
- 🟡 **S1** `vendor/SHA256SUMS:1`
  - **Issue:** the hash is self-attested. CI and the Dockerfile only prove the tarball matches a hash committed in the same PR.
  - **Fix:** before merge, the owner confirms `f1303c170f5e2799f1d6cecd8c4684cf1ab20c8ef84d441bd75002f46b6108f2` against the ts-v0.1.0 release page and records the confirmation in the PR or ticket. This is a merge condition, not a code change.
- 🟡 **S2** `src/api/index.ts:9`
  - **Issue:** `getAuthClient` is re-exported from the public `@/api` barrel. Any feature could import it and call `getToken()` or `fetchWithToken()`, bypassing the R2/R3 lint guard. Today the only consumer is `main.tsx`.
  - **Fix:** remove the re-export, import it from `@/api/auth-client` in main.tsx, and add a lint restriction so that only `src/main.tsx` and `src/api/**` may import it.
- 💭 **N1** `sign-out-dialog.tsx:29-33`
  - **Issue:** the logout failure toast does not branch on the kind of failure. A `session_invalid` means logout already succeeded, and a 429 is not a network error.
  - **Fix:** branch on `authFailure(e).kind`.
- 💭 **N2** `safe-redirect.ts:113-118`
  - **Issue:** auth pages are blocked by exact lowercase match, so `/SIGN-IN` or `/%73ign-in` gets through. The worst case is a loop back to sign-in, not an open redirect.
  - **Fix:** compare `decodeURIComponent(pathname).toLowerCase()`.
- 💭 **N3** `client.ts:8-9`
  - **Issue:** `isPublicAuthPath` is weaker than the library's normalisation. It fails closed because the library refuses the request.
  - **Fix:** normalise the same way the library does.
- 💭 **N4** `user-auth-form.tsx:75-83`
  - **Issue:** the password sits in the TanStack mutation variables while the form is mounted, and it is visible in dev devtools. Nothing is persisted.
- 💭 **N5:** after a switch or logout in another tab, the cleared cache still shows the previous render until the provider reloads. The browser profile is the same, so this is acceptable.

### Follow-ups
- Rebuild `dist` from tag 65ff811 and diff it against the tarball.
- Add CODEOWNERS entries for `vendor/**`, `pnpm-lock.yaml` and `Dockerfile`.
- PAN-012c: the forgot-password call gets a 403.
- Trusted Types in the CSP.
- R4 permission mirroring from the API in a later ticket.
