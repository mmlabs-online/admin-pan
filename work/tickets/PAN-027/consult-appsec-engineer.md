## PAN-027: appsec consult at PLAN (read-only)

The secret is easy to protect on the server side: it is stored only as a SHA-256 hash, sent with `Cache-Control: no-store`, and the list returns metadata only (`org-admin-api/app/modules/app_credentials/schemas.py:7-23`, `router.py:36-41`). The UI's real exposure is narrower: how long the `credential` string lives in JS memory and DOM, and where copies of it end up. There are no blockers in the existing code. Each item below is a requirement the plan should spell out, and each one is testable.

### Findings (existing code the plan must account for)

1. 🔴 **Default mutation handling would keep the secret in the TanStack MutationCache.**
   - `useMutation` puts the `mutationFn` return value into `mutation.state.data`. That cache is app-wide (`src/lib/query-client.ts:56`) and keeps unobserved mutations for `gcTime` (default 5 min).
   - It is also visible in ReactQueryDevtools in dev (`src/routes/__root.tsx:19-24`). It is not mounted in prod, which is fine.
   - The shared `useMutationOptions` (`src/features/apps/api/queries.ts:109-127`) does not set `gcTime`.
   - This breaks AC "never stored in query cache".
   - **Fix:** the issue hook must not return the secret from `mutationFn`. Hand it to a caller-supplied sink and return metadata only. Also set `gcTime: 0` and `retry: false`, following the precedent in `src/features/auth/api/mutations.ts:13-31`:
     ```ts
     mutationFn: async (onSecret: (v: string) => void) => {
       const { credential, ...meta } = unwrap(await api.POST('/api/v1/apps/{key}/credentials', { params: { path: { key } } }))
       onSecret(credential)
       return meta            // AppCredentialRead only
     },
     gcTime: 0, retry: false, meta: { handlesOwnErrors: true },
     ```
     Never put the secret in `mutationKey`, `meta`, the variables, `setQueryData`, or a zustand store.

2. 🟡 **A timeout or abort on the POST can leave an active credential that nobody holds.**
   - The client times out POSTs after 30 s (`src/api/client.ts:34-37`). The server may still have issued the key.
   - That key counts toward the limit of 2 and is a live secret that was never seen.
   - **Fix:**
     - On `kind: 'timeout' | 'network'` for issue, show: "The key may have been created. Check the list and revoke any key you don't recognise". Then invalidate the list.
     - Never auto-retry.
     - Disable the Issue button while pending (a double click would issue 2 keys and hit the limit).
     - Don't let the dialog close while pending (`onOpenChange` ignored, `onEscapeKeyDown`/`onInteractOutside` prevented). Otherwise the success lands after unmount and the secret is lost.

3. 💭 **Transport is already correct; don't weaken it.**
   - `cache: 'no-store'`, `credentials: 'omit'` and `referrerPolicy: 'no-referrer'` are forced per request (`src/api/client.ts:38-46`).
   - No service worker or PWA is registered (no workbox or registerSW in `src/`), and Playwright blocks SWs (`playwright.config.ts`).
   - The API is a separate origin from the nginx-served SPA, so the `index.html` `no-cache` rules (`nginx/default.conf:25-37`) don't touch API responses.
   - Requirement: no SW or PWA plugin may be added in this ticket. A future SW must not handle `/api/v1/apps/*/credentials`. Recorded as a follow-up.

4. 💭 **The existing error path is safe.**
   - `handleServerError` toasts only `error.message` (`src/lib/handle-server-error.ts`).
   - `ApiError` messages come from the API envelope or fixed strings (`src/api/errors.ts:105-155`). A failed POST carries no secret.
   - `no-console: 'error'` is enforced (`eslint.config`, line 43).
   - There is no Sentry or other error reporter in `src/`. If one is added later it needs a `mmak_` scrubber (follow-up).

5. 💭 **Clipboard has a precedent.** `src/features/audit-log/components/audit-log-detail-sheet.tsx:30-38` uses `navigator.clipboard.writeText` with a toast. `Permissions-Policy` (`nginx/security-headers.conf:8`) does not block `clipboard-write`. Reuse the pattern, but the toast must not include the value.

6. 💭 **Vitest failure screenshots are git-ignored** (`.gitignore:43-44`, `**/__screenshots__/`). CI uploads `playwright-report/` and `test-results/` on failure (`.github/workflows/ci.yml:55-61`), and `trace: 'on-first-retry'` (`playwright.config.ts:19`) records network bodies. Today that's harmless because e2e talks only to a fake API origin (ADR 0006). The fixture value must be obviously fake (see R9).

### Recommendations (requirements for plan.md)

- **R1 Scope of the secret.**
  - Hold it in local `useState<string | null>` inside the "issued" dialog component only. No context, store, URL search param or route state.
  - Set it to `null` on: dialog close, unmount, sign-out (unmount via the auth guard), and `window` `pagehide`. Clearing on `pagehide` stops the bfcache from restoring a DOM that still shows the key after Back navigation.
  - Render the dialog content conditionally (`{secret && …}`) so that Radix's closing animation or `forceMount` doesn't leave it in the DOM.
- **R2 Rendering.**
  - Show the value in a `readOnly` `<input type="text">` (or `<code>` with select-all) that sits **outside any `<form>`**.
  - Give it no `name`, plus `autoComplete="off"`, `spellCheck={false}`, `autoCorrect="off"`, `autoCapitalize="off"`, `data-1p-ignore`, `data-lpignore="true"`, `data-form-type="other"`.
  - Never use `type="password"`: it triggers password-manager save prompts.
  - Never use `contentEditable`: Chrome enhanced spell-check sends editable text to a remote service.
  - Label it with static text ("API key"). The value must not appear in `aria-label`, `title`, `data-testid`, `key` or `id`.
- **R3 Masking.** Mask by default (`mmak_<key_id>_••••`) with a "Show" toggle. Copy works without revealing. This limits exposure on screen-share, recordings and shoulder-surfing. The key_id is public and may stay visible.
- **R4 Copy.**
  - Copy only on an explicit button press, never automatically.
  - On success, toast "API key copied" without the value.
  - On failure, tell the user to select the text and copy it by hand. No `execCommand` hidden-textarea fallback appended to `body`.
  - Don't try to clear the clipboard later (unreliable, and it clobbers the user's clipboard). Instead warn: "Paste it into your deploy secret store now. Clipboard history or sync tools may keep a copy."
- **R5 Close friction.** The close button reads "I've saved it" (or requires a checkbox). Escape and outside-click must not dismiss the dialog silently. Optional: a `beforeunload` prompt while an unacknowledged secret is shown.
- **R6 After success.**
  - Invalidate only the credentials list key (e.g. `appsKeys.credentials(key, …)` under `appsKeys.detail(key)`).
  - Never `setQueryData` with the issued object.
  - The list row comes from `GET` (metadata only).
- **R7 Permissions (R4).**
  - Gate Issue on both `admin:apps:write` and `admin:*`. `permits(set, 'admin:*')` works (`src/lib/permissions/permits.ts:6-13`); check whether `registry.ts` needs an entry.
  - Gate Revoke on `admin:apps:write`.
  - Hide Issue for `ADMIN_APP_KEY` and disabled apps, but still handle 409 `admin_app` / `app_disabled` / the limit (`details[0].reason`) inline.
  - 403 shows the required permission.
- **R8 Revoke (R9).**
  - The confirmation names the `key_id` and app key, is non-optimistic, and invalidates the list.
  - The copy should state that revocation is immediate and deploy jobs using the key will fail.
- **R9 Test fixtures.**
  - Define a single constant, e.g. `FAKE_CREDENTIAL = 'mmak_0000000000000000_TEST-ONLY-not-a-real-secret-000000000000'`, in `test-data.ts` with a comment. Never generate random secret-shaped values.
  - Don't add an e2e test that displays a real-shaped issued key until the fake API also serves only that constant.
  - Mock `navigator.clipboard.writeText` with `vi.spyOn`. Don't grant real clipboard permission in the browser.
- **R10 Leak regression tests** (Vitest browser, fake fetch per ADR 0005). After issue then close, assert that `FAKE_CREDENTIAL` is absent from:
  - `document.body.innerHTML`
  - `JSON.stringify(queryClient.getMutationCache().getAll().map(m => m.state))` and the same for the query cache
  - `localStorage` / `sessionStorage`
  - `location.href`
  - a `console` spy's calls
  - toast text

  Also assert the copy button calls `writeText(FAKE_CREDENTIAL)`, and that a timeout on POST shows the "may have been created" message and refetches.

### Risks (accepted or residual)

- JS strings can't be zeroed. The secret stays in the V8 heap until GC. It is visible to anyone with devtools on that machine, to browser extensions with page access, and to XSS. Mitigations are CSP (`nginx/security-headers.conf:1`, `script-src 'self'`) and R6. Accept and document.
- The clipboard is outside our control: OS clipboard history, cloud sync and remote-desktop clipboard sharing. Covered by the warning text only.
- Screen recording and screenshots can't be prevented in the browser. Masking-by-default (R3) is the only control.
- A lost or unsaved secret leaves an active key. Mitigated by the 2-key limit, `last_used_at`, immediate revoke, and the UI copy in Finding 2.
- No expiry or label in v1 (ADR-0016 Consequences). Staff can't tell keys apart except by key_id and `created_at`.

### Open questions (for owner or planner)

1. Mask by default with a "Show" toggle (recommended), or show in clear?
2. Is a `beforeunload` prompt while an unacknowledged key is shown wanted, or is it too much friction?
3. Should the list show `created_by` (UUID only)? It would need a user lookup (R1). If the API lacks a name, raise a follow-up for org-admin-api instead of faking one.

### Follow-ups (out of scope)

- org-admin-api: `label` and `expires_at` on credentials (already listed in ADR-0016), so staff can tell keys apart and orphaned keys age out.
- admin-pan: if an error reporter (Sentry or similar) is ever added, add a `beforeSend` scrubber for `/mmak_[0-9a-f]{16}_[A-Za-z0-9_-]{43}/`.
- admin-pan: if a service worker is ever added, exclude all `/api/` requests from caching.
- Repo: a gitleaks or GitHub secret-scanning custom pattern for `mmak_…`, with an allowlist for the fake fixture constant.

### Relevant files

- /home/user/admin-pan/work/tickets/PAN-027/ticket.md
- /home/user/admin-pan/src/lib/query-client.ts
- /home/user/admin-pan/src/features/apps/api/queries.ts
- /home/user/admin-pan/src/features/apps/components/app-detail-sheet.tsx (lines 77-92: tabs, where a Credentials tab would go)
- /home/user/admin-pan/src/features/auth/api/mutations.ts (precedent for `gcTime: 0`)
- /home/user/admin-pan/src/features/audit-log/components/audit-log-detail-sheet.tsx (clipboard precedent)
- /home/user/admin-pan/src/api/client.ts
- /home/user/admin-pan/src/routes/__root.tsx
- /home/user/admin-pan/nginx/security-headers.conf
- /home/user/admin-pan/playwright.config.ts
- /home/user/admin-pan/.github/workflows/ci.yml
- /home/user/org-admin-api/app/modules/app_credentials/router.py
- /home/user/org-admin-api/app/modules/app_credentials/schemas.py
- /home/user/org-admin-api/docs/adr/0016-app-credential-auth-class-and-manifest.md
