PAN-012b security consult (PLAN, appsec-engineer): delta only

PAN-012b can be built safely on what PAN-012 already merged. No blockers. Everything below is verify-specific; nothing from the PAN-012 consult or reviews is repeated.

## Findings

**F1. The endpoint needs no auth and no app header.**
- `POST /api/v1/auth/verify-email` is public: no cookie, no `X-MM-App`, no Turnstile, only a per-IP rate limit (`org-admin-api/app/modules/auth/router.py:274-291`).
- It returns 204 with `Cache-Control: no-store`, and only 422 or 429 as errors.
- The generated op type declares `header?: never` (`src/api/schema.d.ts:2227`). So the `as never` header cast used for forgot is not needed here. Call `api.POST('/api/v1/auth/verify-email', { body: { token } })` and add nothing else.

**F2. Verify is idempotent only after it succeeds** (`email_verification.py:96-111`).
- Repeating an already-used token for an already-verified user returns 204.
- Any other repeat returns 422 `token_invalid`. That includes an inactive user, or a token invalidated by a newer resend.
- The plan's state mapping must treat 204 as success every time. It must not show a "second click" as an error.

**F3. CORS still applies even though there is no app header.**
- The path is under `/api/v1/auth/`, and the JSON body triggers a preflight. The preflight is answered only for origins in `apps.origins` (`app/core/cors.py:41-81`).
- From an unregistered origin, the browser blocks the POST before it is sent. The page then sees a `TypeError`, which is the same as a network failure, so the "network retry" state would loop forever.
- The `admin` origin, plus the local dev origin, must still be registered on app `admin`.

**F4. The 401 redirect hazard from PAN-012 F7 still exists** (`src/main.tsx:34`, where `href` includes the hash). The client already skips `notifyUnauthorized` for `/api/v1/auth/*`, and verify never returns 401. The fix itself stays in PAN-010.

**F5. Only fonts load from third parties.** `index.html` loads Google Fonts and no other third-party script. Turnstile is imported only by the forgot form. Nothing new is needed as long as the verify page does not import `src/components/turnstile.tsx`.

## Recommendations

**V-1. Send exactly one POST, and only on an explicit click.**
- Fire `mutate({ token })` only from the button's `onClick`. Never fire it from `useEffect`, the router's `beforeLoad`/loader, or on mount.
- Why: StrictMode runs effects twice, which would mean two POSTs. Link scanners that run JS would also verify by themselves, and the click is the human intent check.
- Disable the button while `isPending` and after success. Also guard in the handler (`if (mutation.isPending) return`) so a double click cannot fire twice.
- Test: in StrictMode, mount the page, check that no request goes out, click once, check that exactly one request goes out. Also test that double-clicking makes one request.

**V-2. Reuse `useFragmentToken('/verify-email')` as it is.**
- It is already StrictMode-safe, checks the regex, and strips the hash through `router.history.replace`.
- If the token is missing or malformed, go straight to the "invalid link" state: no button, no request.
- The route must sit at `/(auth)/verify-email`, outside `_authenticated`. Check this in `routeTree.gen.ts`.

**V-3. The token stays out of everything except the request body.**
- It must not appear in the DOM (no hidden input, `value`, `data-*`, `id` or `aria-*`), the URL, search params, `mutationKey`/query keys, toasts or the console.
- Write the hook like the PAN-012 ones: `useMutation({ retry: false, gcTime: 0, meta: { handlesOwnErrors: true } })` with no `mutationKey`. The meta flag is required, otherwise the app-wide `onError` toasts the server message (the PAN-012 attempt-1 finding).
- Tests:
  - the token text never appears in `document.body`;
  - `location.hash === ''` after mount;
  - no `toast.error` under `createQueryClient()` on 422 and on 429.

**V-4. Clear mutation state after a terminal state.**
- On success and on `token_invalid`, record the outcome in local state (`'verified' | 'expired'`) and then call `mutation.reset()`. That drops `variables` (the token) from the mutation.
- Also stop holding the token in the page: a `consumed` flag that makes the token unusable is enough.
- Keep the token after 429 and after a network error, so Retry can resend it; the hash is already gone.
- This addresses the 💭 that PAN-012 carried over unresolved.

**V-5. Use fixed text for every state.**
- 422 `token_invalid`, and any other 422 (such as `validation_error`): "link invalid or expired; sign in to request a new one".
- 429: `formatRetryAfter(retryAfter)`. Keep Retry disabled until the wait has passed, or at least make sure it does not auto-retry.
- `TypeError`/network: "Couldn't reach the server" with a Retry button. Mention in the copy, or a dev-only hint, that a misconfigured origin looks the same (F3).
- Never render the server's `message` or `details`.

**V-6. Success links to `/sign-in` with no `redirect`/`next` parameter.** Do not try to refresh a signed-in session's token. That is PAN-010 (`consumers.md:91`).

**V-7. Tests to add on top of the ticket's per-state list:**
- the request has no `Authorization` and no `X-MM-App` header, and `credentials === 'omit'`;
- a malformed hash makes no request.

## Risks (residual)
- The browser's history list may still hold `#token=` (24 h lifetime, single use). This is the same inherent risk as for reset.
- Google Fonts is a third-party request on this page. It cannot see the fragment; removing it is PAN-022.
- An unregistered origin cannot be told apart from being offline in the UI (F3).
- Because verify needs a click, a user who never clicks stays unverified. That is intended, not a security risk.

## Open questions
1. Is the production `admin` origin, plus `http://localhost:5173` for dev and staging, already in `apps.origins` for app `admin`? This is the same question as PAN-012 Q4, and it now also blocks verify end to end.
2. Should the network-error state include a dev-only "check origin registration" hint (`import.meta.env.DEV`), or plain copy only?

## Follow-ups (out of scope, R7)
These are unchanged from PAN-012:
- PAN-010: drop the hash from the 401 `redirect`, and refresh the token after verify.
- PAN-022: `Referrer-Policy` header, CSP, self-hosted fonts.

Files referenced:
- /home/user/admin-pan/work/tickets/PAN-012b/ticket.md
- /home/user/admin-pan/src/lib/fragment-token.ts
- /home/user/admin-pan/src/api/public-auth.ts
- /home/user/admin-pan/src/features/auth/api/mutations.ts
- /home/user/admin-pan/src/main.tsx
- /home/user/admin-pan/index.html
- /home/user/org-admin-api/app/modules/auth/router.py
- /home/user/org-admin-api/app/modules/auth/email_verification.py
- /home/user/org-admin-api/app/core/cors.py
