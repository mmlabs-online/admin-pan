## Attempt 1 — 2026-11-17
Verdict: PASS

### Checks (run by reviewer)
- pnpm typecheck: pass (exit 0)
- pnpm lint: pass (exit 0)
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium): Test Files 64 passed (64), Tests 417 passed (417). This matches impl-log.
- pnpm build: pass (exit 0)
- pnpm e2e: not in the plan

### Acceptance criteria
- [x] AC1: `/forgot-password` shows a text notice ("reset your password from any mmlabs app you use") and the owner's fallback line. It has no form and makes no API call. Evidence: `src/features/auth/forgot-password/index.tsx:20-30` contains only static copy. It imports only `Link`, Card and `AuthLayout`, with nothing from `@/api`, mutations or Turnstile. Tests in `forgot-password.test.tsx` all pass:
  - "shows the reset-from-any-mmlabs-app notice and the administrator fallback"
  - "has no form, input or button and makes no request" (fetch spy has 0 calls; textbox, button and form counts are 0)
  - "links only to /sign-in" (exactly 1 link, `href=/sign-in`, so no app link)
- [x] AC2: `forgotPassword()` is removed together with its tests, the mutation, the export and the form component. Evidence: the diff of `src/api/public-auth.ts`, `src/api/index.ts:12` and `src/features/auth/api/mutations.ts`; both `forgot-password/components/*` files are deleted. `grep -rniE "forgotPassword|useForgotPasswordMutation|ForgotPasswordForm|password/forgot" src` (generated schema excluded) finds nothing. Client coverage is kept: in `public-auth.test.ts`, the origin-header test and the 429 test now call `resetPassword`. The `as never` header cast is gone.
- [x] AC3: the PAN-012b copy is corrected and does not promise a resend button. Evidence: `verify-email-panel.tsx:23-26` and `:89-91`. `verify-email.test.tsx` asserts the new text on the invalid-link page (line 86) and on the 422 panel (line 180), and both pass. `grep "Sign in to request|Send the link again" src` finds nothing.
- [x] AC4 (as amended by the owner on 2026-11-17): `/reset-password` and `/verify-email` behave as before. Only the two reset links are relabelled "How to reset your password", and they still go to `/forgot-password`. Evidence: `reset-password-form.tsx:32` and `:110`; the `reset-password-form.test.tsx` assertions at lines 83-86 and 142 pass. The diff does not touch nginx, `smoke-image.sh`, `safe-redirect.ts`, `client.ts` or the route files.
- [x] AC5: spec §5.1 is updated. Evidence: `docs/spec-v1.md:36` matches the text in plan Approach step 6 word for word.
- [x] AC6 / R8: all checks are green (see above).

Owner answers: CLAUDE.md is not in the diff (R3 left unchanged). The fallback line is text only. The reset links are relabelled as instructed.

### Issues
None blocking.

### Rules R1–R11
No violations found.
- R2: `src/api/` got smaller.
- R3: no new auth path; CLAUDE.md is unchanged.
- R5/R6: static text only.
- R7: every changed non-`work/` file is in the plan's file list. The other `work/` commits on the branch belong to PAN-014/015 and the backlog, as the orchestrator said, and were not reviewed as part of this ticket.

### Security / a11y blockers
None. No security-review.md or a11y-review.md was present at the time of this review.

### Nits (do not block)
- `docs/deploy.md:7-8`: the word "the" is doubled across the line break ("…(no Cloudflare Access); the / the reset-password…"). Also, the same paragraph still says "mock sign-in", while step 4 (line 118) now checks a real sign-in against `api.mmlabs.online`. "Mock sign-in" was already there before this change, but the two now contradict each other.
- `src/features/auth/api/mutations.ts:13`: "Variables hold an token / password" should read "a token / password".

### Follow-ups (out of scope)
- Narrow the CLAUDE.md R3 exception to reset-password and verify-email (owner decision; separate /solo).
- When PAN-010b lands, update the verify-email copy and the gate page together so they point at "Send the link again".
- Consider retiring admin's `/reset-password`, since the API no longer issues reset links for the admin origin. Revisit the `InvalidLink` body text "Request a new one." at the same time.
- Refresh the "mock sign-in" wording in `docs/deploy.md` now that PAN-010 is done.
