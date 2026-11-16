# PAN-010: facts verified by the orchestrator (2026-11-16)

These were checked against `mmlabs-online/org-admin-api` `origin/main` at 0899731. The local checkout at `/home/user/org-admin-api` is now detached at that commit. Earlier consult notes may have read a stale checkout; where they disagree, this file wins.

1. **Dependencies are done and merged.**
   - USR-08 (`@mmlabs/auth-client`, repo `mmlabs-online/mmlabs-auth`, tag `ts-v0.1.0`; PR #37 merged) and ADM-012 (non-credentialed CORS for the Bearer admin endpoints) are both `DONE` in `work/backlog.md`.

2. **ADM-012 CORS is live on main** (`app/core/cors.py`):
   - Admin policy: methods `GET, POST, PATCH, PUT, DELETE`; headers `Authorization, Content-Type`; non-credentialed; only the `admin` app's origins.
   - The identity policy (`/api/v1/auth/*`) stays credentialed: `GET, POST` with `Content-Type, X-MM-App`.
   - The open question "is ADM-012 on main / are PATCH/PUT/DELETE allowed" is answered: yes.

3. **ADM-002d: the `admin` app is refused on the mail-link endpoints.**
   - `app/modules/auth/deps.py:81-86`, `get_mail_link_app_context`: for the endpoints that mail a link to the request's Origin (signup, password forgot, verify-email resend), `X-MM-App: admin` raises `OriginNotAllowedError` (403 `origin_not_allowed`). That is the same 403 an unregistered app gets.
   - Docstrings: `app/modules/auth/router.py:87` (signup), `:317` and `:352`.
   - `docs/consumers.md`: "`admin-portal` cannot host the sign-up, forgot-password or resend-verification screens (ADM-002d)."
   - So the PAN-010 acceptance criterion "resend verification (`POST /auth/verify-email/resend`)" cannot work as written for app key `admin`.
   - The already-merged PAN-012 forgot-password page also sends `X-MM-App: admin` (`src/api/public-auth.ts`), so it gets this 403 on the real API. That is outside PAN-010's scope (R7) and is recorded as a follow-up for the owner.
   - Reset-password and verify-email (token in the URL fragment) are not mail-link endpoints and are not affected.
