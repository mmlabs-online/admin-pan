## Consult: identity-access-engineer, PAN-012c

### Findings
1. **How the reset journey works.** `POST /auth/password/forgot` uses `MailLinkAppContextDep`. That dependency refuses `X-MM-App: admin` with 403 `origin_not_allowed` (`/home/user/org-admin-api/app/modules/auth/deps.py` lines 84-92). The reset link is always `{origin that called forgot}/reset-password#token=…` and expires after 30 minutes (`/home/user/org-admin-api/docs/consumers.md` around line 221). So the correct journey for a staff member is:
   - open any other mmlabs app they use, on that app's own origin, and use its "forgot password" page;
   - the email link lands on **that app's** `/reset-password`, never on admin-portal;
   - the reset signs out every session, so they come back to admin-portal and sign in again.

   Every account was created through a non-admin app, because signup is refused for `admin` too. So each staff member has at least one origin they can use (see open question 1).
2. **`/reset-password` on admin-portal can no longer receive a link.** consumers.md lines 91-92 say admin-portal "is exempt from `/reset-password`, but must serve `/verify-email`". Any reset link minted for the admin origin before ADM-002d expired within 30 minutes. Keeping the page as the ticket requires is harmless, but in practice it is dead code.
3. **`/verify-email` must stay on admin-portal.** Since USR-12, `POST /auth/verify-email/resend` with `X-MM-App: admin` mails `https://admin-portal.mmlabs.online/verify-email#token=…` (consumers.md lines 93-101, `get_resend_link_origin`). The API can issue these links today, as soon as PAN-010b calls resend.
4. **Current copy:**
   - Sign-in hint (`/home/user/admin-pan/src/features/auth/sign-in/components/user-auth-form.tsx` line 149): "Forgot your password? Reset it from any mmlabs app you use." This is already correct and has no app link.
   - Email-unverified gate (`/home/user/admin-pan/src/features/auth/gate/access-pages.tsx` lines 94-96): "request it from any mmlabs app you use". Correct until PAN-010b.
   - Verify-email panel (`/home/user/admin-pan/src/features/auth/verify-email/components/verify-email-panel.tsx`): both `InvalidVerifyLink` (line 23) and the 422 state (lines 86-87) say "Sign in to request a new one". Signing in does **not** give a new link today, because the PAN-010b button does not exist yet.
5. **A link the ticket does not mention.** `/home/user/admin-pan/src/features/auth/reset-password/components/reset-password-form.tsx` links to `/forgot-password` twice: "Request a new link" (lines 109-110) and "Forgot password" (lines 31-32). After this ticket those links lead to the text notice, which is acceptable because the notice explains what to do.

### Recommendations
- **AC1, `/forgot-password` notice.** Use a card with no form, no Turnstile and no API call. Suggested text:
  - Title: "Forgot your password?"
  - Body: "mmlabs Admin can't send password reset emails. Reset your password from any mmlabs app you use with this account: choose its "Forgot password" option and follow the link in the email. Then come back here and sign in with your new password."
  - A footer "Sign in" link to `/sign-in` is fine. It is internal, not an app link.
  - Test: render the page, assert there is no textbox or form and no `fetch`/network call (spy on the API client or MSW), and assert the notice text is there.
- **AC1, sign-in hint.** Keep the current text. Optionally make "Forgot your password?" link to the `/forgot-password` notice (it is our own page, not another app). Do not add any app URL (owner decision).
- **AC2, removals.** Remove:
  - `forgotPassword` from `src/api/public-auth.ts` and its export in `src/api/index.ts`, plus the forgot cases in `public-auth.test.ts`;
  - `useForgotPasswordMutation` and the forgot tests in `features/auth/api/mutations.test.tsx`;
  - `forgot-password-form.tsx` and `forgot-password-form.test.tsx`.

  Leave the generated `schema.d.ts` and `openapi.json` alone. Keep `/forgot-password` in `src/lib/safe-redirect.ts`, since it is still a public auth page. Update the header comment in `public-auth.ts` so it no longer lists forgot.
- **AC3, corrected PAN-012b copy.** It must work before PAN-010b and must not promise a button. Use the same wording in both places in `verify-email-panel.tsx`:
  - 422 state: "This link is invalid, expired or already used. If your email address is still not verified, request a new link from any mmlabs app you use, then sign in." Keep the "Sign in" link.
  - `InvalidVerifyLink`: "This link is invalid. If your email address is still not verified, request a new link from any mmlabs app you use, then sign in."

  This matches the gate page. PAN-010b should then update **both** the gate page and these two strings to "Sign in to mmlabs Admin and use "Send the link again"". Add that as a PAN-010b note or follow-up so the two pages do not drift apart. Update the existing assertions in `verify-email.test.tsx`.
- **AC4.** Leave the `/reset-password` and `/verify-email` behaviour unchanged. Do not reword the `reset-password-form.tsx` links in this ticket (R7). They now lead to the notice, which is correct.
- **AC5, spec §5.1** (`/home/user/admin-pan/docs/spec-v1.md` line 36). Rewrite the line so it says:
  - `/forgot-password` is a text-only notice with no API call, because the API refuses forgot for `admin` (ADM-002d).
  - `/verify-email` receives admin resend links (org-admin-api USR-12).
  - `/reset-password` is kept for links that might point to it, although the API no longer issues reset links for admin-portal (consumers.md).
  - Resend from admin is allowed by the API since USR-12; the UI button comes in PAN-010b.

### Risks
- Low security risk overall: this ticket removes an API call and changes text only. Do not hint at any account state. The notice must not mention whether an email exists (no enumeration surface, which is easy here because there is no form).
- Copy drift: once PAN-010b lands, the verify-email and gate pages must be updated together. Otherwise the copy keeps sending staff to other apps even though admin can resend.
- `/reset-password` on admin is dead code in practice and will tempt future edits. It is better to retire it in a follow-up than to keep maintaining it.

### Open questions
1. Can staff accounts be created without signing up through some other app (for example by admin invite or creation in org-admin-api)? If so, a staff member might have no "mmlabs app you use", and the notice would leave them stuck. In that case the owner should decide on a fallback line such as "or ask an administrator".
2. Should a follow-up retire `/reset-password` on admin-portal, given that consumers.md exempts admin-portal and no valid links can exist? This ticket's AC4 keeps it, so this is a separate decision, not a conflict.
