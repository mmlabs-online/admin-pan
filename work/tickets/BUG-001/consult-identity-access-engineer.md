## BUG-001 consult: identity-access-engineer (read-only)

### Findings

1. **What the API does now (org-admin-api c7b86dd).**
   - Only admin tokens carry the session claim. `app/modules/tokens/service.py:117-122` sets `claims["sid"] = str(account.id)` only when the app is `admin`. Tokens for other apps have no `sid` (see the USR-14 plan, lines 80 and 133-134).
   - Every admin request checks that session. `app/modules/admin_auth/deps.py:79-91` gives 401 when `sid` is missing or malformed. It then calls `AdminAuthService.principal(..., session_id=)`, which uses `SessionRepository.is_account_active` (`app/modules/sessions/repository.py:219-230`). That check requires the account session to be not revoked, to belong to the same user, and its device to be not revoked. Otherwise the request gets the normal 401 `unauthorized` with `WWW-Authenticate`.
   - The check runs in `current_admin`, so `/me/permissions` is covered too. It runs per request, has no cache and fails closed.
   - A request that was already running when the revoke landed still completes. This is accepted in the plan (line 115). So "next admin request" is accurate and "immediately" is not.

2. **What staff revoke actually changes.**
   - Revoke-one: `staff_service.py:110-117` calls `revoke_account_of_user` (`repository.py:151-164`). It revokes one account session, and the docstring says "the device session is untouched".
   - Revoke-all: `staff_service.py:119-125` calls `revoke_all_accounts_of_user_ids` (`repository.py:166-175`). It revokes every account session of that user and leaves device sessions alone (`repository.py:108`: "Device sessions stay: they may carry other users' accounts").
   - **Other accounts on the same browser are not affected.** Their account sessions, the `mm_device` cookie and their admin tokens all stay valid. The USR-14 test `test_shared_device_other_user_survives` covers this through logout. Another session of the same user that is not revoked also keeps working (`test_other_session_of_same_user_survives`).
   - The password is not touched. A fresh login creates a new account session, and its token works (USR-14 AC5).

3. **What the target sees in admin-pan.**
   - Their next admin call gets 401.
   - The library re-mints once via `/auth/token` for the same `account_id`. That returns 401 `session_invalid` because the account session is revoked.
   - admin-pan then calls `notifyUnauthorized` (`src/api/client.ts:92-93`), which runs the session recheck (`src/main.tsx:29`). In effect they have to sign in again.
   - This only happens on their next request, which the UI cannot see or promise.
   - Self-revoke is refused by the API (ticket, out of scope).

4. **Logout and password reset (for context; not part of this copy).**
   - Logout of one account, from any app on that browser, ends that account's admin token on its next request.
   - Logout-all revokes the device and all its accounts.
   - Password reset revokes every account session of the user, so admin tokens end on the next request.
   - None of these ends other apps' tokens before they expire (plan lines 72-77 and 116).

5. **Other apps' tokens.** They stay valid until `exp`: `ACCESS_TOKEN_TTL_SECONDS` (12 h in production) plus 30 s verifier leeway (`router.py:68-69`).

6. **The stale copy.**
   - `src/features/users/data/sessions.ts:5,8,11` still says this admin app keeps working for up to 12 h. The revoke-one text says "including this admin app".
   - The file comment at `sessions.ts:1-2` ("stops NEW access tokens only") is also stale.
   - `SESSIONS_NOTE` currently does not say "not a password change" or "disable", but BUG-001 AC2 asks all three texts to state them.

7. **Tests pinning the old text.**
   - `src/features/users/data/sessions.test.ts:43-50`: `'up to 12 hours'`, `'not a password change'`, and `not.toMatch(/signed out|immediately|logged out/i)`.
   - `src/features/users/components/user-sessions-tab.test.tsx:228` and `:378`: `'up to 12 hours'` in the dialogs.

### Recommendations

**R-1. Exact wording (AC2; R9: the confirmation must not mislead).** Avoid "signed out" for the target, avoid "immediately", and say "access ends" rather than "token revoked".

```ts
// Copy for the Sessions tab (USR-10, USR-14). Revoking stops new tokens; it ends
// this admin app's access on the next admin request; other apps' tokens run to
// expiry. Do not overclaim (pinned by sessions.test.ts).

export const SESSIONS_NOTE =
  'IP and browser are recorded when the browser first signed in and are shared by every account on that browser. Browser last seen updates at most hourly. Revoking stops new access tokens and ends access to this admin app on the next admin request. Tokens already issued to other apps stay valid until they expire, up to 12 hours. Revoking is not a password change; to lock the account, disable it.'

export const REVOKE_ONE_EFFECT =
  "That browser can't get new access tokens for this account, and its access to this admin app ends on its next admin request. Tokens it already holds for other apps stay valid until they expire, up to 12 hours. Other accounts on that browser are not affected. This is not a password change: they can sign in again with their password. To lock the account, disable it instead."

export const REVOKE_ALL_EFFECT =
  'No browser can get new access tokens for this account, and its access to this admin app ends on the next admin request. Tokens already issued to other apps stay valid until they expire, up to 12 hours. Other accounts on the same browsers stay signed in. This is not a password change: they can sign in again with their password. To lock the account, disable it instead.'
```

Notes on the choices:
- "Ends on its next admin request" is exact. Nothing happens to an idle tab until it calls the API. The deny is also server-side, so it holds even for a stolen copy of the token.
- "Up to 12 hours" leaves out the 30 s leeway, which makes no practical difference to staff. Keeping the substring also keeps the dialog tests stable. If the reviewer wants it exact, use "up to about 12 hours" and update the substring checks.
- "Other accounts … stay signed in" / "are not affected" is backed by `repository.py:108,152`. The guard regex `/signed out/` does not match "signed in".
- Fix the file header comment at `sessions.ts:1-2` in the same change. It is the same copy contract, so it stays within R7.

**R-2. Tests (AC1 regression, AC2 guard).** In `sessions.test.ts`, for all three constants:
- **Keep unchanged:** `expect(text).not.toMatch(/signed out|immediately|logged out/i)`. It is still correct under USR-14: the effect is on the next request, and the target is not "logged out" anywhere else. Extend it to `SESSIONS_NOTE` as it is today (line 50).
- **Keep:** `toContain('up to 12 hours')` and `toContain('not a password change')`. Add `not a password change` for `SESSIONS_NOTE` too.
- **Add (these fail on main):**
  - `toContain('next admin request')`
  - `toContain('other apps')`
  - `toMatch(/disable/i)`
  - `not.toMatch(/including this admin app|open apps can keep working/i)`
- **Optional extra guard:** assert the text never says the admin app keeps working, e.g. `not.toMatch(/this admin app\)? can keep working/i)`.
- `user-sessions-tab.test.tsx:228` and `:378`: add `toHaveTextContent('next admin request')` to each dialog assertion so the regression is pinned at the rendered level too.

**R-3. Keep scope tight (R7).** Do not touch the disable dialog copy that says "signed out of every mmlabs app" (out of scope in the ticket). Record it as the follow-up the ticket already names. Under USR-14, disable ends admin access on the next request and blocks new tokens, but other apps' tokens still last up to 12 h. So that copy still overclaims for other apps.

### Risks
- **TTL is configuration.** "12 hours" is true only while production `ACCESS_TOKEN_TTL_SECONDS` = 43200. If it changes, the copy goes stale silently. The OpenAPI description avoids this by naming the setting. A follow-up could expose the TTL via the API (R1: do not hard-code more).
- **Any client that does not reload on 401.** For example, a curl runbook user keeps the token until their next call. The copy says "next admin request", so it does not overclaim.
- **In-flight request.** A request already past the check when the revoke commits still completes (org-admin-api plan line 115). "Immediately" would be wrong, so the guard must stay.
- **Shared browser, wrong account.** Staff might think revoke-one logs out the whole browser. The "other accounts … not affected" sentence addresses this. Keep it.

### Open questions
1. AC2 lists "not a password change; disable to lock" for the section note too, but today's note lacks them. Confirm the owner wants the note longer (my draft adds one sentence) rather than limiting AC2 to the dialogs.
2. Should the 30 s leeway be shown ("up to about 12 hours") or left out ("up to 12 hours", my default)?
3. A UI label language decision is pending (spec §8 Q3). If the labels move to Vietnamese later, carry the same distinctions: next admin request vs immediately, admin app vs other apps.

Files: /home/user/admin-pan/src/features/users/data/sessions.ts, /home/user/admin-pan/src/features/users/data/sessions.test.ts, /home/user/admin-pan/src/features/users/components/user-sessions-tab.test.tsx, /home/user/org-admin-api/app/modules/users/router.py, /home/user/org-admin-api/app/modules/admin_auth/deps.py, /home/user/org-admin-api/app/modules/sessions/repository.py, /home/user/org-admin-api/app/modules/sessions/staff_service.py, /home/user/org-admin-api/app/modules/tokens/service.py, /home/user/org-admin-api/work/tickets/USR-14/plan.md
