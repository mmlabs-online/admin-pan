Status: READY

# Plan: PAN-012c, retire the forgot-password page on admin (ADM-002d)

## Spec summary
`docs/spec-v1.md` §5.1, line 36 (current text, to be replaced):
> Public pages at fixed paths `/forgot-password` (Turnstile, same answer for any email), `/reset-password` and `/verify-email` (token from the email link) (owner, 2026-11-15). API: `POST /auth/password/forgot`, `/auth/password/reset`, `/auth/verify-email` — org-admin-api USR-04, USR-04b (done). Resending the verification email needs a signed-in session and belongs with sign-in (PAN-010).

Ticket goal: org-admin-api ADM-002d refuses `POST /auth/password/forgot` with `X-MM-App: admin` (403 `origin_not_allowed`). The orchestrator confirmed this on org-admin-api `b87f200` (`app/modules/auth/deps.py` `get_mail_link_app_context`). So `/forgot-password` becomes a text-only notice, and the copy that points to it is fixed. ADR 0003 line 20 already describes this outcome, so no ADR change is needed.

Owner decisions:
- 2026-11-16: text only, with no link to a specific app.
- 2026-11-17:
  - leave CLAUDE.md R3 unchanged;
  - relabel the two reset-password links to "How to reset your password";
  - add the fallback line "If you don't use any other mmlabs app, contact an administrator." as text only.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `/forgot-password` shows a text notice ("reset your password from any mmlabs app you use") plus the owner's fallback line. It has no form and makes no API call. | `forgot-password.test.tsx`: notice text and fallback line are visible; `textbox`, `button` and `form` count 0; a `globalThis.fetch` spy has 0 calls; the Sign in link `href="/sign-in"`; no element links to another app. The reviewer reads `forgot-password/index.tsx` and finds no `@/api`, mutation or Turnstile import. |
| 2 | `forgotPassword()` is removed from `src/api/public-auth.ts`, along with its tests. `useForgotPasswordMutation`, the `index.ts` export and the form component also go. | `grep -rni "forgotPassword\|useForgotPasswordMutation\|ForgotPasswordForm\|password/forgot" src --exclude=schema.d.ts --exclude=openapi.json` returns nothing. `pnpm typecheck` passes. |
| 3 | The PAN-012b copy "Sign in to request a new one" is corrected. It does not promise the PAN-010b resend button. | `verify-email.test.tsx`: the invalid-link and 422 tests assert the new text. `grep -rn "Sign in to request\|Send the link again" src` returns nothing. |
| 4 | `/reset-password` and `/verify-email` behaviour is unchanged. The only change is the owner-approved relabel of the two reset links to "How to reset your password", which still point to `/forgot-password`. | `reset-password-form.test.tsx` (updated assertions: link name "How to reset your password", `href="/forgot-password"`). All other reset and verify tests pass unchanged. `nginx/default.conf`, `smoke-image.sh` and `safe-redirect.ts` are untouched. |
| 5 | Spec §5.1 is updated. | The diff of `docs/spec-v1.md` line 36 matches the text in Approach step 6. |
| 6 | R8: all checks are green. | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` |

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/auth/forgot-password/index.tsx` | Replace the form with a static notice: Card, title, two paragraphs, Sign in footer link. Drop the `ForgotPasswordForm` import. | AC1 |
| `src/features/auth/forgot-password/forgot-password.test.tsx` (new) | Notice tests (see Tests) | AC1, R8 |
| `src/features/auth/forgot-password/components/forgot-password-form.tsx` | Delete | AC2 |
| `src/features/auth/forgot-password/components/forgot-password-form.test.tsx` | Delete | AC2 |
| `src/api/public-auth.ts` | Remove `forgotPassword`, the `Forgot` type and the now-unused `appKey` import. Header comment becomes "(reset, verify-email; …)". | AC2 |
| `src/api/public-auth.test.ts` | Delete the "forgot sends X-MM-App…" test. Change "never sets an origin header" and the 429 half of "422/429 throw…" to call `resetPassword`, so that coverage stays. Fix the import. | AC2, keeps the client coverage |
| `src/api/index.ts` | Line 12: drop `forgotPassword` from the export | AC2 |
| `src/features/auth/api/mutations.ts` | Remove `useForgotPasswordMutation`, `Forgot` and the `forgotPassword` import. The comment "email / token / password" becomes "token / password". | AC2 |
| `src/features/auth/api/mutations.test.tsx` | Remove the `f` mutation, the "forgot" button and its click. The `allErrored` check becomes `r.isError && v.isError`. | AC2 |
| `src/features/auth/verify-email/components/verify-email-panel.tsx` | Lines 23 and 86-87: new copy (Approach step 3) | AC3 |
| `src/features/auth/verify-email/verify-email.test.tsx` | Line 177: assert the new 422 text. Also assert the new `InvalidVerifyLink` text in the existing invalid-link page test if it checks copy; otherwise add one `getByText` there. | AC3 |
| `src/features/auth/reset-password/components/reset-password-form.tsx` | Lines 32 and 110: link text becomes "How to reset your password". `to` is unchanged. | AC4 (owner 2026-11-17) |
| `src/features/auth/reset-password/components/reset-password-form.test.tsx` | Lines 83 and 140: new link name. Rename the test at line 132 to "…with a link to the reset notice". | AC4 |
| `docs/spec-v1.md` | §5.1 line 36 rewrite | AC5 |
| `docs/deploy.md` | Line 8, lines 118-120, line 133 and line 146 (Approach step 7) | Stale runbook: the forgot flow no longer exists on admin |
| `.env.example` | Line 8 comment: "for the sign-in challenge" | Stale comment; the key is still used by sign-in |

Do not touch: `src/routes/(auth)/forgot-password.tsx`, `routeTree.gen.ts`, `src/lib/safe-redirect.ts` (+test), `src/api/client.ts` (`isPublicAuthPath`), `schema.d.ts`/`openapi.json` (generated), `src/components/turnstile.tsx`, `src/lib/turnstile-loader.ts`, `nginx/*`, `scripts/smoke-image.sh`, `Dockerfile`, `release.yml`, `CLAUDE.md`, `docs/adr/*`, the sign-in form and the gate pages.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/features/auth/forgot-password/forgot-password.test.tsx` › `shows the reset-from-any-mmlabs-app notice and the administrator fallback` | AC1 text. Use `getByText(/reset your password from any mmlabs app you use/i)` and `getByText("If you don't use any other mmlabs app, contact an administrator.")`. |
| same › `has no form, input or button and makes no request` | AC1. Spy on `vi.spyOn(globalThis, 'fetch')` before render; `getByRole('textbox')`, `getByRole('button')` and `container.querySelector('form')` find nothing; the spy is not called. Mock `@tanstack/react-router` `Link` as `<a href={to}>`, as `verify-email.test.tsx:11-18` does. |
| same › `links only to /sign-in` | AC1, owner's "no app link": the only link is `Sign in` with `href="/sign-in"` (`getAllByRole('link')` length 1). |
| `verify-email.test.tsx` › existing 422 test (updated) + invalid-link assertion | AC3 |
| `reset-password-form.test.tsx` › existing invalid-link and token_invalid tests (updated) | AC4 |
| `public-auth.test.ts` › origin-header and 429 tests now use `resetPassword` | AC2 without losing client coverage |

## Approach
1. **Removals (AC2).**
   - Delete the two `forgot-password/components/*` files. The local `__screenshots__/` folder is git-ignored, so leave it.
   - Strip `forgotPassword` from `public-auth.ts`, `index.ts`, `mutations.ts` and their tests, as listed above.
   - Run `pnpm typecheck` to find any leftover reference.
2. **Notice (AC1).** Rewrite `forgot-password/index.tsx`. Keep `AuthLayout` and the Card structure of the sibling pages (`verify-email/index.tsx`). Do not use `StatusPanel`: a static page needs no `role='status'` and no focus move. The page has no state, no query params and no imports from `@/api`, Turnstile or mutations. Copy:
   - `CardTitle`: "Forgot your password?"
   - `CardContent`, first `<p>`: "mmlabs Admin can't send password reset emails. Reset your password from any mmlabs app you use with this account: choose its "Forgot password" option and follow the link in the email. Then come back here and sign in with your new password."
   - `CardContent`, second `<p>`: "If you don't use any other mmlabs app, contact an administrator."
   - `CardFooter`: "Remember your password? [Sign in]." Keep the existing Link to `/sign-in` and its classes.
   - No app names and no external URLs (owner 2026-11-16).
3. **Verify-email copy (AC3).** Use the identity consult wording, which matches the email-unverified gate page (`gate/access-pages.tsx:94-96`). It is true before PAN-010b and names no button.
   - `InvalidVerifyLink` (line 23): "This link is invalid. If your email address is still not verified, request a new link from any mmlabs app you use, then sign in."
   - 422 panel (lines 86-87): "This link is invalid, expired or already used. If your email address is still not verified, request a new link from any mmlabs app you use, then sign in."
   - Keep `SignInLink` in both.
4. **Reset links (AC4, owner 2026-11-17).** Only the two link texts change, to "How to reset your password". `to='/forgot-password'`, the status logic and the surrounding text stay unchanged.
5. **Tests.** Update the tests as listed, then run the full check set (R8).
6. **Spec §5.1 (AC5).** Replace line 36 with:
   > Public pages at fixed paths `/forgot-password`, `/reset-password` and `/verify-email` (owner, 2026-11-15). `/forgot-password` is a text-only notice, with no form and no API call: the API refuses `POST /auth/password/forgot` for app `admin` (org-admin-api ADM-002d), so staff reset their password from any mmlabs app they use, or contact an administrator (owner, 2026-11-17, PAN-012c). `/reset-password` (token from the email link) is kept for links that may already point to it. `/verify-email` (token from the email link) also receives the links the API sends for `admin` resends (org-admin-api USR-12). API: `POST /auth/password/reset`, `/auth/verify-email` (org-admin-api USR-04, USR-04b, done). Resending the verification email needs a signed-in session and belongs with sign-in (the "Send the link again" button comes in PAN-010b).
7. **deploy.md.**
   - Line 8: "the reset-password and verify-email pages talk to the real API; `/forgot-password` is a static notice".
   - Lines 118-120, step 4: replace with "Check: sign in at `https://admin-portal.mmlabs.online/sign-in`; requests to `api.mmlabs.online` show no CORS error in the browser console".
   - Line 133: change to "`/forgot-password` shows the text notice (no form)". Leave line 134 (Turnstile/CSP note) as is, because sign-in still uses Turnstile.
   - Line 146: replace the forgot entry with "API requests fail with a CORS error or 403 `origin_not_allowed`: the origin is not registered on app `admin`, or the 60 s delay has not passed."
   - Leave lines 66 and 148-151 as they are.
8. **`.env.example`.** Line 8: "Cloudflare Turnstile site key (public) for the sign-in challenge."

Rules:
- **R1:** nothing is faked. The notice replaces a call the API refuses.
- **R2:** `src/api/` gets smaller, and `isPublicAuthPath` is kept for reset and verify.
- **R3:** no new auth path; CLAUDE.md is unchanged (owner).
- **R5 and R6:** static text only, no data rendered.
- **R7:** scope is limited to the files listed.
- **R10:** the page keeps the sibling Card structure. The Sign in link keeps its visible focus and underline, and the text uses the existing tokens.

## Specialist input used
- **frontend-developer**
  - Adopted:
    - the removal list;
    - keep Turnstile, CSP, nginx, smoke, safe-redirect, `isPublicAuthPath` and the generated files;
    - the notice test shape;
    - no `StatusPanel` and no `role='status'` on a static page;
    - the deploy.md lines and the `.env.example` comment.
  - Adapted: its "Sign in to continue" verify copy, in favour of the identity consult wording. That wording tells the user how to actually get a link today and matches the gate page.
- **appsec-engineer**
  - Adopted:
    - the static page asserts zero fetches and no textbox;
    - remove the `as never` header cast along with `forgotPassword`;
    - keep `/forgot-password` in `AUTH_PAGES`, nginx and smoke;
    - Turnstile and CSP are not narrowed;
    - the spec wording drops the Turnstile and forgot API mentions.
  - Not adopted (owner, 2026-11-17): the R3 narrowing in CLAUDE.md. It becomes a follow-up.
- **identity-access-engineer**
  - Adopted:
    - the notice copy;
    - the verify-email copy, matching the gate page;
    - the spec points (ADM-002d, USR-12, PAN-010b).
  - Its open question 1 (staff with no other app) is answered by the owner's fallback line.
  - Its "do not relabel reset links" advice is overridden by the owner's 2026-11-17 answer.

## Assumptions
- shadcn `CardTitle` renders a `div`, as on the sibling auth pages. Heading semantics stay consistent with `verify-email` and `reset-password`; changing that across the auth pages is out of scope.
- The deploy.md origin-registration check moves to sign-in, because PAN-010 (DONE) makes sign-in call the real API through the registered origin.
- Follow-ups (not in this diff):
  1. Narrow the CLAUDE.md R3 exception to reset-password and verify-email (owner decision, separate `/solo`).
  2. When PAN-010b lands, update the verify-email texts and the gate page together, to point at "Send the link again".
  3. Consider retiring admin's `/reset-password`. The API no longer issues reset links for the admin origin, and old ones expire after 30 minutes (org-admin-api `docs/consumers.md`).
  4. The reset-password `InvalidLink` body text "This link is invalid. Request a new one." is unchanged per the owner's narrow relabel. Revisit it together with item 3.

## Blocking questions
None.

## Split proposal
None. About 150 changed lines, mostly deletions.

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
| `/forgot-password` (public) | none (public auth page) | Static only: notice. No loading, error or 403 state. | Sign in link → `/sign-in`; no mutation | None |
| `/reset-password` (public) | none | Unchanged; only the link labels in the invalid and expired panels change | Unchanged | None |
| `/verify-email` (public) | none | Unchanged; only the invalid-link and 422 panel text changes | Unchanged | None |

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
| ~~POST~~ | ~~`/api/v1/auth/password/forgot`~~ | removed | n/a | n/a | refused for `admin` by ADM-002d |

No new calls. `POST /auth/password/reset` and `POST /auth/verify-email` are unchanged.
