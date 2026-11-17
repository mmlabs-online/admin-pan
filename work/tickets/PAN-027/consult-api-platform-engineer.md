## Findings (org-admin-api @33db316, read-only)

Router: /home/user/org-admin-api/app/modules/app_credentials/router.py. Service: .../service.py. Schemas: .../schemas.py. Repo: .../repository.py. ADR: /home/user/org-admin-api/docs/adr/0016-app-credential-auth-class-and-manifest.md.

### Endpoints and permissions
All three are Bearer `aud=admin` (router-level `current_admin`, router.py:18). `{key}` is the app KEY (string), not a uuid.

| Op | Path | Route permission (x-permission) | Extra requirement |
|---|---|---|---|
| list | GET /api/v1/apps/{key}/credentials (router.py:44-58; openapi.json:2937) | `admin:apps:read` | none |
| issue | POST /api/v1/apps/{key}/credentials, 201, no request body (router.py:27-41; openapi.json:3064) | `admin:apps:write` | ALSO `admin:*` (service.py:80 `require_super`) |
| revoke | DELETE /api/v1/apps/{key}/credentials/{credential_id}, 204 (router.py:61-73; openapi.json:3185) | `admin:apps:write` | none (service.py:125 docstring: no `admin:*`) |

`credential_id` is a uuid (the row `id`, NOT `key_id`). A non-uuid gives 422 `validation_error`.

The `admin:*` requirement is NOT in the OpenAPI x-permission. It is only in the 409 description text (router.py:33; schema.d.ts:2031). The UI must hard-code it: issue enabled only if the caller has `admin:write` plus `admin:*`. Check how PAN's permission matcher treats the `admin:*` wildcard. Per ADR §5 and service.py:35-37, `permits(perms, "admin:*")` means holding the literal wildcard.

### Shapes (schemas.py; schema.d.ts:697-751)
- `AppCredentialRead` (metadata only): `id` uuid, `app` string (the app key), `key_id` string (16 hex, public), `created_by` uuid|null, `created_at` date-time, `last_used_at` date-time|null, `revoked_at` date-time|null, `active` boolean (= `revoked_at` is null, service.py:57).
- `AppCredentialIssued` extends Read with one extra field, `credential: string`. It is the full `mmak_<key_id>_<secret>` value. It appears ONLY in the POST 201 body (schemas.py:22-23; schema.d.ts:710-711). List and revoke never return it.
- `credential` format: `mmak_` + 16 hex + `_` + 43-char urlsafe secret (ADR §3). The server stores only a SHA-256 hash, so it is unrecoverable.
- List response is `Page[AppCredentialRead]` = `{items, total, limit, offset}` (router.py:53-58). The generated type is `Page_AppCredentialRead_`.

### Pagination / ordering
Query `limit` (1..100, default 20) and `offset` (>=0, default 0) (app/core/pagination.py:13-14). A bad value gives 422. The ordering is fixed and not client-selectable: `created_at DESC, id` (repository.py:39). The list includes revoked rows, with no filter. Max active is 2, but total rows are unbounded over time, so paginate and do not assume small. `active` is derived server-side. Show `active`/`revoked_at`, and do not recompute it.

### Cache-Control
POST sets `Cache-Control: no-store` on the 201 (router.py:40; docstring :3). It is NOT declared in OpenAPI (grep of openapi.json found nothing), so it cannot be asserted from the generated types. The admin-pan client already forces `cache: 'no-store'` on every request (src/api/client.ts:42, 112). GET list sets no explicit header.

### Errors (envelope `{error:{code,message,details}}`, app/core/errors.py)
Ordering for issue: route permission, then app lookup (404), then `admin:*` (403), then the 409 checks.
- 401 `unauthorized`: missing or invalid token. The client already calls `notifyUnauthorized`.
- 403 `permission_denied` (route permission missing, incl. read for list). `details` is an object, per the ErrorBody doc, errors.py:123-127.
- 403 `admin_wildcard_required` on POST only: message "Requires admin:*", `details={"required":"admin:*"}` (errors.py:63-69; service.py:80-85). Branch on the code, not the message. The denied attempt is audited (service.py:82-84). This is a 403 with a different code from `permission_denied`.
- 404 `not_found`: "App not found" (service.py:74, 118) on all three ops. "Credential not found" on DELETE (service.py:129) when the id is unknown or belongs to another app. 404 is NOT documented in the OpenAPI responses for these ops (schema.d.ts:1927-2110 lists only 200/201/204, 401, 403, 422, plus 409 on POST), so the client must handle it generically.
- 409 `conflict` on POST only, `details=[{"field":"key","reason":<r>}]` (service.py:61-62). Reasons:
  - `admin_app`: key == `admin` (service.py:86-87), message "The admin app has no credentials".
  - `app_disabled`: app.status == disabled (service.py:88-89).
  - `credential_limit`: `count_active >= 2` (service.py:90-94), message "At most 2 active credentials per app; revoke one first".
  - Match on `code=conflict` plus `details[0].reason`. A 409 can only come from a non-super caller who has already passed 403, so it is never masked.
- 422 `validation_error`: details is a list of `{type, loc, msg}`, with no values echoed (errors.py:151-164). It can come from a bad limit/offset or a non-uuid `credential_id`.
- 429 is not expected on these routes.
- DELETE has no 409 and no 403 beyond permission. Revoking an already-revoked credential is a silent 204 no-op (service.py:130-131), so the UI cannot distinguish it. A concurrent double revoke also gives 204.

### Audit side effects
- POST writes `app_credential.issued`, target `app_credential`/row id, `changes={key_id}`. The secret is never audited (service.py:105-112).
- DELETE writes `app_credential.revoked` with `changes={revoked_at}`, only on a real revoke (service.py:135-142). A no-op writes nothing.
- A denied issue writes an audit row with outcome=denied. Both events are visible in the audit-log screen (actions.py:46-47), so the audit-log UI's action filter/labels may need the two new action strings (a possible follow-up, not this ticket).
- `created_by` is the issuing staff user id (null for system actors). The UI can show it only as an id, or resolve it via the users API if allowed. Do not fake a name.

### Concurrency
Mutations take the app row lock (service.py:3-4, 71-75), so the limit of 2 is race-safe. Two simultaneous issues: one gets 409 `credential_limit`.

## Recommendations
1. AC1 list: `GET .../credentials?limit&offset` via the `src/api` client and a TanStack Query hook keyed `['apps', key, 'credentials', {limit, offset}]`. Use the generated `Page_AppCredentialRead_`. Show key_id (monospace), created_at, last_used_at ("Never" when null), and a status badge from `active` (with revoked_at). Newest-first is server-ordered.
2. AC2 issue (R3/R5): do NOT use `useQuery`. Use a `useMutation` and read the `credential` only in the `mutate` callback or `onSuccess`, into local state of the dialog component. Set `gcTime: 0`, and call `mutation.reset()` on close and unmount. Do not pass it to the router, a store, or a toast. Do not log it. Do not put it in the URL. Never `setQueryData` with the issued object, because it holds the secret. On success only invalidate the list key. Reading the value from the invalidated list is impossible anyway. If the mutation result object is otherwise exposed (devtools, `useMutationState`), the cache keeps the data until reset.
   - Mutation cache note: TanStack's `MutationCache` retains the mutation `data` for `gcTime` after unmount. Set the mutation's `gcTime: 0` and `reset()` explicitly, and keep the main.tsx QueryClient default `gcTime` in mind.
   - Show the full value with a copy button (`navigator.clipboard.writeText`, with a fallback message on failure). The text must be selectable. Show a warning: "You will not see this again". Announce the success status via a polite live region (R10), and do NOT put the secret in the live region. Block dismissal by overlay click or Escape without an explicit "I have copied it" step (or at least make a close warn).
   - Disable the issue button while pending and do not retry. There is no idempotency key. A retry or double click creates a second credential (or 409 `credential_limit`). Set `retry: false` for this mutation. If the response is lost (network or timeout) the secret is lost, and the credential exists. The UI should say "the result is unknown, check the list and revoke the unrecognized key_id".
3. AC3 revoke (R9): the confirm dialog names `key_id` (and the app key). Not optimistic. On 204 invalidate the credentials list. Because revoke is idempotent, there is no "already revoked" error branch. For a 404 show "Credential no longer exists" and refetch the list.
4. AC4 errors inline (not only toast), by `code` plus `details[0].reason` with a mapping table:
   - `admin_wildcard_required`: "Issuing needs the super-admin permission (admin:*)".
   - `permission_denied`: generic 403.
   - 409 `conflict` with reason `admin_app` / `app_disabled` / `credential_limit` (the last: tell the user to revoke one first).
   - 404 and 422.
   Pre-disable (R4 mirror): hide or disable Issue without `admin:apps:write` + `admin:*`, with a tooltip. Hide the section or show a 403 state without `admin:apps:read`. Hide the Revoke control without `admin:apps:write`. The `admin:*` mirror is only a hint, so still handle 403. For `key==='admin'`, hide Issue and explain that the admin app has no credentials (API returns 409). For a disabled app, disable Issue with an explanation (the app status is known from PAN-015).
5. AC5 tests with the fake fetch (ADR 0005): list loading, empty, error, 403 (read), page 2 via offset; issue success (secret shown, then gone after close, not in the query cache: assert `queryClient.getQueryCache()` and `getMutationCache()` have no `credential` after close), `admin_wildcard_required` 403, 409 for each of the three reasons, 404; revoke confirm/cancel, success with refetch, and a failure keeping the row. Also unit-test the error-to-message mapper.
6. Generated types: use `components['schemas']['AppCredentialRead' | 'AppCredentialIssued']` from /home/user/admin-pan/src/api/schema.d.ts. Do not hand-write copies (R2). Since the OpenAPI lacks 404 and `Cache-Control`, handle them in the client or tests, not from the types.
7. `credential_id` for the DELETE path is `id`, not `key_id`.

## Risks
- Secret leakage via the TanStack mutation cache (`data` retained after unmount), React Query devtools, error boundaries, a Sentry-style capture of the response, or `console.log`. Mitigate as in rec 2.
- A lost 201 (timeout, tab closed) leaves an active credential the staff never saw. The limit of 2 can then block a re-issue until revoke. The UI should make revoking an unknown key easy.
- `src/api/client.ts` `onResponse` for ok responses does `response.clone().text()`, which copies the body once (fine), but no code path may log it.
- The `admin:*` check is not in OpenAPI, so it can drift. A UI mirror that does not check `admin:*` would show Issue and always 403.
- The OpenAPI omits the 404 response and the `Cache-Control` header, so a future spec-diff will not flag changes to them.
- ADR-0016 is "Proposed - pending owner (approve by merging USR-05a)". The ticket says merged in 33db316, so the status line may be stale. Confirm the contract is stable.

## Open questions
1. Does the PAN permission helper support the literal `admin:*` (grep for `admin:*` in the permissions store and `GET /api/v1/me/permissions` handling)? If it expands or ignores the wildcard, the issue gate needs it. Also check whether `admin:apps:write` is implied by `admin:*` in the UI matcher (the API's `permits` does wildcard matching).
2. Should `created_by` (a uuid) be resolved to a user name or email via the users API, or shown as a short id? That needs `admin:users:read`, and R5 says no full emails in URLs and logs.
3. Where does the list live: a section of the app detail page, or a dialog or tab? (Ticket says "from the app detail"; PAN-015's layout decides.)
4. Should the audit-log screen get labels for `app_credential.issued` / `.revoked` (follow-up per R7)?
5. No-store on 201: should an api-client test assert the request side only (it already forces `cache: 'no-store'`)? The response header cannot be enforced client-side.
