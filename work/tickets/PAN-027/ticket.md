# PAN-027: App credentials (list, issue, revoke)

| Field | Value |
|---|---|
| State | DONE |
| Priority | P2 |
| Areas | api, ui, security |
| Attempts | 1 |
| Created | 2026-11-17 |
| PR | — |

## Goal
Let staff manage an app's deploy-time API credentials from the app detail: list them, issue a new one (secret shown once), and revoke one. Backed by org-admin-api USR-05a (ADR-0016).

## Spec reference
`docs/spec-v1.md` §5.3 (apps); org-admin-api ADR-0016 (app credential auth class), D25

## Depends on
PAN-015 (Apps on the real API); org-admin-api USR-05 slice 05a (DONE, merged in 33db316): `GET/POST /api/v1/apps/{key}/credentials` (`admin:apps:read` / `admin:apps:write`, issue also needs `admin:*`), `DELETE /api/v1/apps/{key}/credentials/{credential_id}` (`admin:apps:write`).

## Acceptance criteria
- [ ] Credentials list (key id, created, last used, active/revoked) from the API, paginated
- [ ] Issue shows the full `mmak_…` value exactly once, with a copy control and a clear "you will not see this again" warning; the value is never stored in query cache, state that outlives the dialog, storage, logs or URLs (R3/R5)
- [ ] Revoke needs a confirmation naming the key id (R9); non-optimistic; list refreshed after success
- [ ] API errors shown inline: 403 (incl. `admin:*` needed for issue), 409 `admin_app` / `app_disabled` / limit of 2 active credentials
- [ ] Loading, empty, error and 403 states tested with the fake fetch (ADR 0005)

## Notes / answers from owner
- 2026-11-17: owner asked to build what the API already offers first; this ticket follows PAN-015.
