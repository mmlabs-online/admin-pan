# PAN-027 security review

## Attempt 1

Scope: `git diff origin/main...HEAD` (commit 7b57287), checked against `consult-appsec-engineer.md` and org-admin-api `app/modules/app_credentials/router.py`. pnpm checks not run (reviewer's R8).

**Verdict: no blockers.** The PLAN 🔴 is fixed; R1–R10 are implemented and tested. Three 💭 notes.

### Consult items vs implementation
- **🔴 Finding 1 (secret in MutationCache): fixed.** `src/features/apps/api/queries.ts:205-242`: `mutationFn` takes a sink, strips `credential`, calls `onSecret`, returns metadata only; `retry: false`, `gcTime: 0`, `meta.handlesOwnErrors`; no `mutationKey`, no `setQueryData`; dialog also calls `issue.reset()`. Missing/non-string `credential` → `invalid_response`, sink not called. Error path clean: `ApiError` holds no body (`src/api/errors.ts:36`); global `MutationCache.onError` skips the toast (`src/lib/query-client.ts:56-60`). Tests: `queries.test.tsx:238-266`, leak test `app-credential-issue-dialog.test.tsx:165-212`.
- **🟡 Finding 2 (timeout / double issue): fixed.** `isUnknownOutcome` (`src/features/apps/data/errors.ts:709-718`) covers network, timeout, aborted, invalid_response, 5xx → "couldn't confirm whether…", Issue button removed, list invalidated. `inFlight` ref + `aria-disabled`; dialog locked while pending.
- **R1 scope:** local `useState` only; cleared on `pagehide` (tested), unmount, close; dialog mounted only while issuing.
- **R2 rendering:** `readOnly` input, no `name`, outside any form, autocomplete/autocorrect/autocapitalize off, `spellCheck={false}`, `data-1p-ignore`/`data-lpignore`/`data-form-type`; static label/id; not `type=password`, not `contentEditable`.
- **R3 masking:** `mmak_<key_id>_••••••••` by default; Show/Hide tested incl. DOM cleared after Hide.
- **R4 copy:** click only, no `execCommand` fallback; status text without the value; clipboard warning present.
- **R5 close:** no X, Escape/outside click prevented, only "I've saved it"; `beforeunload` declined (ADR 0007).
- **R6:** only `credentialsAll(key)` invalidated; no `setQueryData`.
- **R7:** Issue and Revoke gated on `admin:apps:write`; admin app hidden; disabled apps disabled; 403/409 inline incl. `admin_wildcard_required`; `admin:*` is a hint only (note 3).
- **R8 revoke:** confirmation names `key_id`, app name and key; says immediate and permanent; non-optimistic; invalidates list.
- **R9 fixtures:** one fake constant (`src/test-utils/fake-credential.ts:4-5`) shared with `e2e/support/fake-api.ts:112`; clipboard mocked via `vi.spyOn`.
- **R10 leak tests:** mutation cache, query cache, DOM, both storages, `location.href`, console, toasts after close; e2e checks page content, storage and URL.
- Transport unchanged; no service worker; devtools dev-only.

### Findings
1. 💭 **Revoke with unknown outcome does not refetch the list** — `queries.ts:249-257` reuses `useMutationOptions` (`onError` refetches only on 404/409, line 154); message at `errors.ts:749-752` says "Check the list". Fails safe (idempotent 204). Fix: also invalidate `credentialsAll(appKey)` on `isUnknownOutcome(e)`.
2. 💭 **Navigating away while the POST is pending loses the secret** — `app-credential-issue-dialog.tsx` (`locked`): Back, route change or sign-out are not blocked. Accepted residual risk (2-key limit, `last_used_at`, immediate revoke; `beforeunload` declined in ADR 0007). Optional: `beforeunload` only while pending.
3. 💭 **`admin:*` not a gate for Issue** — `registry.ts:769-772` + hint in `app-credentials-tab.tsx`. Follows the PAN-015 owner rule; API enforces; `admin_wildcard_required` shown inline. `alsoRequires` follow-up in plan.md.

Accepted residual risks (ADR 0007): JS strings cannot be zeroed; clipboard and screen capture are outside the app's control.

### Follow-ups (out of scope)
- org-admin-api: `label`/`expires_at` on credentials; declare 404 and the `admin:*` requirement in OpenAPI.
- admin-pan: `mmak_` scrubber if an error reporter is added; exclude `/api/` from any future service worker.
- Repo: gitleaks / secret-scanning pattern for `mmak_…` with an allowlist for `FAKE_CREDENTIAL`.
- Registry `alsoRequires: 'admin:*'` if the owner wants Issue disabled for staff without `admin:*`.
