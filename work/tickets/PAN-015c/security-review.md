# PAN-015c: security review

## Attempt 1

## PAN-015c security review (appsec-engineer, REVIEW stage, read-only)

I reviewed `git diff origin/main...HEAD` at 19b158d and checked the 422 codes and reasons against org-admin-api 0757c27 (`app/core/errors.py:50`, `app/modules/rbac/service.py:1500-1566`). I did not run the checks: there is no `make check` target in admin-pan, and pnpm commands are outside my allowed Bash, so the reviewer must confirm the green `pnpm` checks the impl-log reports (R8).

**Verdict: no blockers.** Every 🔴 from my consult is met, and so is every 🟡 except part of F1, where arrow keys select a user (S1 below). Two should-fix items remain.

### Consult requirements: status
| Consult item | Status | Evidence |
|---|---|---|
| F1 picker: explicit selection by id, text change clears it, stale responses ignored | Met, except S1 | `src/features/users/components/assign-pickers.tsx:58-79,116`: results show only for the submitted term; `onChange` clears the term and the selection; no placeholder data (`src/features/users/api/queries.ts:134-155`). The POST uses the chosen row's `user.id` (`role-assign-dialog.tsx:185`). Tests at `role-assign-dialog.test.tsx:590,619,637,670`. |
| F1 user fixed in the user sheet | Met (low risk) | `user-role-assignments.tsx:281` passes the sheet's `user` live. It is not captured when the dialog opens, but the modal dialog prevents switching users while it is open. |
| F2 422 mapped by `details[].reason` | Met | `src/features/users/data/errors.ts:96-115`: `code === 'unprocessable'` (matches `UnprocessableError.code`) plus `firstReason`, each mapped to its field. `validation_error` maps by body field. `unknown_role` also refetches the roles (`queries.ts:296`). One test per reason. |
| F3 R9 confirmations, never optimistic, double submit, unknown outcome, invalidation | Met | Revoke confirm names role name and key, app, display name and email in `<bdi>`, and the scope by org name (`role-assignment-revoke-dialog.tsx:108-117`). Privileged and admin-app grants get a confirm step (`role-assign-dialog.tsx:138,227-230,291-298`). `retry: false`, `meta.handlesOwnErrors` and the `inFlight` ref guard hold (`queries.ts:283-299`, `role-assign-dialog.tsx:173`). Esc and overlay are blocked while pending (`:255`, revoke `:97`). Success, 404, 409 and unknown outcome invalidate `roleAssignmentsAll(userId)` and `holdersOf(app)`. The "may have been applied" copy is in place. |
| F4 privilege and self UX, 403 still handled | Met | Privileged options are disabled with " — needs admin:*" as text (`role-assign-dialog.tsx:448-451`). Self plus admin app gives a text reason and disables (`:140-144,542`; `user-role-assignments.tsx:111-118`; revoke dialog `:56-62`). 403 `admin_wildcard_required` and `self_assignment_forbidden` show `ForbiddenPanel`. Non-admin self grants stay allowed, as the API does; this is plan follow-up F3. |
| F5 R5: no emails in toasts, URLs, holders keys or logs; short gcTime | Met (see N1) | Toasts use only the role key and app (`role-assign-dialog.tsx:189`, revoke `:72`), with a test at `:739`. The holders key holds ids and paging only (`roles/api/queries.ts:36-43`). gcTime is 5 s for the picker and holders. No `console.*`, `localStorage` or `dangerouslySetInnerHTML` in the diff. |
| F6 expiry and time zone | Met (see N2, N3) | `toExpiresAt` rejects empty-but-invalid, DST-gap and past values and sends `toISOString()` (with `Z`) (`assignments.ts:31-45`). The zone is labelled (`role-assign-dialog.tsx:535`). Expiry is disabled for super-admin. `formatDateTimeZone` is used in the table, the summary and the holders sheet. |
| F7 `<bdi>` and text-only rendering | Met | Picker, summary, confirmations and holders rows. U+202E test at `role-assign-dialog.test.tsx:728`. |
| F8 disabled-target notice | Met | `role-assign-dialog.tsx:284-289` shows the notice without blocking. Status badges appear in the picker and holders rows. Verification state is not shown; this is minor and the API owns that rule. |
| F9 per-control permissions | Met | `roles.viewHolders` (`admin:users:read`) is in the registry and gates the "Assignments" menu item. The picker needs `users.view`; the org picker needs `organizations.view` and falls back to app-wide with a text reason. Holders 403 uses `ForbiddenPanel`. There is no revoke in the holders sheet (plan follow-up F6). |
| F10 / F11 copy | Met | The effect copy never says "immediately" or "15 minutes" and is pinned by tests. Holders show "N assignments", not people. |

### Findings

**🟡 S1. Arrow keys select a user in the picker.** `src/features/users/components/assign-pickers.tsx:137-159`
- **Risk:** each row is a native `<input type='radio' checked={false} onChange={() => onSelect(row)}>`. In a native radio group, ArrowUp/ArrowDown moves focus and checks the next radio, which fires `change`. A keyboard user who arrows to read the substring matches (`an@x.com` vs `joan@x.com`) selects the first row they land on. The list then collapses to "Selected: …", and focus drops because the focused element unmounts.
- This partly defeats F1 for keyboard users. It is mitigated, not blocked: the summary shows the name and email and a separate Grant or Review click is still needed. Non-privileged grants have no confirm step.
- **Fix:** make each row a real activation control instead of a radio, e.g. `<button type='button' onClick={() => onSelect(row)} aria-label={`Select ${row.email}`}>` inside a `<ul>`. Tab moves between rows and Enter or Space selects. After selecting, move focus to the "Change" button.
- **Test:** focus the first row, press ArrowDown, and expect "Selected:" to be absent and no selection.

**🟡 S2. The confirm button can do nothing, silently.** `src/features/users/components/role-assign-dialog.tsx:584-592`
- **Risk:** in the confirm phase, `expiry` is recomputed with `new Date()` on every render. If the operator waits on the confirm step until the chosen expiry has passed, `expiry.ok` is false and "Grant role" does nothing and shows nothing. This is not a security hole (nothing is sent), but a silent no-op on an access-changing control makes people retry and get confused.
- **Fix:**
```tsx
onClick={() => {
  if (assign.isPending) return
  if (!expiry.ok) {
    setPhase('form')
    form.setError('expiresLocal', { message: expiry.error }, { shouldFocus: true })
    return
  }
  send(expiry.value)
}}
```

**💭 N1. The email is in the picker's query key and request URL.**
- `usersKeys.picker(email)` (`queries.ts:48-53`) keeps the typed email in the in-memory query key under `['users']`. The 5 s gcTime bounds it, and this matches the existing `/users` list.
- `GET /api/v1/users?email=` puts the email in the request URL, which can reach Cloudflare and API access logs. This is the API's contract, not a UI defect.
- Follow-up for org-admin-api: an exact or POST-body lookup, or make sure access logs strip query strings.

**💭 N2. The zone label can show the wrong offset across DST.** `zoneLabel()` (`assignments.ts:49-60`) uses today's UTC offset, not the offset at the chosen date. Expiries across a DST change will show the wrong offset in the label. The summary uses `formatDateTimeZone` on the actual value, which is correct, so this only affects the hint. Vietnam has no DST.

**💭 N3. The user-sheet table shows the org UUID.** It lists the org scope as a raw UUID (`user-role-assignments.tsx:186-190`), and the holders sheet does too (`scopeLabel(h.org_id)`). The revoke confirmation does resolve the name, so R9 is satisfied. It is a readability follow-up only.

**💭 N4. The target user is not snapshotted.** In the user-sheet flow the dialog takes the live `user` prop instead of a copy made when it opens. The modal dialog prevents switching users, so there is no practical risk. Snapshot it in a ref if the sheet ever becomes non-modal.

### Recommendations
1. Fix S1 (row buttons instead of radios) and S2 (go back to the form with the error on a stale expiry) in this ticket. Both are small and local to the two files.
2. The reviewer should confirm green `pnpm typecheck`, `lint`, `format:check`, `test` and `build` before PASS (R8). I could not run them in this mode.

### Risks (accepted, owned by the API)
- **Self-grant of product roles:** an operator with `admin:roles:assign` can grant themselves non-admin product roles; the UI allows this to match the API. The org-admin-api follow-up (plan F3) must stay recorded.
- **Stale `privileged` and permission hints:** the server re-checks every request, and every 403 is handled in place.
- **Look-alike accounts on substring search:** mitigated by showing email, status and a short id, plus explicit selection. An exact-match API lookup would reduce it further.

### Follow-ups (out of scope)
- org-admin-api: `self_assignment_forbidden` for privileged roles in any app (consult F4 / plan F3).
- org-admin-api: exact-email lookup, or keep emails out of request URLs and logs (N1).
- admin-pan: org names instead of UUIDs in the scope columns (N3); a DST-aware zone label (N2).
