## BUG-003 consult: identity-access-engineer (read-only)

### Findings

1. **The library's timing confirms the root cause.** In `node_modules/.pnpm/@mmlabs+auth-client@file+vendor+mmlabs-auth-client-0.1.0.tgz_react@19.2.5/node_modules/@mmlabs/auth-client/dist/client.js:78-95`, `login()` calls `selectAccount()` before it resolves. `selectAccount()` stores `mm_account_id`, clears the token cache, emits `account-changed` and broadcasts. The `AuthProvider` (`dist/react/index.js:49-52`) answers that event with `void reload()`. `reload()` then awaits `listAccounts()` and sets the snapshot later. So when `login()` resolves, the snapshot is still the old one. For a signed-out user that is `signed-out`. In the account-switch case it is `ready` with the *previous* account. The provider's `login` (`react/index.js:60`) is a thin passthrough and never waits for the reload.
2. **The provider gives no "settled" signal.** The only way to know a fresh snapshot exists is to `await reload()` (a public API in `AuthState`). `reload()` never rejects; it catches internally. It is sequence-guarded (`seq`): a later call (for example from an other-tab broadcast) discards the result of an earlier one, so awaiting `reload()` means "a listing finished", not "my listing set the state". The repo already uses this pattern in `src/features/auth/gate/use-access-check.ts:94` (`reload().then(() => evaluate(true))`).
3. **Awaiting `reload()` and then navigating in `onSuccess` probably isn't enough.** `onSuccess` reads a stale closure, so it cannot see the new `status`. `setSnapshot` is a default-lane update made from async code. The router's navigation commits through its own store (`useSyncExternalStore` / transitions). I could not prove the snapshot update always commits before the target route first renders. If it doesn't, `AuthGate` sees `signed-out` again and `RedirectToSignIn` bounces. The robust approach is to navigate from an effect that observes the *committed* `status`. Then the gate is guaranteed to render with fresh provider state.
4. **`AuthGate` and return-to are correct as they are.** `RedirectToSignIn` (`auth-gate.tsx:47-59`) freezes `useReturnTo()`, which goes through `safeRedirect`. The form consumes it through `safeRedirect(redirectTo)`. The bounce is also why the second click lands on the right target: the `redirect` value survives the round trip. `auth-gate.tsx` needs no change for this bug.
5. **The query cache is cleared mid-login.** `main.tsx:57` wires `clearOnAuthChange`, so `login()`'s `account-changed` event calls `queryClient.clear()`. That also clears the mutation cache while the login mutation is in flight. The mutation keeps running and its options callbacks still fire. But the existing form test (`user-auth-form.test.tsx:61`, plain `new QueryClient()`) does not reproduce this wiring, and the test harness setup should.
6. **R3 stays intact.** The fix only needs `useAuth()` (`login`, `reload`, `status`, `accountId`). The token is never touched: the gate's `useAccessCheck` does the `getToken` membership check, and nothing is stored apart from the library's own `mm_account_id`.
7. **Stray file.** `src/features/auth/sign-in/components/__screenshots__/zz-repro.test.tsx/repro--status-seen-by-the-target-route-right-after-one-login-1.png` is left over from the deleted repro. It is git-ignored (`.gitignore:44`) and harmless, but should not be relied on.

### Recommendations

**R-1. Fix shape for the form (AC 2; R3).** File: `user-auth-form.tsx`.
- `mutationFn: async (v) => { const r = await login(v); await reload(); return r }`. This keeps the mutation pending through the reload, so the button stays busy (ticket technical note).
- `onSuccess: (r) => setSignedInAs(r.accountId)`. Keep the `onSettled` password and Turnstile reset as it is.
- Add an effect on `[signedInAs, status]` that navigates once, behind a `useRef` guard:
  - If `status` is not `loading` and not `signed-out`, navigate with `{ href: safeRedirect(redirectTo), replace: true }`.
  - `ready` opens the target.
  - `needs-account` goes to the target, where the gate shows the picker.
  - `error` goes to the target, where the gate shows its retry message.
- Keep the button disabled while `mutation.isPending || signedInAs !== null`. A second click must not start a second login.
- Do not call `selectAccount` (login already does) and do not call `getToken` in the form.
- Do not add a guard on `ready && accountId === signedInAs`. The snapshot update is queued before `setSignedInAs` in the same lane, so it is already fresh. A strict match would hang the form if another tab picked a different account in between, and the gate handles whatever account is stored.

**R-2. Signed-out after a successful login: don't bounce (AC 2).** This happens when the device cookie was not kept or sent, or another tab logged out. If `signedInAs` is set and `status === 'signed-out'`:
- Do not navigate. Navigating would recreate the same silent bounce.
- Clear `signedInAs`, re-enable the form, and show a generic `role='alert'` message (for example "Could not start your session. Please try again.") with no email in it (R5).
- If a newer reload later turns the status `ready` (the superseded-reload case), the user can sign in again. Alternatively keep the effect live so it can still navigate. The planner should pick one.

**R-3. Edge cases the plan should cover (AC 1/2):**
- **Account switch:** status is `ready` as A, then "Use another account" and login as B. You must land as B. The form must not navigate on the stale A snapshot; the await plus the effect covers this.
- **Other-tab event during the window:** a broadcast `account_changed` or `logout` supersedes our `reload`. The effect re-runs on the newer status. A `logout_all` produces the R-2 path.
- **`needs-account` and `error`:** navigating is correct. The gate already renders the picker or `GateMessage` with Retry, and `reload` is exposed.

**R-4. Regression test (AC 1; ADR 0003).**
- Name it, for example, `'one sign-in reaches the protected redirect target without bouncing to /sign-in (BUG-003)'`.
- Build the router like `renderWithAuth`: an `AuthGate` layout around `/` and `/users`, with `clearOnAuthChange` wired. Use the real `UserAuthForm` on `/sign-in` with `redirect=/users`, the real `AuthProvider`, and `fakeIdentityApi` / `createTestAuthClient`.
- To make the window deterministic, delay the post-login `GET /api/v1/auth/accounts` handler (for example a promise released after `login` resolves, or a short `setTimeout`).
- Record pathnames with `router.subscribe('onResolved', …)`. Assert `/sign-in` never reappears after submit, the final path is `/users`, and `api.count('POST /api/v1/auth/login') === 1`.
- The test must fail on `origin/main`.
- Companion tests:
  - post-login accounts returns 401 `session_invalid`: alert shown, no navigation, one login;
  - accounts list without the logged-in id: picker shown;
  - accounts returns 500: gate retry;
  - account switch from a `ready` A: lands as B, and the token request uses `account_id` B;
  - button disabled until navigation.

**R-5. Existing tests (R8).** `user-auth-form.test.tsx` routes `/` to a gate-less stub. It still passes with the fix, but tests that count calls will now see two `GET /auth/accounts` per login: one from the `onChange` reload, one explicit. That cost is acceptable. It is the price of the only public "settled" signal.

**R-6. Library follow-up (out of scope, R7).** Propose to the auth-client owners: `AuthProvider.login` should `await reload()` before resolving, or expose a settled snapshot or promise. That would remove the double listing and this whole class of bug for other apps.

### Risks
- An effect-driven navigation that is not guarded by a ref could fire twice if the status changes `ready` → `needs-account` before the route unmounts. StrictMode is not the concern, because the dependency change happens after mount.
- The superseded-reload case can briefly show the R-2 message even though a newer listing is about to return `ready`. This is rare (needs an other-tab event inside a sub-second window) and self-heals if the effect stays live.
- Any fix that only awaits `reload()` and navigates in `onSuccess` may pass the test in Chromium yet stay timing-dependent. A deliberately delayed accounts handler plus asserting no visit to `/sign-in` is what keeps the test meaningful.
- The extra listing request counts against any rate limit on `/auth/accounts`. This is negligible for one login.

### Open questions
1. Signed-out after a successful login: stay on the form with a message (recommended), or navigate and let the gate bounce?
2. On `error` after login, should the form navigate (the gate shows Retry, as recommended) or show the error inline on the form?
3. Does the owner want the R-6 library follow-up filed now against the auth-client source repo?
