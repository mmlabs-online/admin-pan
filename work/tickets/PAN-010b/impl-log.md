## Attempt 1 — 2026-11-17

### Assumption check (plan "Assumptions")
`vi.stubEnv('VITE_API_BASE_URL'/'VITE_APP_KEY')` plus `vi.spyOn(globalThis, 'fetch')` routed to the fake API does reach the lazily created `getAuthClient()` singleton in the gate tests (request recorded with `x-mm-app: admin`, `credentials: 'include'` on the spy's init). Confirmed; no deviation. Unstub/restore in `afterEach`.

### Files touched
| File | Required because |
|---|---|
| `src/api/auth-client.ts` | `ResendOutcome`, `resendVerificationEmail()` |
| `src/api/index.ts` | re-exports |
| `src/api/auth-client.test.ts` | 8 wrapper tests |
| `src/hooks/use-countdown.ts` (+ `.test.tsx`) | countdown hook |
| `src/features/auth/gate/resend-verification.tsx` | new component |
| `src/features/auth/gate/access-pages.tsx` | new copy, shared `busy`, `runContinue`, renders component |
| `src/features/auth/gate/access-pages.test.tsx` | replaced the old "text only" test, added `describe('resend')`, harness stubs |
| `verify-email-panel.tsx`, `verify-email.test.tsx` | copy alignment |
| `docs/adr/0003-auth-client-integration.md` | ADM-002d bullet amended |

### Tests added / changed
- auth-client.test.ts › resendVerificationEmail (8 cases per plan)
- use-countdown.test.tsx (2 cases)
- access-pages.test.tsx: replaced l.53 test; `resend` block with 9 tests per plan
- verify-email.test.tsx: two regexes updated

### Checks (actual output summary)
- pnpm typecheck: clean
- pnpm lint: clean
- pnpm format:check: all files formatted
- pnpm test: 65 files, 436 tests passed
- pnpm build: built OK

### Deviations
- `useCountdown` schedules an extra `setTimeout(tick, 0)` instead of `setNow(Date.now())` in the effect body (lint rule `react-hooks/set-state-in-effect` forbids the latter).
- Tests click aria-disabled buttons through `element().click()`: the browser driver treats `aria-disabled` as not enabled and `userEvent.click` times out.
- `StatusPanel` (pre-existing) wraps its children in `role='status'`, so the new sr-only status paragraph and the alert sit inside a live region (the plan wanted no nesting). Tests read the paragraph via `p[role="status"]`. Not changed (out of plan).

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- `StatusPanel` outer `role='status'` nests the new live regions (and the existing alert); consider moving the role off the wrapper.
- mmlabs-auth README:253 is stale ("admin cannot … resend").
- Stray `src/features/auth/gate/__screenshots__/tmp.test.tsx/` file.
- The library clamps `retryAfter` to 900 s (countdown is a lower bound).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: about +640 / -60 lines, mostly tests.
