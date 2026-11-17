## Attempt 1

**Verdict: no blockers and no should-fix findings.** Scope: `git diff origin/main...HEAD -- src docs .env.example`, plus a check of what remains in `src/`. The R8 checks were left to the reviewer.

### Verified
- **The forgot-password API call is gone.**
  - `forgotPassword` is removed from `src/api/public-auth.ts`, from the barrel and from its tests. `useForgotPasswordMutation` is removed, and the form and its test are deleted.
  - Nothing calls `/api/v1/auth/password/forgot` any more. It only remains in the generated `schema.d.ts`.
- **The notice page is static.** It has only static JSX and a `Link` to `/sign-in`: no form, no input, no hooks or queries, and no `dangerouslySetInnerHTML`. The route has no loader. The new test checks that there is no form, textbox or button, and that `fetch` is never called.
- **Reset-password and verify-email are unchanged.**
  - `safe-redirect.ts`, the guards and `client.ts` (`credentials: 'omit'`) are untouched, and so are `resetPassword` and `verifyEmail`.
  - In reset-password, only the link text changed, as the owner approved.
  - The origin-header and 429 tests now run against `resetPassword`.
- **Turnstile and CSP are untouched.** No changes to nginx, Docker, CI, package.json or the lockfile. Sign-in still uses Turnstile, so the new `.env.example` comment is accurate.
- **No enumeration or account-state hints.** The copy is the same for every visitor and takes no input. No email, token or URL appears in it (R5).

### Notes
- 💭 `src/features/auth/api/mutations.ts:13`: the comment says "an token". Fix it to "a token".
- 💭 `docs/deploy.md:7-8`: the text reads "the the" across the line break.
- 💭 `/forgot-password` remains a public path and a valid safe-redirect target. That is correct.

### Follow-ups
- Narrow the R3 exception in CLAUDE.md (the owner deferred this, 2026-11-17).
- Whether the forgot-password types stay in the regenerated OpenAPI schema is the API's decision.
