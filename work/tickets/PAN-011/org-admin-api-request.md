# Request to org-admin-api from admin-pan (2026-11-16)

Paste the prompt below into an org-admin-api session. It proposes two tickets. org-admin-api owns the business rules and the authorization model, so its planner decides the final design.

---

```
/ticket "Caller's effective admin permissions endpoint for the admin UI" P1
```

Context: admin-pan (the admin web UI) is now signed in through `@mmlabs/auth-client` and holds an `aud=admin` access token. It needs to mirror the caller's permissions in the UI (admin-pan rule R4: hide or disable what the caller can't do; the API still enforces everything). Today it can't:
- The token's `roles` claim carries role keys only, not permissions (`app/modules/tokens/service.py:92`; ADR-0008 §3 "no permissions claim").
- The role catalog for app `admin` is refused (D17).
- `GET /users/{id}/role-assignments` needs `admin:users:read`, and the UI does not know its own `sub` without decoding the token, which admin-pan forbids.

Proposal (adjust as your planner sees fit):
- `GET /api/v1/me/permissions`. Keep it out of `/api/v1/auth/*`, which is the cookie class.
- Auth class: Bearer `aud=admin` through `current_admin` only, with **no** `require_permission`. Every token holder may read their own permissions, and getting a token already requires an admin role.
  - This is a new "authenticated, self-scoped" sub-case. Amend ADR-0008 §6 and add an explicit allow-list entry in `test_route_auth_classes.py`. Do not invent a placeholder permission to get past the deny-by-default test.
- Response: `{"user_id": "<uuid>", "roles": ["<role key>", ...], "permissions": ["admin:users:read", ...]}`
  - `permissions` comes from the same `effective_permissions(user, "admin")` that enforcement uses, reloaded per request. Sort it, and return `admin:*` as is (unexpanded).
  - No email or other PII.
- Headers: `Cache-Control: no-store`. The usual 401 envelope applies. No 403 case.
- Do not add permissions to the token.
- Tests:
  - 401 with no token and with a wrong `aud`.
  - Returns only the caller's own data.
  - Reflects a role change on the next request.
  - `admin:*` is returned unexpanded.
  - The route is in the auth-class allow-list.
- Docs: add it to `docs/consumers.md` under "Calling the admin API from the admin UI", and expose it in OpenAPI so admin-pan can regenerate its types.
- Consumer: admin-pan PAN-011b.

---

```
/ticket "Allow resend-verification for the admin app" P2
```

Context: ADM-002d refuses `X-MM-App: admin` on the mail-link endpoints: signup, password forgot and verify-email resend (`app/modules/auth/deps.py` `get_mail_link_app_context`). Staff whose email is unverified get 403 `email_unverified` from `/auth/token`. The admin UI can then only tell them to verify from another mmlabs app.

The admin-pan owner decided (2026-11-16) to wait for the API to allow **resend only** for `admin`. Signup and forgot-password stay refused.

Please decide, and record in ADR-0008 / D-log, whether `POST /api/v1/auth/verify-email/resend` with `X-MM-App: admin` can be allowed:
- It acts on an already signed-in account (cookie class).
- It mails a link to the request's validated `Origin`, `https://admin-portal.mmlabs.online`, which serves `/verify-email`.
- Keep the existing limits: 1/min and 5/day.

If you decide against it, tell admin-pan so PAN-010b can be closed. Consumer: admin-pan PAN-010b.
