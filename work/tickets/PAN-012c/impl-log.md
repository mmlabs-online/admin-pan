
## Attempt 1

### Summary
`/forgot-password` is now a static text notice (plan copy plus the owner's fallback line), with no form and no API call. `forgotPassword()`, `useForgotPasswordMutation`, the form component and their tests are removed. The verify-email invalid-link and 422 copy now says: request a new link from any mmlabs app you use, then sign in. The two reset-password links are relabelled "How to reset your password". Spec §5.1, `docs/deploy.md` and the `.env.example` comment are updated.

### Files changed
- src/features/auth/forgot-password/index.tsx (notice)
- src/features/auth/forgot-password/forgot-password.test.tsx (new)
- src/features/auth/forgot-password/components/* (deleted)
- src/api/public-auth.ts, src/api/public-auth.test.ts, src/api/index.ts
- src/features/auth/api/mutations.ts, mutations.test.tsx
- src/features/auth/verify-email/components/verify-email-panel.tsx, verify-email.test.tsx
- src/features/auth/reset-password/components/reset-password-form.tsx, reset-password-form.test.tsx
- docs/spec-v1.md, docs/deploy.md, .env.example

### Out-of-plan files
None. (`pnpm format` ran over the repo and changed nothing outside these files.)

### Checks
- pnpm typecheck: pass
- pnpm lint: pass
- pnpm format:check: "All matched files use Prettier code style!"
- pnpm test: Test Files 64 passed (64), Tests 417 passed (417)
- pnpm build: built in 2.36s
- grep for forgotPassword / useForgotPasswordMutation / ForgotPasswordForm / password/forgot / "Sign in to request" / "Send the link again" in src (excluding generated files): only the route and `ForgotPassword` notice component names remain.

### Follow-ups
1. Narrow the CLAUDE.md R3 exception to reset-password and verify-email (owner decision, separate /solo).
2. When PAN-010b lands, update the verify-email texts and the gate page together to point at "Send the link again".
3. Consider retiring `/reset-password`; the API no longer issues reset links for admin.
4. reset-password `InvalidLink` body text "Request a new one." is unchanged per the owner's narrow relabel; revisit with item 3.
