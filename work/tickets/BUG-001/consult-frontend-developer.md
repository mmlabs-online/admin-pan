## Findings

Constants are in `/home/user/admin-pan/src/features/users/data/sessions.ts`:
- `SESSIONS_NOTE` (:4-5). It contains the stale "Revoking stops new access tokens only; tokens already issued stay valid for up to 12 hours."
- `REVOKE_ONE_EFFECT` (:7-8). It says "...stay valid for up to 12 hours, so apps already open there (including this admin app) can keep working until then."
- `REVOKE_ALL_EFFECT` (:10-11). It says "...stay valid for up to 12 hours, so open apps can keep working until then."
- The header comment (:1-2) says "revoking stops NEW access tokens only". It is also stale. It is a comment, not UI text.

**Render sites** (the only ones; the grep over src found no other use):
- `SESSIONS_NOTE`
  - Imported at `src/features/users/components/user-sessions-tab.tsx:20`.
  - Rendered at :126, as the `<p>` under the "Active sessions" heading.
- `REVOKE_ONE_EFFECT`
  - Imported at `user-session-revoke-dialog.tsx:12`.
  - Rendered at :79, inside the `desc` of the one-session ConfirmDialog.
- `REVOKE_ALL_EFFECT`
  - Imported at `user-session-revoke-dialog.tsx:12`.
  - Rendered at :84, inside the `desc` of the revoke-all ConfirmDialog.

**Tests that pin the text:**
- `src/features/users/data/sessions.test.ts:42-51`, the "revoke copy" test.
  - :45 expects the effect constants to contain `up to 12 hours`.
  - :46 expects them to contain `not a password change`.
  - :47 expects them not to match `/signed out|immediately|logged out/i`.
  - :49 expects `SESSIONS_NOTE` to contain `up to 12 hours`.
  - :50 applies the same negative regex to `SESSIONS_NOTE`.
  - The `up to 12 hours` assertions will still pass after the fix, because other apps' tokens do last up to 12 hours. They therefore do not discriminate old from new copy.
- `src/features/users/components/user-sessions-tab.test.tsx:228` expects the revoke-one dialog to contain `up to 12 hours`. The test title at :214 says "states the 12-hour limit".
- `user-sessions-tab.test.tsx:378` expects the revoke-all dialog to contain `up to 12 hours`. The test title at :367 says "...and the 12-hour limit".
- Line 377 expects `every browser`. That text comes from the dialog's own `desc` (`user-session-revoke-dialog.tsx:83`), not from a constant, so it stays valid.
- Nothing else pins the constants. `:462-485` ("no IP, user agent...") only checks live regions and toasts.

**Other UI text that repeats the stale claim:**
- `user-session-revoke-dialog.tsx`
  - The dialog titles (:72), confirm text (:89-90), pending text (:69) and toasts (:41, "Session revoked." and "All sessions revoked.") make no token-lifetime claim. No change is needed.
  - The surrounding `desc` text (:77-79, :83) is also clean.
- The self note in `forbiddenCopy` and the self-view in the tab (`user-sessions-tab.tsx:44-47`, "You can't manage your own sessions here...") make no validity claim, so there is nothing to fix.
- `src/features/users/data/errors.ts` (`sessionRevokeError`; not read in full) was not matched by the grep for 12 hours, "admin app" or immediately, so it does not repeat the claim.
- Out of scope per the ticket (matches in the grep):
  - `users-status-dialog.tsx:69` says "signed out of every mmlabs app". The test at `users-status-dialog.test.tsx:88` pins it. This is the follow-up the ticket already names.
  - `sign-out-dialog.tsx:49` is the sign-out text, unrelated.
  - `reset-password-form.tsx:96` says "All sessions of this account were signed out". After USR-14 that is closer to true. It is not part of this ticket.

## Recommendations

1. Copy fix in `sessions.ts` only (AC 2, R7). Keep the sentence count small. Suggested content:
   - Each constant states: no new access tokens; the user's admin-app tokens for those sessions end on their next admin request; other apps' tokens stay valid until they expire, up to 12 hours; not a password change; disable to lock.
   - `REVOKE_ALL_EFFECT` keeps "Other accounts on the same browsers stay signed in."
   - `SESSIONS_NOTE` keeps its first two sentences (IP/browser, hourly last seen) and replaces the last sentence.
   - Avoid the words "immediately", "signed out" and "logged out", so the existing guard needs no change. Use wording like "ends on its next admin request".
   - Update the header comment at :1-2.
2. Regression test in `sessions.test.ts`, extending the "revoke copy" test at :42-51. For all three constants:
   - `expect(text).not.toMatch(/including this admin app|open apps can keep working|keep working/i)`. It fails on main for `REVOKE_ONE_EFFECT` (:8) and `REVOKE_ALL_EFFECT` (:11).
   - `expect(text).toMatch(/next admin request/)`. It fails on main for all three.
   - `expect(text).toMatch(/other apps/i)`. It fails on main for all three.
   - Add `expect(SESSIONS_NOTE).not.toContain('new access tokens only')`. It fails on main (:5).
   - For the two effect constants, keep `not a password change` and also assert `disable it`.
   - The "no new access tokens" claim is already in both effect constants, so it would not fail on main. Add it only as a non-regression guard.
   - Keep the `signed out|immediately|logged out` negative regex at :47 and :50 unchanged.
   - Alternative to a global negative on `keep working`: `/admin app/i` appears in the new text legitimately, so only forbid the specific phrase `including this admin app`.
3. Component tests. Replace the weak `up to 12 hours` pins:
   - `user-sessions-tab.test.tsx:228`: assert `next admin request` and `other apps` in the revoke-one dialog.
   - `user-sessions-tab.test.tsx:378`: assert `next admin request` and `other apps` in the revoke-all dialog.
   - Optionally keep `up to 12 hours` next to them.
   - Rename the titles at :214 and :367 only if desired. Titles are not assertions.
   - Add one assertion on the section note, which no test checks today. For example in the "list" test around :170, or a new minimal test: `expect.element(page.getByText(/next admin request/))` for `SESSIONS_NOTE`.
4. Run the sessions tests against the unfixed `sessions.ts` first to show the failing state. The ticket requires the test to fail before the fix.
5. Don't touch `users-status-dialog` (:69), `reset-password-form`, `sign-out-dialog` or the self copy (R7). Log the status-dialog overclaim as a follow-up. It is already listed in the ticket as out of scope.

## Risks

- A phrase-level negative assertion (`keep working`) could reject legitimate future wording. Scope it to the exact stale phrases.
- The current tests would pass on both old and new copy, because they only check `up to 12 hours`. If only those are kept, the regression test would not fail on main. The new assertions in Recommendation 2 are required.
- Dialog `desc` concatenates the constant after a `?` (`user-session-revoke-dialog.tsx:79, :84`). The first word of each constant must still read as a new sentence, and `toHaveTextContent` normalises whitespace.
- Wording must not imply that revoking one session ends the admin app for the whole user. The API ends only the tokens bound to those sessions (ticket Expected). "Revoke all" ends admin tokens for all of that user's sessions.
- The ticket cites the API contract at `org-admin-api app/modules/users/router.py:65-73`. I did not re-verify it from the snapshot. The wording should be checked against the `src/api/openapi.json` sessions route descriptions (also in `src/api/schema.d.ts:798-825`).

## Open questions

- Exact wording of "stops new access tokens". The API snapshot may say refresh or token issuance. Take the final sentence from `src/api/openapi.json` at implementation time.
- Should the "disable the account" advice mention the status dialog's own overclaim? That is out of scope here, and no change is proposed.

Files:
- /home/user/admin-pan/src/features/users/data/sessions.ts
- /home/user/admin-pan/src/features/users/data/sessions.test.ts
- /home/user/admin-pan/src/features/users/components/user-sessions-tab.tsx
- /home/user/admin-pan/src/features/users/components/user-session-revoke-dialog.tsx
- /home/user/admin-pan/src/features/users/components/user-sessions-tab.test.tsx
