## Attempt 1

**Verdict: no 🔴 blockers and no 🟡 should-fix items. There are 4 💭 notes and 3 follow-ups.** I checked the full diff (54 files) and ran the security-relevant tests (15 files, 79 tests, all passing). The full R8 checks belong to the reviewer.

### Checklist (all OK)
- **The mirror is advisory only, and `unknown` means show.**
  - The unknown source is the default (`source.ts:17-19`, `permission-provider.tsx:16-28`), and the provider is mounted without a source (`_authenticated/route.tsx:10`).
  - `<Can>`, the nav filter and the route gate only act on `'denied'`.
  - `evaluateAll` never fails closed.
  - `queryView` ignores the mirror.
- **Confirmations are not replaced.** `<Can>` wraps only the triggers, and the existing ConfirmDialog paths are unchanged (R9).
- **A 403 never signs the user out or retries.**
  - `isForbidden` requires an `http` 403. `client.ts` is untouched, and only a 401 calls `notifyUnauthorized`.
  - There is no retry, and the network test proves both.
  - The page never navigates to `/403`, and no redirect URL is built.
- **The error is checked before the data** (`query-view.ts:16-20`). This is tested by a refetch that returns stale data and then a 403.
- **Messages are chosen by error code.**
  - The server message is never echoed (`forbidden.ts:34-64`).
  - `details.required` is validated against an anchored regex with no ReDoS risk, and is rendered as React text or a plain string.
  - There are no HTML sinks.
- **No token is read or decoded, and nothing is persisted.** No permission state is stored and there is no learned-denials cache.
- **No `console` calls and no emails** in toasts or logs.

### Notes
- 💭 **N1** (`route-permission-guard.tsx:27-29` vs the comment at `source.ts:1-4`)
  - **Issue:** on `denied`, the route gate hides the screen, so its queries never run. That state can't happen in production today. With PAN-011b, a stale `denied` would hide a page the user could actually load, with no way to recover.
  - **Fix (PAN-011b):** add an `onRetry` that refetches the permissions, and reword the ADR/comment so it matches the code.
- 💭 **N2** (`forbidden.ts:58-63`)
  - **Issue:** for an unknown 403 code, the message still shows a validated `details.required`.
  - **Optional fix:** show it only for `permission_denied`.
- 💭 **N3**
  - **Issue:** `queryView` and `ForbiddenPanel` are not wired into any screen yet; everything is still mock data.
  - **Fix:** PAN-013…016 must render queries through `queryView`, and the reviewer should enforce this as an R4 check.
- 💭 **N4** (`handle-server-error.ts:27`)
  - **Issue:** errors other than 403 still echo the server message (`message.slice(0,200)`). This predates this ticket. The risk is low, but it is the last place server text reaches the screen.

### Follow-ups
- **F1:** use messages chosen by error code for 409/422 and similar errors too.
- **F2 (PAN-011b):** the real source must:
  - live in TanStack Query, cleared on auth change and never persisted;
  - refetch at most once per burst of `permission_denied` errors;
  - fall back to `unknown` on loading or error;
  - provide a retry on the route panel.
- **F3 (org-admin-api):** `GET /api/v1/me/permissions` and an audit-log endpoint with `x-permission`. Both are already in `org-admin-api-request.md`.
