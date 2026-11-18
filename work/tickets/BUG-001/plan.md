Status: READY

# Plan — BUG-001: Session revoke copy says admin tokens stay valid up to 12 h (wrong since org-admin-api USR-14)

## Spec summary
- Spec §5.4 (docs/spec-v1.md:47-48): "Apps registry (…), role assignments per user (…), revoke sessions." / "API: … sessions revoke (identity-architecture §4)."
- CLAUDE.md R9: destructive or access-changing actions "need an explicit confirmation naming the target". The text in that confirmation must describe what the action really does. Today it describes the contract from before USR-14.
- Bug reference (ticket.md, Expected): the copy must match the API contract in org-admin-api `app/modules/users/router.py:65-73` (`_REVOKE_LIMITS`, c7b86dd). That constant says:
  > "Revoking sessions stops the user from getting **new** access tokens (`/auth/token` -> 401 `session_invalid`) and ends the user's admin (`aud=admin`) tokens bound to those sessions on their next admin request. Tokens of other apps stay valid until `exp`, at most `ACCESS_TOKEN_TTL_SECONDS` (12 h in production) plus 30 s leeway. It does not stop a new sign-in with the password. …"

  The same text is already in the regenerated snapshot: `src/api/openapi.json` and `src/api/schema.d.ts`, 3 occurrences each.

### Root cause (confirmed)
The cause is the stale copy in `src/features/users/data/sessions.ts`. It is in this repo; the API is correct.
- Header comment, `sessions.ts:1-2`: "revoking stops NEW access tokens only".
- `SESSIONS_NOTE`, `sessions.ts:4-5`: "Revoking stops new access tokens only; tokens already issued stay valid for up to 12 hours." It has no password-change or disable text.
- `REVOKE_ONE_EFFECT`, `sessions.ts:7-8`: "…so apps already open there (including this admin app) can keep working until then."
- `REVOKE_ALL_EFFECT`, `sessions.ts:10-11`: "…so open apps can keep working until then."

I checked the consult's claims against org-admin-api c7b86dd (read-only):
- `repository.py:152` revoke-one: "the device session is untouched".
- `repository.py:108` revoke-all: "Device sessions stay: they may carry other users' accounts".
- `repository.py:219` `is_account_active` is the per-request check.

So "other accounts on that browser are not affected / stay signed in" is accurate.

Why the existing tests miss the bug: they only pin `'up to 12 hours'`, `'not a password change'` and the negative `/signed out|immediately|logged out/i`. All of these pass on both the old and the new copy.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A regression test reproduces the bug: it fails on `origin/main` before the fix and passes after. | `sessions.test.ts › revoke copy › …next admin request…` and the two updated dialog tests in `user-sessions-tab.test.tsx` fail against the unfixed `sessions.ts`, and impl-log.md records that failing run (the test names and the failing assertions). The reviewer can reproduce it with `git stash` of `sessions.ts` only, or by checking out `origin/main -- src/features/users/data/sessions.ts`, then running `pnpm test src/features/users`: it shows red. With the fix it shows green. |
| 2 | The section note, revoke-one and revoke-all copy all state five things: no new tokens; admin-app access ends on the next admin request; other apps' tokens last up to 12 h; not a password change; disable to lock. The existing `signed out / immediately / logged out` guard is kept. | Read `sessions.ts` and compare it with the "Target copy" below. The `sessions.test.ts › revoke copy` assertions cover each of the five points for all three constants, and the guard regex is unchanged. The dialog tests assert `next admin request` in the rendered dialogs. |
| 3 | All checks pass (R8). | `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, `pnpm e2e` all green. For `test` and `e2e` in the sandbox, run with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`. |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/users/data/sessions.test.ts` | Extend the `revoke copy` test (see Tests). | AC1 and AC2: this is the regression test. |
| `src/features/users/components/user-sessions-tab.test.tsx` | At about line 228 (revoke-one dialog) and about line 378 (revoke-all dialog), add `await expect.element(dialog()).toHaveTextContent('next admin request')` next to the existing `'up to 12 hours'` assertion. Optionally update the test titles at :214 and :367 to mention the next admin request. | AC1: pins the regression at the rendered level. |
| `src/features/users/data/sessions.ts` | Replace the header comment (:1-2) and the three constants (:4-11) with the target copy. | AC2. This is the root cause. |

No other file is touched. `user-session-revoke-dialog.tsx` and `user-sessions-tab.tsx` render the constants unchanged. Each constant still starts with a capitalised sentence, so it still reads correctly after the dialog's `?`.

## Target copy (identity consult R-1, verified against org-admin-api c7b86dd)
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
- Use this text verbatim. Prettier may re-wrap the lines, which is fine.
- It keeps "up to 12 hours" and does not mention the 30 s leeway (caller decision).
- It contains no "signed out", "immediately" or "logged out". "stay signed in" does not match `/signed out/`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| **Regression, written first:** `src/features/users/data/sessions.test.ts › revoke copy › "admin-app access ends on the next admin request; only other apps' tokens last up to 12 hours; not a password change; disable to lock; never 'signed out' or 'immediately'"` (rename the existing `it`). For each of `[SESSIONS_NOTE, REVOKE_ONE_EFFECT, REVOKE_ALL_EFFECT]`: `toContain('next admin request')`, `toContain('other apps')`, `toContain('up to 12 hours')`, `toContain('not a password change')`, `toMatch(/disable it/i)`, `toContain('new access tokens')`, `not.toMatch(/including this admin app\|open apps can keep working\|new access tokens only/i)`, and the existing `not.toMatch(/signed out\|immediately\|logged out/i)` kept verbatim. | AC1 and AC2. On main, `next admin request`, `other apps` and the negative stale-phrase assertion fail for all three constants. `not a password change` and `disable` also fail for `SESSIONS_NOTE`. |
| `src/features/users/components/user-sessions-tab.test.tsx › revoke one: confirm names email … (:214)`: add `toHaveTextContent('next admin request')` (keep `'up to 12 hours'`). | AC1, rendered revoke-one dialog. |
| `src/features/users/components/user-sessions-tab.test.tsx › revoke all: confirm names the email … (:367)`: add `toHaveTextContent('next admin request')` (keep `'up to 12 hours'`). | AC1, rendered revoke-all dialog. |

## Approach
1. **Tests first.** Edit `sessions.test.ts` and the two dialog tests as described above, then run `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test src/features/users` against the unfixed `sessions.ts`. Record the failing output in impl-log.md under "Regression test: before fix": the test names and the first failing assertion of each (ADR 0003).
2. Replace the header comment and the three constants in `sessions.ts` with the Target copy.
3. Re-run the same command and record it as green in impl-log.md under "after fix".
4. Run all the checks: `pnpm typecheck`, `pnpm lint`, `pnpm format` then `pnpm format:check`, `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test`, `pnpm build`, and `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm e2e`.

Rules:
- R9: the confirmation text now describes the real effect.
- R7: only copy and tests change.
- R1: the copy mirrors the API contract and adds no behaviour.
- R4: unchanged.
- R6: still plain strings.

Follow-ups to record in impl-log, not in this diff:
- (a) The `users-status-dialog.tsx:69` text "signed out of every mmlabs app" overclaims for other apps' tokens. It is pinned by `users-status-dialog.test.tsx:88`. The ticket already lists this as out of scope.
- (b) "12 hours" is hard-coded while the TTL is configuration on the API. Consider an org-admin-api follow-up to expose the TTL.

## Specialist input used
- identity-access-engineer:
  - **R-1 wording: adopted verbatim.** I checked it against `router.py:65-73` and `repository.py:108,152,219` at c7b86dd and found no inaccuracy.
  - **R-2 tests: adopted.** `disable` is matched as `/disable it/i`, and the stale-phrase negative also covers `new access tokens only`, which comes from the frontend consult.
  - **R-3 scope: adopted.**
  - Open question 1 (make the note longer): resolved yes, because AC2 names the section note explicitly.
  - Open question 2 (leeway): resolved by the caller. Keep "up to 12 hours".
- frontend-developer:
  - Render sites and pinning tests: adopted.
  - The `SESSIONS_NOTE` `new access tokens only` negative: adopted.
  - Asserting `other apps` in the dialog tests: rejected as redundant with the unit test. Keep the dialog change minimal (`next admin request`, per caller).
  - The new section-note component assertion: rejected. The unit test already pins `SESSIONS_NOTE`, and R7 calls for a minimal change.
  - A global `keep working` negative: rejected, too broad. I forbid only the exact stale phrases.

## Assumptions
- `origin/main` at the time of implementation has the same `sessions.ts` content as above (b406001), so the new assertions fail there.
- "12 hours" matches production `ACCESS_TOKEN_TTL_SECONDS`, as stated in the API description.

## Blocking questions
None

## Split proposal
None

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| Users → user detail sheet → Sessions tab (existing) | `admin:*` | Unchanged; only the section note text and the confirm-dialog text change. | Unchanged (revoke one / revoke all). | Unchanged |

## API calls used
None (no change in API calls)
