# PAN-015 security review

## Attempt 1

Full diff `git diff origin/main...HEAD` checked against org-admin-api 33db316 (`app/modules/rbac/router.py`, `schemas.py`, `origins.py`, `service.py`). pnpm checks not run (reviewer's R8); `.env*` not read.

**No 🔴 blockers. No 🟡 should-fix.**

### 💭 notes
1. **Selectors built from API data** — `src/features/apps/components/apps-dialogs.tsx:15` (`[aria-label="Actions for ${key}"]`) and `app-permissions-tab.tsx:42` (`[aria-label="Admin only: …"]`) interpolate API values into `querySelector`. Low risk: the API restricts characters (`APP_KEY_RE`, `PERMISSION_KEY_RE`), so no injection today; a looser rule would throw a `SyntaxError` on focus restore, not leak data. Fix: `CSS.escape(...)`, or refs / a `data-*` id map.
2. **Hard-coded `'admin'`** — `src/features/apps/data/errors.ts:113`, `:145` compare against `'admin'` instead of `ADMIN_APP_KEY`. No security effect.
3. **`['me','permissions']` not refetched on 404/409 failure of an admin-app permission write** — `src/features/apps/api/queries.ts:122-124`. Advisory UI only. Optional: also invalidate `alsoOnSuccess` in `onError`.

### Checks that passed
- **Origins (CORS):** removing client-side origin validation is safe. The API's `normalize_origin` (`origins.py:25-54`) is strict (https on `*.mmlabs.online`, default port, not `api.mmlabs.online`, printable ASCII, ≤255, dedup, loopback ignored in staging/production). The client keeps trim, length, count (20) and a duplicate warning. API 422 messages do not echo the value; origins render as `<li>` text, no `href` (R6); no `dangerouslySetInnerHTML`/`innerHTML`/data `href` in `src/features/apps`.
- **Mass assignment:** app edit sends only changed `name`, `join_policy`, `org_mode`, `origins` (`app-form-dialog.tsx:101-112`), never `key`, `status`, role ids; status sends `{status}` (`app-status-dialog.tsx:85`); new permission sends `key`, `is_admin`, optional `description`, never `scope` (`app-permission-form-dialog.tsx:84-88`); toggle sends `{is_admin}` (`app-permission-admin-dialog.tsx:281`). Status and toggle send target state, not a flip. No-op PATCH skipped (`:114`), matching `service.py:408`. API uses `extra="forbid"`.
- **`admin` app:** controls stay behind `apps.update` / `apps.createPermission` with the `admin:*` note (owner, 2026-11-17); API enforces the invariants; 403 inline `ForbiddenPanel`; 409/422 mapped to fixed text by reason code; unmapped messages shown as text capped at 200 chars. The admin-only switch is locked for the admin app and `<app>:*` (`app-permissions-tab.tsx:207`), mirroring the API.
- **`['me','permissions']`:** invalidated after create/update of an admin-app permission (`queries.ts:151-157`), tested (`queries.test.tsx:194`, `:205`). App PATCHes cannot change the caller's permissions. Every app write invalidates `appsKeys.all` (R9).
- **Double submit:** `useRef` in-flight guards with no `await` between check and set (`app-form-dialog.tsx:98/119`, `app-permission-form-dialog.tsx:79-80`), cleared in `finally`/`onSettled`; dialogs refuse to close while pending; nothing optimistic; errors inline (`handlesOwnErrors`).
- **R4:** registry keys match `rbac/router.py` (`admin:apps:read`, `admin:apps:write`, `admin:roles:manage`).
- **R2/R3/R5:** all calls via the injected `ApiClient` with generated types; URL holds only `page`/`pageSize`; no `console.*`/storage; toasts carry only keys; e2e fake uses fixed data and asserts no write on cancel.

### Follow-ups (out of scope)
- org-admin-api: list filters (`status`, `join_policy`, `q`, `sort`) and ADM-016 `member_count`.
- PAN-027: the credential secret is shown once and never cached by Query, logged or put in a URL.
- Shared `ConfirmDialog` close-focus hook, so callers can drop local focus workarounds.
