## PAN-030 consult: appsec-engineer (read-only)

# PAN-030: appsec consult (PLAN)

I only read code and ran nothing. All four security items in the ticket are real. None is an exploitable vulnerability. The most important one is the disable-user copy: it tells staff the wrong thing about a security action (R9). Second is the `send()` readiness gap: during the confirm step the full-replace PUT can still be sent.

## Findings

### 🟡 1. The disable-user copy claims more than the API does (R9)
**Where:** `/home/user/admin-pan/src/features/users/components/users-status-dialog.tsx:69`. It currently says *"They will be signed out of every mmlabs app: all their sessions are revoked…"*. The test at `/home/user/admin-pan/src/features/users/components/users-status-dialog.test.tsx:88` pins that wrong text, so it has to change too.

**Risk:** staff will think other apps lose access straight away. They don't. Tokens other apps already hold stay valid for up to 12 h, so staff may skip other steps they need to take during an incident.

**What disabling a user actually does.** Source: `/home/user/org-admin-api/app/modules/users/service.py:41-118` `set_status`, plus the services it calls.
- **Admin app (this console):** access ends on the user's **next admin request**, which returns 401. `AdminAuthService.principal` (`app/modules/admin_auth/service.py:40-52`) reloads the user on every request and requires `status == active`. The account session must also still be active.
- **Sessions:** every account session of this user is revoked, on every device (`revoke_all_accounts_of_user`). Device sessions are kept, so **other accounts on the same browser stay signed in**.
- **New tokens:** `POST /auth/token` refuses them for any app with `session_invalid`. Both checks block it: the sessions are revoked, and `tokens/service.py:93` checks the user's status.
- **Sign-in:** refused until the user is re-enabled. The response is the same generic 401 as a wrong password (`auth/service.py:175`). Forgot-password does not issue links for a disabled user (`password_reset.py:81,105`).
- **Reset and verification links:** all invalidated (`EmailTokenRepository.invalidate_all`). They stay dead after re-enable.
- **Pending join requests:** cancelled and audited (USR-15).
- **Other apps:** tokens they already hold **stay valid until `exp`, up to 12 hours**. The production `ACCESS_TOKEN_TTL_SECONDS` is 12 h (config max 43200 s), plus 30 s leeway. Those apps verify through JWKS and are never told about the disable.
- **Role assignments:** untouched. Re-enabling restores the same access once the user signs in again.
- **Re-enable:** does not bring back the revoked sessions or the old links. The user has to sign in again.

**Fix.** Move the copy into a data module next to `sessions.ts`, for example `/home/user/admin-pan/src/features/users/data/status.ts` with `DISABLE_EFFECT` and `ENABLE_EFFECT`, and use it in the dialog. Suggested text, aligned with the BUG-001 wording:
- `DISABLE_EFFECT`: "They can't sign in or get new access tokens for any mmlabs app until re-enabled, and their access to this admin app ends on their next admin request. Tokens already issued to other apps stay valid until they expire, up to 12 hours. All their sessions are revoked, pending join requests are cancelled, and any password-reset or verification links stop working."
- `ENABLE_EFFECT`: "They will be able to sign in to mmlabs apps again. Revoked sessions and old password-reset or verification links stay ended."

**Tests:**
- A unit test, `status.test.ts`, in the same style as `sessions.test.ts:43-54`. `DISABLE_EFFECT` contains `next admin request` and `up to 12 hours`. It does not match `/signed out|logged out|immediately|every mmlabs app/i`.
- Update `users-status-dialog.test.tsx:88` to assert the new phrases. Keep the existing assertions for the target email and the reset/verification links.

### 🟡 2. The permissions `send()` does not re-check readiness before the full-replace PUT
**Where:** `/home/user/admin-pan/src/features/roles/components/role-permissions-dialog.tsx:89-108`. `save()` at line 111 checks `ready`. But "Remove and save" (line 236) calls `send()` directly, and only `inFlight` is checked.

**Risks.** `PUT …/roles/{id}/permissions` replaces the whole list. While the confirm step is open:
- **(a) A background refetch** (focus refetch or invalidation) sets `fresh` to false and later brings back a different `base`. The `removed` list on screen (line 79) is recomputed under the user, so they confirm one list and the PUT sends another selection.
- **(b) A failed refetch** (404 because the role was deleted, or 5xx) renders the `loadError` alert at line 173. The confirm footer at lines 217-240 stays mounted, though, so "Remove and save" still sends.

**Required changes:**
1. In `send()`, before sending: `if (inFlight.current || !ready || loadError) return`.
2. When entering confirm, store a snapshot of the sorted `base`, for example `confirmBase = useRef<string[] | null>`. In `send()`, if the current `base` differs from the snapshot, call `setPhase('edit')` and set an alert such as "This role changed while you were reviewing. Check the selection and save again." Do not send.
3. Do not render the confirm footer, or render it with `aria-disabled` and a linked reason, while `loadError` is set or `!ready`.

**Tests**, browser mode with the network mocked:
- Remove a key, click Save to reach the confirm step, then trigger a refetch of the role detail that returns 500. "Remove and save" sends **no** PUT; check the request log.
- Same setup, but the refetch returns different permissions. The dialog goes back to edit with the alert, and no PUT is sent.
- The happy path still sends exactly one PUT with the sorted keys.

### 💭 3. `focusOpener` puts an API-supplied key into a selector without escaping
**Where:** `/home/user/admin-pan/src/features/roles/components/roles-dialogs.tsx:15-23`, which builds `` `[aria-label="Actions for ${key}"]` ``. The label comes from `roles-row-actions.tsx:49`.

**Risk:** this is not an injection. A key containing `"`, `\` or a newline makes `querySelector` throw a `SyntaxError`. The throw happens inside `onCloseAutoFocus`, after `preventDefault`, or inside a rAF, so focus is lost (R10) and an uncaught error is logged. A crafted key could also match a different element. The API's `ROLE_KEY_RE = ^[a-z][a-z0-9-]{1,31}:[a-z][a-z0-9-]{0,47}$` (`org-admin-api app/modules/rbac/models.py:35`) blocks this today, so the fix is defence in depth: don't trust response shape, and mock data can hold any string.

**Fix (pick one):**
- Minimal: `` `[aria-label="Actions for ${CSS.escape(key)}"]` ``.
- Preferred: don't build a selector from data at all. Put `data-role-actions={role.key}` on the button and find it with `[...document.querySelectorAll<HTMLElement>('[data-role-actions]')].find((el) => el.dataset.roleActions === key)`.

**Test:** render the Roles screen with a mock row whose key is `x:a"]b\`. Open and close Rename with Escape, then assert:
- Focus lands on that row's actions button.
- No error was thrown (a `window` `error` listener or `console.error` spy stays empty).
- A normal key like `stoktok:viewer` still restores focus.

### 💭 4. Bidi controls in the "Choose <name>" aria-label (PAN-015c)
**Where:** `/home/user/admin-pan/src/features/users/components/assign-pickers.tsx:188`, which sets `` aria-label={`Choose ${rowName(row)}`} ``. `rowName` is `u.email` at line 260 and `o.name` at line 304.

**Risk:** organization names are free text from the API (up to 255 characters). U+202E and similar characters can reorder or hide what screen readers and voice control announce. The label isn't visible, so the impact is low. `aria-labelledby` does **not** fix this, because the accessible name keeps the raw characters, so strip them instead.

**Fix:**
- Lift the stripping in `sanitizeUserAgent` (`/home/user/admin-pan/src/features/users/data/sessions.ts:18-29`) into a shared helper, for example `toPlainLabel` in `src/lib/`. Keep `sanitizeUserAgent` as a thin wrapper so `sessions.test.ts` keeps passing.
- Use it for the aria-label. If the result is empty, fall back to a non-empty label such as `` `Choose ${noun} ${index + 1}` ``.

**Tests:**
- An organization named `Acme‮evil` gives a button named `Choose Acmeevil`.
- `getAttribute('aria-label')` contains none of U+202A–202E, U+2066–2069, U+200E/F or U+061C.
- An organization whose name is only bidi characters still gets a non-empty name.

### 💭 5. "Choose an organization." is set even when the org field is hidden
**Where:** `/home/user/admin-pan/src/features/users/components/role-assign-dialog.tsx:239-241`. When there is no user and `orgScope` is still `'org'` from an earlier app, line 241 runs even though `showOrg` is false. The hidden error then reappears later.

**Fix:** `if (showOrg && !orgChosen) setOrgError('Choose an organization.')`. The focus target follows the same rule.

**Test:** choose an app with orgs and then "One organization". Switch to an app with `org_mode: 'none'` and click Grant with no user: only "Choose a user." appears. Switch back to the app with orgs: no stale org error is shown.

## Recommendations
- Name the copy constants after the effect and keep the "do not overclaim" guard regex in a test. `sessions.ts` and `status.ts` should use the same wording about the next admin request and "up to 12 hours".
- In `role-permissions-dialog`, give a disabled "Remove and save" an `aria-describedby` reason, which also covers the ticket's a11y item. A silent no-op is worse than a disabled button with an explanation.
- `CSS.escape` and `toPlainLabel` are browser APIs and plain functions. Unit-test the helper and run the focus test in browser mode.

## Risks and follow-ups (outside PAN-030 scope, R7)
- **Same unescaped-selector pattern elsewhere:** `/home/user/admin-pan/src/features/apps/components/apps-dialogs.tsx:12-20` and `/home/user/admin-pan/src/features/apps/components/app-permissions-tab.tsx:40-44`. Exposure there is lower because app and permission keys are regex-validated by the API. Record a follow-up to share one `focusByData()` helper.
- **Lost update on the permissions PUT:** it is a full replace, and nothing here shows the API supports optimistic concurrency (ETag / `If-Match` or a version field). Without it, two staff editing the same role at once silently overwrite each other; the snapshot check in Finding 2 only narrows the window on this client. Propose an org-admin-api ticket after checking whether it's already planned. Don't fake it in the UI (R1).
- **Leeway detail:** "up to 12 hours" leaves out the 30 s JWT leeway and assumes the production TTL. That's acceptable and matches BUG-001. If the TTL changes (`access_token_ttl_seconds` in org-admin-api config), every copy guard needs updating, so keep the duration in one constant.
