Status: READY

# Plan: PAN-027, App credentials (list, issue, revoke)

Base: origin/main 8227348 (PAN-015 merged). API reference: org-admin-api 33db316 (read-only), `app/modules/app_credentials/{router,service,schemas}.py`, ADR-0016. The OpenAPI snapshot `src/api/openapi.json` / `schema.d.ts` already holds the three operations, so there is **no regeneration**.

## Spec summary
- Ticket "Spec reference" cites `docs/spec-v1.md` §5.3 "(apps)". **Conflict, flagged:** in admin-pan's spec §5.3 is *Organizations*. Apps are §5.4: "Apps registry (join policy, org mode, origins, default role), roles and their permissions, …". §5.4 does not list credentials explicitly. Scope comes from:
  - §2: "One web UI where internal staff do every cross-product admin task that org-admin-api exposes."
  - §7: "Every admin task org-admin-api supports can be done in the UI, without raw API calls."
  - §3 excludes only "Features org-admin-api does not offer". Credentials are offered (USR-05a DONE in 33db316).
  - So this is in scope. Follow-up: product-manager adds a credentials line to §5.4.
- §6: "No secrets in the bundle; access token in memory only (R3, R5)." The credential value gets the same treatment (ticket AC2).
- org-admin-api ADR-0016 §5: "Bearer `admin:apps:write` plus `admin:*` … Revoke needs `admin:apps:write` … Issuing is refused for the `admin` app (409 `admin_app`) and for disabled apps (409 `app_disabled`). The value is shown once, with `Cache-Control: no-store`; list returns metadata only." §3: "At most 2 active credentials per app … No expiry in v1. Revocation is immediate."
- ADR-0016 still says "Proposed — pending owner (approve by merging USR-05a)". USR-05a is merged (33db316), so this plan treats the contract as accepted.

## Acceptance criteria → verification
| # | Criterion (ticket) | How the reviewer verifies it |
|---|---|---|
| 1 | Credentials list (key id, created, last used, active/revoked) from the API, paginated | `app-credentials-tab.test.tsx` › "fetches GET …/credentials?limit=20&offset=0 only when the Credentials tab is opened", › "rows: key id (mono), Active / 'Revoked <date>' as text, Created, Last used or 'Never'", › "pager: total 25 → 'Showing 1–20 of 25', Next sends offset=20". e2e `pages.e2e.ts` › "apps credentials: …" sees the fixture key id. |
| 2 | Issue shows the full `mmak_…` once, with copy control and "you will not see this again" warning; value never in query cache, state outliving the dialog, storage, logs or URLs | `app-credential-issue-dialog.test.tsx` › "reveal: masked by default; Show puts the value in a read-only unnamed input; warning visible", › "Copy calls clipboard.writeText(FAKE_CREDENTIAL) and announces 'Copied'", › **"leak regression: FAKE_CREDENTIAL is never in the mutation or query cache (while open and after close), and after close not in the DOM, storage, URL, console or toasts"**, › "reopen shows no value". `queries.test.tsx` › "useIssueCredentialMutation hands the value to the sink and resolves with metadata only". e2e checks storage and `page.url()` after the flow. Grep: `credential` (the field) is read only in `queries.ts` `useIssueCredentialMutation` and handled only in `app-credential-issue-dialog.tsx`. |
| 3 | Revoke needs a confirmation naming the key id (R9); non-optimistic; list refreshed after success | `app-credentials-tab.test.tsx` › "revoke: confirm names key id and app; Cancel sends nothing, focus back to the row's Revoke", › "confirm sends DELETE …/credentials/{id} (row id, not key_id); row stays Active until the refetch; then 'Revoked'; focus on the stable heading; double click → one DELETE". e2e revoke step. |
| 4 | API errors inline: 403 (incl. `admin:*` for issue), 409 `admin_app` / `app_disabled` / limit of 2 | `errors.test.ts` › `credentialIssueError` / `credentialRevokeError` tables. `app-credential-issue-dialog.test.tsx` › "403 admin_wildcard_required and permission_denied → inline ForbiddenPanel; 409 admin_app / app_disabled / credential_limit / 404 → inline message; dialog stays open". Revoke 403/404 inline in the tab test. e2e: second issue on stoktok → inline `credential_limit` message. |
| 5 | Loading, empty, error and 403 states tested with the fake fetch (ADR 0005) | `app-credentials-tab.test.tsx` › "loading / empty 'No credentials yet.' / error + Retry / 403 inline". |
| 6 (from PAN-014 review) | `app_credential.*` audit actions get labels and tests | `src/features/audit-log/data/data.test.ts` (new) › "app_credential.issued/.revoked have non-neutral tones, appear in actionOptions; target 'App credential' in targetTypeOptions; search schema accepts them". |

Checks (R8): `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`), `pnpm build`, `pnpm e2e`.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/apps/api/queries.ts` | Add `CREDENTIALS_PAGE_SIZE = 20`, `CredentialsParams`, keys `appsKeys.credentialsAll(key)` = `[...detail(key),'credentials']` and `appsKeys.credentials(key,p)` = `[...credentialsAll(key), {limit,offset}]`, `appCredentialsQueryOptions`, `useIssueCredentialMutation` (sink design, §2), `useRevokeCredentialMutation` | AC1–3; the only data layer of the feature (R2) |
| `src/features/apps/api/queries.test.tsx` | Tests for the keys, list params and both mutations | R8 logic tests; AC2 |
| `src/features/apps/data/app-schema.ts` | `export type AppCredential = components['schemas']['AppCredentialRead']` (no `AppCredentialIssued` export: only `queries.ts` touches it, through the `api.POST` return type) | R2 generated types |
| `src/features/apps/data/errors.ts` | `isUnknownOutcome(error)`, `credentialIssueError(error)`, `credentialRevokeError(error)` | AC4; ADR 0004 copy by code |
| `src/features/apps/data/errors.test.ts` | Mapper tables | R8 |
| `src/features/apps/components/app-credentials-tab.tsx` (new) | List, pager, Issue button + hints, Revoke per active row, focus handling | AC1, AC3, AC5 |
| `src/features/apps/components/app-credential-issue-dialog.tsx` (new) | Two-phase dialog (confirm → reveal); the only holder of the secret | AC2, AC4 |
| `src/features/apps/components/app-credential-revoke-dialog.tsx` (new) | `ConfirmDialog` wrapper naming key id + app | AC3, R9 |
| `src/features/apps/components/app-credentials-tab.test.tsx` (new) | List states, rows, pager, gating, revoke | AC1, AC3, AC5 |
| `src/features/apps/components/app-credential-issue-dialog.test.tsx` (new) | Issue flow, errors, leak regression | AC2, AC4 |
| `src/features/apps/components/app-detail-sheet.tsx` | Third tab `credentials` "Credentials" after Permissions, mounted only when selected; description "App settings, permissions and credentials." | Entry point "from the app detail" |
| `src/features/apps/components/app-detail-sheet.test.tsx` | Replace "tabs are Overview and Permissions only" with "tabs are Overview, Permissions and Credentials (no Roles)" | The existing test asserts 2 tabs |
| `src/features/apps/components/test-data.ts` | `CREDENTIALS: Record<string, AppCredential[]>` fixtures + `credentialsPage(...)` | Shared fixtures |
| `src/features/apps/components/test-fixtures.tsx` | `appsServer` also answers `GET /api/v1/apps/{key}/credentials` from `CREDENTIALS` (regex gains `(\/permissions\|\/credentials)?`). `renderApps` takes an optional `queryClient` so the leak test can inspect the caches | Test harness |
| `src/test-utils/fake-credential.ts` (new) | `FAKE_CREDENTIAL` + `FAKE_KEY_ID`, no imports, with a comment | appsec R9: one obviously fake constant, shared by Vitest and e2e |
| `src/lib/permissions/registry.ts` | `apps.view` gains `'GET /api/v1/apps/{key}/credentials'`. New `apps.issueCredential` = `perm('admin:apps:write','POST /api/v1/apps/{key}/credentials')`, `apps.revokeCredential` = `perm('admin:apps:write','DELETE /api/v1/apps/{key}/credentials/{credential_id}')` | R4. `registry.test.ts` checks them against `x-permission` with no test change |
| `src/features/audit-log/data/data.test.ts` (new) | Tests for the `app_credential.*` entries | PAN-014 review follow-up (row 6) |
| `e2e/support/fake-api.ts` | Stateful credential routes (GET/POST/DELETE) per app; fake value only | AC2/AC3 e2e, ADR 0006 |
| `e2e/pages.e2e.ts` | New test "apps credentials: …" | e2e + axe on the new tab and dialogs |
| `docs/adr/0007-one-time-secrets-in-the-ui.md` (new, implementer writes) | Short ADR: how the UI handles any once-shown secret (sink, never in Query state, local state only, masked, cleared on close/unmount/pagehide, fixed fake fixture) | Rule 7: this decision outlives the ticket (future secrets, e.g. invitation links) |

No other file. In particular: no change to `src/api/*`, `src/lib/query-client.ts`, `confirm-dialog.tsx`, `components/ui/*`, `app-permissions-tab.tsx`, nginx or CI.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `queries.test.tsx` › "appsKeys.credentials(key,p) is under credentialsAll(key), which is under detail(key)" | keys |
| `queries.test.tsx` › "appCredentialsQueryOptions sends GET /apps/{key}/credentials?limit&offset and returns the page" | AC1 |
| `queries.test.tsx` › "useIssueCredentialMutation: POST with no body; sink receives FAKE_CREDENTIAL; resolves with metadata without `credential`; mutation state (data, variables) JSON has no FAKE_CREDENTIAL; invalidates credentialsAll(key) only" | AC2, the 🔴 fix |
| `queries.test.tsx` › "useIssueCredentialMutation: a 500 sends exactly one POST (retry:false) and invalidates credentialsAll(key); a 409 invalidates detail(key); a 201 without a string `credential` rejects with invalid_response and never calls the sink" | no retry, unknown outcome |
| `queries.test.tsx` › "useRevokeCredentialMutation: DELETE …/credentials/{credential_id} (204) invalidates credentialsAll(key); 404 also invalidates" | AC3 |
| `errors.test.ts` › "credentialIssueError: 409 admin_app / app_disabled / credential_limit / other 409 / 404 / 403 permission_denied + admin_wildcard_required → forbidden / network, timeout, 502, invalid_response → unknown-outcome text / other → fallback" | AC4 |
| `errors.test.ts` › "isUnknownOutcome: true for kinds network, timeout, aborted, invalid_response and http ≥ 500; false for 4xx, auth, config" | unknown outcome |
| `errors.test.ts` › "credentialRevokeError: 404 → 'This credential no longer exists.'; 403 → forbidden; unknown outcome → 'check the list; revoking again is safe'; other → fallback" | AC4 revoke |
| `app-credentials-tab.test.tsx` › "fetches GET …/credentials?limit=20&offset=0 only when the Credentials tab is opened" | AC1, lazy mount |
| `app-credentials-tab.test.tsx` › "loading / empty 'No credentials yet.' / error + Retry / 403 inline" | AC5 |
| `app-credentials-tab.test.tsx` › "rows: key id (mono), Active / 'Revoked <date>' as text, Created, Last used or 'Never'; revoked rows have no Revoke" | AC1, R10 (not colour only) |
| `app-credentials-tab.test.tsx` › "pager: total 25 → 'Showing 1–20 of 25', Next sends offset=20, Previous back to 0" | AC1 paginated |
| `app-credentials-tab.test.tsx` › "admin app: no Issue button, note 'The admin app has no credentials.'; disabled app: Issue natively disabled with 'Enable this app to issue credentials.' linked by aria-describedby; Revoke still shown" | R4 mirror |
| `app-credentials-tab.test.tsx` › "granted only admin:apps:read: Issue disabled with 'Requires admin:apps:write', Revoke hidden; list still shown" | R4, ADR 0004 |
| `app-credentials-tab.test.tsx` › "revoke: confirm names key id and app; Cancel sends nothing and focus returns to that row's Revoke button" | AC3, R9, R10 |
| `app-credentials-tab.test.tsx` › "revoke: confirm sends DELETE …/credentials/{id} (row id, not key_id); row stays Active until the refetch resolves; then 'Revoked'; toast names key id; focus on the 'API credentials' heading; double click → one DELETE" | AC3, non-optimistic, focus |
| `app-credentials-tab.test.tsx` › "revoke errors inline, dialog stays open: 403 → ForbiddenPanel; 404 → 'This credential no longer exists.' and the list is refetched" | AC4 |
| `app-credential-issue-dialog.test.tsx` › "confirm phase names app name and key; Cancel sends no POST; focus returns to Issue credential" | flow |
| `app-credential-issue-dialog.test.tsx` › "Issue: one POST with no body even on double click; pending 'Issuing…' aria-disabled; Escape, outside click and Cancel ignored while pending" | double submit, close while pending |
| `app-credential-issue-dialog.test.tsx` › "reveal: masked by default (DOM has `mmak_<key_id>_` + mask, not the secret); warning and status line visible; Show (aria-pressed) puts FAKE_CREDENTIAL in a readOnly input with no `name`, autoComplete off, spellCheck false, outside any form; Hide masks again; focus starts on Copy" | AC2, masking |
| `app-credential-issue-dialog.test.tsx` › "Copy calls navigator.clipboard.writeText(FAKE_CREDENTIAL) (vi.spyOn) without Show and announces 'Copied to the clipboard.'; a rejected writeText shows the manual-copy message" | AC2 copy |
| `app-credential-issue-dialog.test.tsx` › "reveal: no X button; Escape and outside click keep the dialog (and the sheet) open; only 'I've saved it' closes; focus returns to Issue credential; the list is refetched" | close friction |
| `app-credential-issue-dialog.test.tsx` › **"leak regression: FAKE_CREDENTIAL is never in the mutation or query cache (while open and after close), and after close not in the DOM, storage, URL, console or toasts"** | AC2 (key test, see Approach §2.6) |
| `app-credential-issue-dialog.test.tsx` › "pagehide clears the value: after dispatching pagehide the reveal shows 'This value was cleared' and FAKE_CREDENTIAL is not in the DOM" | appsec R1 (bfcache) |
| `app-credential-issue-dialog.test.tsx` › "reopening after close shows the confirm phase, no value" | AC2 "exactly once" |
| `app-credential-issue-dialog.test.tsx` › "403 admin_wildcard_required → 'Only super admins can do this'; 403 permission_denied → generic panel; 409 admin_app / app_disabled / credential_limit and 404 → their messages; the dialog stays in the confirm phase" | AC4 |
| `app-credential-issue-dialog.test.tsx` › "network failure and 502: 'may have been created' message, Issue button removed (only Close), credentials list refetched" | appsec 🟡 #2 |
| `app-detail-sheet.test.tsx` › "tabs are Overview, Permissions and Credentials (no Roles)" (replaces the 2-tab test) | tab |
| `src/features/audit-log/data/data.test.ts` › "app_credential.issued/.revoked: non-neutral badge tones (success/warning), listed in actionOptions; 'App credential' in targetTypeOptions; auditLogSearchSchema accepts action app_credential.issued and targetType app_credential" | PAN-014 follow-up |
| `registry.test.ts` (unchanged) | new registry entries match `x-permission` |
| `e2e/pages.e2e.ts` › "apps credentials: list, issue shows the value once (masked, Show), close; second issue hits the limit inline; revoke confirm names the key id; no value in storage or URL; axe on tab and dialogs" | AC1–4 end to end, R10 axe |

## Approach

### 1. Data layer (`queries.ts`, `app-schema.ts`)
- `appCredentialsQueryOptions(key, {limit, offset}, api)`:
  - `api.GET('/api/v1/apps/{key}/credentials', {params:{path:{key}, query}, signal})` plus `unwrap`.
  - `placeholderData: keepPreviousData`, the same shape as `appPermissionsQueryOptions`.
  - Order is the API's (`created_at DESC, id`). No client-side sort or filter (R1).
- `useRevokeCredentialMutation(appKey, api)`:
  - `mutationFn: (credentialId: string) => api.DELETE('/api/v1/apps/{key}/credentials/{credential_id}', …)` plus `unwrap` (a 204 is fine).
  - `...useMutationOptions(appsKeys.credentialsAll(appKey))`: refetch on success and on 404/409; `handlesOwnErrors`.
  - Default mutation `gcTime`; nothing secret is in it.
- `useIssueCredentialMutation(appKey, api)` is the appsec 🔴 fix and is **mandatory as written**:
  ```ts
  /** POST /api/v1/apps/{key}/credentials (201) — admin:apps:write + admin:* (API-only check).
   *  The value never enters TanStack state: it goes to the caller's sink; the
   *  mutation resolves with metadata only. No retry: a retry issues a second key. */
  mutationFn: async (onSecret: (credential: string) => void): Promise<AppCredential> => {
    const { credential, ...meta } = unwrap(
      await api.POST('/api/v1/apps/{key}/credentials', { params: { path: { key: appKey } } })
    )
    if (typeof credential !== 'string' || !credential) throw new ApiError({ kind: 'invalid_response', status: 0, code: 'invalid_response', message: 'The server returned no credential' })
    onSecret(credential)
    return meta
  },
  retry: false, gcTime: 0, meta: { handlesOwnErrors: true },
  onSuccess: () => invalidate appsKeys.credentialsAll(appKey),
  onError: (e) => 404/409 → invalidate appsKeys.detail(appKey) (app status or the list changed);
                  isUnknownOutcome(e) → invalidate appsKeys.credentialsAll(appKey)
  ```
  - No `mutationKey`.
  - Never `setQueryData` with the result.
  - The variables are the sink function: it serialises to nothing and closes over a React setter, not the value.
  - `meta` holds only the boolean.

### 2. Issue dialog (`app-credential-issue-dialog.tsx`)
Decisions on the consult disagreements are in "Specialist input used". Mechanics:

1. **Mount.** The tab renders `{issuing && <AppCredentialIssueDialog app open onOpenChange returnFocus />}`. Unmounting on close drops all of its state: this is the strongest clear.
2. **Shell.** It uses a Radix `Dialog` (not `ConfirmDialog`/AlertDialog), because the content switches phase.
   - `onOpenChange(false)` is ignored while pending or while the value is shown.
   - `onEscapeKeyDown` and `onInteractOutside` call `preventDefault()` in the same cases.
   - `showCloseButton={!pending && phase !== 'reveal'}`.
   - `onCloseAutoFocus`: `preventDefault()`, then `returnFocus()` (a ref to the Issue button), as in `app-permission-form-dialog.tsx`.
3. **Phase `confirm`.**
   - Title "Issue credential".
   - Description: "Issue a new credential for {name} ({key})? The value is shown once and can't be retrieved later. An app can have at most 2 active credentials. Issuing needs admin:apps:write and admin:*."
   - Footer: Cancel and "Issue credential".
   - Guard: synchronous `inFlight = useRef(false)` check-and-set before `await issue.mutateAsync(setSecret)`, reset in `finally`.
   - Pending state: `aria-disabled` with an early return, label "Issuing…", and an sr-only `role=status`.
   - On success, `setIssued(meta)` (metadata: key_id), then phase `reveal`, then `issue.reset()`.
   - On error, `setAlert(credentialIssueError(e))` inline (`ForbiddenPanel variant='inline'` or `<p role=alert>`), and the dialog stays open.
   - If `isUnknownOutcome(e)`, also `setUnknown(true)`: the "Issue credential" button is no longer rendered and Cancel reads "Close". This blocks a blind retry that could issue a second key.
4. **Phase `reveal`.** The value lives only in `useState<string | null>` in this component.
   - Title "Credential issued". A `role=status` line reads "Credential {key_id} issued. Copy it now; you won't see it again." It never contains the value.
   - A persistent `Alert`, not a toast or tooltip: "Copy this credential now and store it in your deploy secret store. It can't be shown again. Clipboard history or sync tools may keep a copy."
   - **Value field.**
     - Static `<Label htmlFor>` "Credential".
     - `<Input readOnly>` with no `name`, `autoComplete='off'`, `spellCheck={false}`, `autoCorrect='off'`, `autoCapitalize='off'`, `data-1p-ignore`, `data-lpignore='true'`, `data-form-type='other'`, `className='font-mono'`. It sits outside any `<form>`. Never `type=password`, never contentEditable.
     - Its value is `shown ? secret : \`mmak_${issued.key_id}_••••••••\``, so the secret is not in the DOM until Show.
     - The value never appears in `aria-label`, `title`, `id`, `key` or `data-*`.
   - **Buttons.**
     - "Show" / "Hide": `aria-pressed`.
     - "Copy": works while masked. On success, inline `role=status` "Copied to the clipboard." On failure: "Couldn't copy. Select Show, then select the value and copy it by hand." No `execCommand` fallback, no toast with the value. Copy only on click.
     - "I've saved it": the only way out. It sets the secret to `null`, then closes.
   - **Focus.** On entering reveal, focus moves to Copy (ref plus effect).
   - **Clearing.**
     - `useEffect` adds a `window` `pagehide` listener that sets the secret to `null`. The reveal then shows "This value was cleared. Revoke {key_id} if you didn't store it."
     - A cleanup sets it to `null` on unmount.
     - Sign-out unmounts the tree through the auth guard.
5. **Leak regression test (the key test).**
   - Render with an injected `testQueryClient()`.
   - `vi.spyOn` `console.log/info/warn/error/debug`; mock `sonner`'s `toast`.
   - Issue: the POST returns `{...metadata, credential: FAKE_CREDENTIAL}` with 201.
   - **While revealed:** `JSON.stringify(queryClient.getMutationCache().getAll().map(m => m.state))` and the same for `getQueryCache()` do not contain `FAKE_CREDENTIAL`.
   - Then Show. Then "I've saved it".
   - **After close,** `FAKE_CREDENTIAL` is absent from:
     - `document.body.innerHTML`;
     - both cache dumps;
     - every `localStorage`/`sessionStorage` key and value;
     - `location.href`;
     - all console spy calls;
     - all toast mock calls.
6. **No toast on issue success.** The dialog is the feedback, so the value can never reach a toast.

### 3. Credentials tab (`app-credentials-tab.tsx`)
- **Query.** `useQuery(appCredentialsQueryOptions(app.key, {limit: CREDENTIALS_PAGE_SIZE, offset}, api))`, rendered through `queryView`. The tab is mounted only while selected (as in the Permissions tab).
- **Header.**
  - `<h3 ref={heading} tabIndex={-1}>API credentials</h3>`.
  - Help text: "Deploy jobs use a credential to call org-admin-api for this app. An app can have at most 2 active credentials." It must not claim the manifest route exists (that is USR-05b, R1).
- **Issue control.**
  - **Admin app** (`ADMIN_APP_KEY`): no Issue button. Note: "The admin app has no credentials."
  - **Other apps:** `<Can action='apps.issueCredential' disable>`. The `Button` has a `ref` and `disabled={disabled || app.status === 'disabled'}`. `aria-describedby` joins Can's id and, for a disabled app, the id of the visible "Enable this app to issue credentials." text.
  - Static hint under it: "Issuing needs admin:*."
  - `admin:*` is **not** used as a gate (see decisions).
- **States.**
  - Forbidden: `ForbiddenPanel variant='inline'`.
  - Pending: `<p role=status>` "Loading credentials…".
  - Error: `role=alert` "Couldn't load credentials." plus Retry.
  - Empty: "No credentials yet."
- **Table.**
  - `aria-label="Credentials of {key}"`, `<th scope=col>`: Key ID (`font-mono`), Status, Created, Last used, plus Actions (`<span className='sr-only'>Actions</span>`).
  - Status: `Badge` with text "Active", or "Revoked" plus `<time dateTime={revoked_at}>{formatDate}</time>`. It uses `active` from the API and is never recomputed.
  - Created and Last used are `<time>`. A null `last_used_at` shows "Never".
  - `created_by` is not shown: it is a bare UUID, and resolving it needs `admin:users:read` (follow-up).
  - Wrapper: `overflow-x-auto`.
- **Pager.** Copy the Permissions tab block with `CREDENTIALS_PAGE_SIZE`, shown when `total > 20`. **No offset clamp:** rows are never removed (revoke keeps the row; app delete is not in the UI and gives a 404).
- **Revoke button.**
  - Active rows only. `<Can action='apps.revokeCredential'>` hides it when denied (ADR 0004: row actions are hidden).
  - `Button size='sm' variant='outline'` with the text "Revoke" and `aria-label="Revoke {key_id}"`. Outline is contrast-safe: no red text on a tinted background. The destructive colour appears only on the confirm button.
  - Refs go in `revokeButtons = useRef(new Map<string, HTMLButtonElement>())`, keyed by `id`. **No `querySelector` built from API data** (PAN-015 security-review follow-up).
- **Revoke focus.**
  - State `revoking: AppCredential | null` plus `focusAfter = useRef<{ kind: 'row'; id: string } | { kind: 'heading' } | null>`.
  - An effect on `revoking === null` focuses `revokeButtons.current.get(id)` after a cancel, or `heading.current` after a success. The row's button disappears after the refetch, so success always uses the stable heading.
- **Issue focus.** `returnFocus={() => issueButton.current?.focus()}`.

### 4. Revoke dialog (`app-credential-revoke-dialog.tsx`)
- `ConfirmDialog` with `handleConfirm`, `destructive`, `confirmText='Revoke'`, `pendingText='Revoking…'`, `isLoading={revoke.isPending}`, and `error` from `credentialRevokeError`.
- Title: "Revoke credential?"
- Description: "Revoke credential **{key_id}** of {name} ({key})? It stops working immediately and can't be restored. Anything that still uses it will be refused."
- A `useRef` in-flight guard.
- Success: `toast.success('Credential {key_id} revoked.')`, then close (`onDone('success')`).
- `onOpenChange` blocks close while pending and resets on close.
- Never optimistic: the row changes only after the list refetch.

### 5. Errors (`errors.ts`)
- `isUnknownOutcome(e)`: `isApiError(e)` and (`kind ∈ {network, timeout, aborted, invalid_response}` or (`kind==='http'` and `status >= 500`)).
- `credentialIssueError(e): AppAlert` is checked in this order:
  1. Unknown outcome: "We couldn't confirm whether the credential was created. Check the list and revoke any key ID you don't recognise."
  2. 409, by `firstReason`:
     - `admin_app`: "The admin app has no credentials."
     - `app_disabled`: "This app is disabled. Enable it before issuing a credential."
     - `credential_limit`: "This app already has 2 active credentials. Revoke one, then issue a new one."
     - any other 409: "The API refused to issue a credential for this app."
  3. Everything else goes to `fallback(e)`:
     - 403 → forbidden copy (`admin_wildcard_required` → "Only super admins can do this / This action needs the admin:* permission.", from `forbidden.ts`);
     - 404 → "This app no longer exists.";
     - other → the message, cut to 200 characters.
- `credentialRevokeError(e)`:
  - 404: "This credential no longer exists."
  - Unknown outcome: "We couldn't confirm the revoke. Check the list; revoking again is safe."
  - Otherwise: `fallback`.

### 6. Fixtures and e2e
- **`src/test-utils/fake-credential.ts`.** Comment: "Obviously fake; never generate secret-shaped values in tests (PAN-027, appsec R9)."
  - `FAKE_KEY_ID = '0000000000000000'`
  - `FAKE_CREDENTIAL = 'mmak_0000000000000000_TEST-ONLY-not-a-real-secret-000000000000000'`
  - It has no imports, so `e2e/support/fake-api.ts` can import it by relative path (`../../src/test-utils/fake-credential`). If Playwright cannot resolve it, the implementer records why in impl-log and duplicates it with a comment pointing to the source.
- **`test-data.ts` `CREDENTIALS`:**
  - stoktok: one active row (`last_used_at` set) and one revoked row;
  - calechip: one active row with `last_used_at: null`;
  - admin: `[]`.
- **`e2e/support/fake-api.ts`.** A per-install `creds: Record<string, AppCredentialRead[]>`, typed from `components['schemas']`: stoktok has 1 active row with `key_id 'e2e0000000000001'`; the others have none.
  - `GET /api/v1/apps/${key}/credentials`: `page(creds[key], query)`.
  - `POST /api/v1/apps/${key}/credentials`. Checks in this order:
    - `admin` → `json(409, {error:{code:'conflict', message:'conflict', details:[{field:'key', reason:'admin_app'}]}})`;
    - status `disabled` → `app_disabled`;
    - 2 or more active → `credential_limit`;
    - otherwise prepend a row with `key_id: FAKE_KEY_ID` and a fixed id `77777771-7777-4777-8777-777777777777`, then return `json(201, {...row, credential: FAKE_CREDENTIAL})` and register the row's DELETE route.
  - `DELETE /api/v1/apps/${key}/credentials/${id}`: one route per fixture row. It sets `revoked_at` and `active:false`, then returns null (204).
  - Only the fake constant is ever served.
- **`pages.e2e.ts` new test.** Viewport is 1280x800.
  1. `signIn('/apps')`, click "View stoktok", then `selectTab('Credentials')`. Expect `e2e0000000000001`. Run `expectNoSeriousA11y(page,'apps-credentials')`.
  2. Click "Issue credential". The dialog names stoktok. Click "Issue credential" in the dialog. Expect "Credential issued" and a value field that does not contain `FAKE_CREDENTIAL`. Run `expectNoSeriousA11y(page,'apps-credential-issued')`. Click "Show": the field has value `FAKE_CREDENTIAL`. Click "I've saved it". The dialog is hidden.
  3. `page.content()` does not contain `FAKE_CREDENTIAL`. `page.evaluate` over `localStorage`/`sessionStorage` finds nothing. `page.url()` does not contain it. Expect `api.count('POST /api/v1/apps/stoktok/credentials') === 1`.
  4. Click "Issue credential" again, then confirm. Expect the inline "already has 2 active credentials". Close.
  5. Click "Revoke e2e0000000000001". The alertdialog contains `e2e0000000000001`. Run `expectNoSeriousA11y(page,'apps-credential-revoke')`. Click Cancel: no DELETE. Repeat and click Revoke: one DELETE, and the row shows "Revoked".
  - No clipboard click in e2e (no permission grants). No `a11y-known-issues` entries.

### 7. ADR 0007 (implementer writes, ~30 lines)
"One-time secrets in the UI". It covers:
- The mutation hands the value to a sink and resolves with metadata only (`retry:false`, `gcTime:0`, no `mutationKey`).
- The value is held only in local state of the component that shows it, which is unmounted on close. It is cleared on `pagehide`.
- It is masked by default, copied only on click, with no toast or live region carrying it.
- Close is deliberate.
- A failure with an unknown outcome is shown as "may have been created" and is never auto-retried.
- Tests use one fixed fake constant, plus the leak regression test.
- Status: "Accepted pending owner merge (PAN-027)".

### Rules
- **R1:** shows only API data. No count of "N of 2 active" (cannot be derived from a page). No `created_by` name. Copy does not claim the manifest route exists.
- **R2:** generated types, and HTTP only through `src/api` via `queries.ts`.
- **R3/R5:** see §2. No new `VITE_*` var. No value in storage, URLs, logs, toasts or Query state. The transport already forces `cache:'no-store'`, `credentials:'omit'` and `referrerPolicy:'no-referrer'` (`client.ts:37-45`); do not touch it. No service worker.
- **R4:** registry entries; `Can` disable for Issue and hide for Revoke. `admin:*` appears as a hint text, not a gate. Every 403 is shown inline.
- **R6:** values render as React text or an input value only.
- **R7:** no `label`/`expires_at`, no manifest UI, no changes to `app-permissions-tab.tsx` (its `querySelector` stays a PAN-015 follow-up).
- **R8:** all six checks.
- **R9:** revoke confirms by key id and app, is non-optimistic, shows errors inline and invalidates the list. Issue also gets a confirm step.
- **R10:** labelled value field; status lines without the value; aria-pressed toggle; focus to Copy, back to the opener, or to the stable heading; not colour-only status; semantic table.
- **R11:** staff-only admin feature.

## Specialist input used
Decisions where the consults differ or leave questions open:
- **Secret never returned by `mutationFn` (appsec 🔴): adopted as mandatory.** It replaces the frontend option "read `mutation.data`, then `reset()`" and the api-platform option "`onSuccess` into local state". Those keep the value in `MutationCache` for at least one render and in devtools. The sink, `gcTime:0`, `retry:false` and `handlesOwnErrors` follow the precedent in `src/features/auth/api/mutations.ts`.
- **Single vs two-step issue (frontend Q3): two phases in one dialog.** A confirm phase comes first. Issuing burns one of only 2 slots and creates a long-lived external secret, so an accidental click is costly. One dialog component keeps the value local to it.
- **Masking (appsec R3 vs frontend "show selectable"): masked by default** with Show/Hide. Copy works while masked. While masked the value is not in the DOM at all. This is the safer option; listed for the owner.
- **Close friction (appsec R5 vs frontend Q4 "no checkbox"):** no checkbox. The only exit is a button labelled "I've saved it". Escape, outside click and the X are disabled in reveal. **No `beforeunload` prompt** (appsec Q2): `pagehide` clears the value instead. Both are listed for the owner.
- **`admin:*` gating (api-platform rec 4 and appsec R7 "gate on both" vs frontend F option (a)): not gated.**
  - Precedent: PAN-015 plan R4 says "`admin:*` is never mirrored as a gate (owner)". The PAN-015 ticket owner note says "show a note that `admin:*` is needed, and show the API's 403/409 inline". The app-edit and permission dialogs already follow this.
  - Mechanics: `PermissionSource.check()` is typed to `AdminPermission`, which excludes `admin:*`, and `Requirement` holds one permission. A one-off `permits(set,'admin:*')` hint would need a new context hook that bypasses the registry, and the registry tests could not check it.
  - Result: Issue is gated on `admin:apps:write` only, shows the static "Issuing needs admin:*." hint, and the 403 `admin_wildcard_required` is shown inline with the existing copy. A registry `alsoRequires: 'admin:*'` (or a super flag) is a follow-up covering all `admin:*` actions at once. Listed for the owner.
- **List permission in the registry (frontend F):** added to `apps.view` operations instead of a new unused `apps.listCredentials`. It has the same permission, is used by `<Can>` and is checked by `registry.test.ts`.
- **Timeout / network "may have been created" (appsec 🟡 #2, api-platform rec 2): adopted and widened.** It also covers 5xx and `invalid_response`, because a proxy 502/504 or a garbled 201 can follow a commit. After it, the dialog removes its Issue button so no blind retry is possible, and the list is refetched.
- **Leak regression tests with one `FAKE_CREDENTIAL` (appsec R9/R10): adopted.** The constant lives in an import-free module shared with e2e. Clipboard is mocked with `vi.spyOn`; no clipboard grants.
- **E2E fake (frontend H): adopted**, stateful (issue adds a row, revoke sets `revoked_at`, limit of 2 gives a 409), serving only the fake value. The appsec R9 condition ("only when the fake serves only that constant") is met.
- **Copy feedback:** inline `role=status` in the dialog rather than a toast. appsec allowed a toast without the value; inline keeps feedback next to the control and away from the toaster.
- **Admin app (frontend Q5):** the tab stays, with the note and no Issue button. The API returns an empty list for it (service.py:115-120 has no admin check on list).
- **Disabled app (frontend G):** Issue is disabled with a reason; Revoke stays.
- **Offset clamp (frontend D): rejected.** The list never shrinks (revoked rows remain).
- **"N active of 2" (frontend D): rejected** (R1; cannot be derived reliably).
- **`created_by` (api-platform Q2, appsec Q3): not shown.** Follow-up.
- **Error-code facts (api-platform):** `admin_wildcard_required`, `conflict` + `details[0].reason`, 404 undocumented in OpenAPI, revoke idempotent 204, DELETE uses the row `id`. Verified in service.py:77-142 and router.py. All are adopted.
- **appsec findings 3–6** (transport, error path, clipboard precedent, screenshots and traces): adopted as constraints. No code change is needed.
- **api-platform Q5:** no new client test for `no-store`. `client.test.ts` already covers the forced request options, and the response header is not enforceable client-side.

## Assumptions
- The ticket's "§5.3 (apps)" means admin-pan spec §5.4. Scope is covered by §2/§7 (see Spec summary).
- ADR-0016 is accepted by the merge of USR-05a (33db316). The contract read in service.py/router.py at 33db316 is final for v1.
- `GET …/credentials` for the `admin` app returns an empty page (no admin guard on list in service.py).
- English UI labels, as in every existing screen (spec §8 Q3 open).
- Page size 20 (API default). Credentials per app are few, but the list is unbounded over time.
- Radix nested dismissable layers: preventing Escape on the inner dialog does not close the outer Sheet. A test asserts it. If it does close the Sheet, the implementer handles it in the dialog (not in `ui/`) and records it.

## Needs owner's decision (non-blocking; the safer option is planned)
1. **Masking by default** with Show/Hide (planned) vs showing the value in clear.
2. **Close friction:** the "I've saved it" button only (planned) vs an extra "I have stored it" checkbox, and whether a `beforeunload` prompt is wanted (not planned).
3. **`admin:*` pre-gating** of Issue: planned as hint text plus the inline API 403, consistent with the owner's PAN-015 rule. If you want it disabled for non-super staff, a follow-up adds `alsoRequires: 'admin:*'` to the registry for every `admin:*` action.
4. Spec §5.4 should list app credentials (product-manager edit). The ticket's §5.3 reference is wrong.

## Blocking questions
None.

## Split proposal
None. One spec feature, no API or schema change. Production code is roughly 550 lines; tests are most of the diff. If attempt 1 runs well over this, the fallback split is PAN-027a (list + revoke + registry) and PAN-027b (issue + leak tests + ADR 0007).

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/apps` → detail sheet → tab **Credentials** | `admin:apps:read` (`apps.view`) | "Loading credentials…" / "No credentials yet." / "Couldn't load credentials." + Retry / inline ForbiddenPanel / table + pager | — | — |
| same, **Issue credential** dialog (confirm → reveal) | `admin:apps:write` (`apps.issueCredential`); API also needs `admin:*` (hint only) | "Issuing…" / — / inline alert (409 reasons, 404, unknown outcome) / inline ForbiddenPanel (incl. `admin_wildcard_required`) / masked value + Show + Copy + "I've saved it" | Issue → `POST …/credentials` | success: `credentialsAll(key)`; 404/409: `detail(key)`; unknown outcome: `credentialsAll(key)` |
| same, **Revoke credential** confirm | `admin:apps:write` (`apps.revokeCredential`) | "Revoking…" / — / inline alert / inline ForbiddenPanel / toast "Credential {key_id} revoked." | Revoke → `DELETE …/credentials/{id}` | `credentialsAll(key)` (success, 404, 409) |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| GET | `/api/v1/apps/{key}/credentials` | path `key`; query `limit` (20), `offset` | `Page_AppCredentialRead_` | 401 (client hook), 403 `permission_denied`, 404 `not_found` (generic), 422, 5xx/network (query error + Retry) | USR-05a (DONE, 33db316) |
| POST | `/api/v1/apps/{key}/credentials` | path `key`; **no body** | `AppCredentialIssued` (201; `credential` goes to the sink, never cached) | 403 `permission_denied` / `admin_wildcard_required`; 404; 409 `conflict` + `admin_app` / `app_disabled` / `credential_limit`; network/timeout/5xx/invalid_response → "may have been created" | USR-05a |
| DELETE | `/api/v1/apps/{key}/credentials/{credential_id}` | path `key`, `credential_id` = row `id` (uuid) | none (204) | 403; 404 "credential no longer exists" + refetch; network/5xx → "revoking again is safe" | USR-05a |

## Follow-ups (out of scope, R7)
- org-admin-api:
  - `label` and `expires_at` on credentials (ADR-0016 follow-ups);
  - declare the 404 responses and the `admin:*` requirement machine-readably in OpenAPI (e.g. `x-requires-super`);
  - a user name for `created_by`, or the UI resolves it via users once wanted.
- admin-pan:
  - registry `alsoRequires: 'admin:*'` for every `admin:*` action, if the owner wants pre-gating;
  - show `created_by`;
  - spec §5.4 line for credentials;
  - Sentry-style reporter (if ever added) needs an `mmak_` scrubber `/mmak_[0-9a-f]{16}_[A-Za-z0-9_-]{43}/`;
  - any future service worker must not cache `/api/`;
  - gitleaks / secret-scanning custom pattern for `mmak_…`, with an allowlist for `FAKE_CREDENTIAL`;
  - the PAN-015 `querySelector`-from-API-data focus restores in `apps-dialogs.tsx` and `app-permissions-tab.tsx` → `CSS.escape` or refs.
- USR-05b (manifest push): once live, the tab's help text can name the manifest route.
