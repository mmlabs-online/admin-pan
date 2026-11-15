## Findings (PAN-012b delta)
- The verify-email endpoint is already in `src/api/schema.d.ts:324` (body `{token}`, 204, no X-MM-App). It has no wrapper yet. `public-auth.ts` has only forgot and reset.
- `useFragmentToken('/verify-email')` and the `/reset-password` page work as the pattern. The reset page already splits into token → form and token missing → `InvalidLink`.
- `StatusPanel` focuses its heading on mount. Reuse it for every terminal state. The a11y note about `role='status'` plus a focused heading double-announcing is open, so don't add a second live region around it.
- Reset's `expired` copy and `InvalidLink` both link to `/forgot-password`. For verify, the ticket wants "sign in to request a new one", so link to `/sign-in` (resend is PAN-010).

## Recommendations
**Add**
1. `src/api/public-auth.ts`: add `verifyEmail(api, body: components['schemas']['VerifyEmailRequest'])` as a plain `api.POST('/api/v1/auth/verify-email', { body })`. Name the schema type from `schema.d.ts`. Add a client test for the URL, the body, no `Authorization`/`X-MM-App`, and that 204 resolves.
2. `src/features/auth/api/mutations.ts`: add `useVerifyEmailMutation(api = getApi)` with `retry: false`, `gcTime: 0`, `meta: { handlesOwnErrors: true }`, and no mutationKey. Extend `mutations.test.tsx` with the same no-retry, no-toast and no-cached-variables assertions.
3. `src/features/auth/verify-email/index.tsx`: page `VerifyEmail`. Use `useFragmentToken('/verify-email')` and render `<VerifyEmailPanel token={token} />` when the token is present, otherwise `<InvalidLink>`.
   - Make the shared `InvalidLink` take a prop, or write a local `InvalidVerifyLink`. For verify the link goes to `/sign-in`, with the text "sign in to request a new email". Don't import reset's `InvalidLink`, because its copy is wrong here.
4. `src/features/auth/verify-email/components/verify-email-panel.tsx`: a `status` union `'idle' | 'success' | 'invalid'`. The mutation state covers verifying. Show the error text for 429/network from `mutation.error`, not extra booleans.
   - **idle**: a heading, one line of copy, and a button "Confirm my email". There is no auto-POST, so StrictMode and prefetchers cannot burn the token. Disable the button while `isPending` and show the Loader2 spinner. Add `aria-busy` on the container. Because the button stays mounted and disabled while pending, focus is not lost. Announce "Verifying…" in a persistent `role='status'` span (the one place a live region is useful).
   - **success** (`onSuccess`): `StatusPanel` "Email confirmed" with a `/sign-in` link (no `redirect` param).
   - **token_invalid**: `StatusPanel` "Link invalid or expired". Say "This link is invalid, expired or already used. Sign in to request a new one." and link to `/sign-in`. Don't claim to tell the cases apart.
   - **429**: inline `role='alert'` text "Too many requests. Try again in {formatRetryAfter(e.retryAfter)}." with the button kept enabled for a manual retry. A 429 does not consume the token. Optionally disable the button for the wait, but the ticket needs no countdown.
   - **network/timeout**: inline alert "Could not reach the server. Please try again." with the button as the retry. The token is kept in state because it was not consumed.
   - **other (5xx, 403, 422 validation_error)**: a generic alert. A 422 that is not `token_invalid` should also give the generic text, not the invalid panel.
   - After any terminal state (success, invalid), call `mutation.reset()` (PAN-012 follow-up), so no token variables linger. Do this in the `onSuccess`/`onError` callbacks or in an effect when `status` changes. Reuse the form-error mapper only as a small local `errorTextFrom(e)` to avoid duplicating the 429/network branching. Extract it to `features/auth/lib/` only if the reset form is touched, otherwise leave reset alone (R7).
   - Move focus to the alert after a failed submit. The button keeps focus, which is fine, because the `role='alert'` text is announced.
5. `src/routes/(auth)/verify-email.tsx`: thin, `createFileRoute('/(auth)/verify-email')({ component: VerifyEmail })`, with no search schema. Create it before `routeTree.gen.ts` is regenerated, then commit the regenerated tree. Check it hangs off root, not `_authenticated`, so it is outside the guard (R3).
6. Spec/docs: no change needed. R3 already names verify-email.

**Tests** (`verify-email/components/verify-email-panel.test.tsx` or `verify-email/index.test.tsx`, following `reset-password-form.test.tsx`). Render the real page `VerifyEmail` through `useFragmentToken` with the real `history.replaceState('', '/verify-email#token=' + 'a'.repeat(43))`. Inject the client through a stub `fetch` (`createApiClient({ baseUrl, fetch: stub })`), with no real network. Use `vi.waitFor` or `expect.poll`, not fixed sleeps (PAN-012 follow-up).
- missing or malformed fragment (`#token=short`, no hash, `?token=` only): invalid-link panel, link to `/sign-in`, and the stub `fetch` was never called.
- valid fragment: the button is rendered and the stub has had zero calls (no auto-POST). Assert the hash is stripped (`location.hash === ''`), the token is not in the DOM or in any `href`, and the strip is called once under StrictMode.
- click: exactly one POST to `/api/v1/auth/verify-email` with body `{token}`, no `Authorization`, and `credentials: 'omit'`. While the stub is pending, the button is disabled and the "Verifying…" status shows.
- success (204): "Email confirmed" with the heading focused and a `/sign-in` link. The button is gone, so a second submit is not possible.
- 422 `token_invalid`: "invalid or expired" panel, heading focused, `/sign-in` link. 422 `validation_error` → the generic alert, not the invalid panel.
- 429 with `Retry-After: 30` and `details.retry_after`: the alert shows "30 seconds" (use the formatter's output), the button stays enabled, and a second click sends the same token again.
- network failure (`fetch` rejects with `TypeError`): retry text, the button is enabled, and a retry then succeeds with the same token.
- 500 and 403: generic text, with no server `message` rendered (give the stub a `'leak'` message and assert it is absent).
- mutation hygiene: `mutations.test.tsx` covers no retry, `gcTime 0`, no toast, and `mutation.reset()` after terminal states (assert `mutation.data/variables` are cleared via a probe or via the query client's `getMutationCache().getAll()` being empty).
- a11y: heading focus after success and invalid, the button reachable by keyboard (Tab then Enter sends one request), and the alert has `role='alert'`.

## Risks
- A double click or a Strict re-render sends two POSTs, and the second gets `token_invalid`. `isPending` disabling the button covers this. Test with two rapid clicks → one request.
- `router.history.replace` can be overwritten by later navigation. The `/reset-password` tests already cover this with the real `history`. Reuse them (security-review attempt 2 flagged the router mock as sufficient, but verify-email can reuse the real-history approach).
- If the user reloads after the strip, they get the invalid-link panel and cannot confirm. This is accepted, since the email link can be re-requested at sign-in (PAN-010 owns resend).
- Nothing from the sign-in flow exists yet (mock), so the `/sign-in` link promises a resend UI that arrives with PAN-010. Note this in the plan.
- The app-wide `handlesOwnErrors` flag must be set, or the capped server message is toasted (security attempt 1 finding).

## Open questions
1. A 409 `email_already_verified` cannot occur on this endpoint (resend only). Confirm there is no extra case from the API's response list for verify (`schema.d.ts:324`), for example 403 for a disabled user.
2. Should 429 disable the button for the wait (a countdown), or just show the text and let the user retry? I recommend text only, as the ticket asks for "429 with wait time".
3. Keep the verify page "invalid link" copy distinct from reset's? I recommend yes: separate component text, shared `StatusPanel`.
