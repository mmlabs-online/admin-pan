# PAN-001: Scaffold the app from shadcn-admin, tooling and CI

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Areas | architecture, ui, security |
| Attempts | 1 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Import the shadcn-admin template (Vite + React + TanStack Router/Query/Table + shadcn/ui + Tailwind) as the app shell, strip what mmlabs does not use, and add CI.

## Spec reference
`docs/spec-v1.md` §6, §8 Q1

## Depends on
None

## Acceptance criteria
- [x] `pnpm dev` serves the app; `pnpm build` produces static files
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` exist and pass
- [x] Clerk, chats, tasks, sign-up, OTP and social login removed; navigation shows the mmlabs sections
- [x] Access token kept in memory only, test proves nothing is written to cookies or storage (R3)
- [x] `.github/workflows/ci.yml` runs the checks on PRs and `main`; `.env.example` lists only public `VITE_*` keys

## Notes / answers from owner
- Implemented directly at the owner's request on 2026-11-11 ("dựng khung UI … chưa cần integrate API", template satnaing/shadcn-admin), outside `/run`: no plan.md / review.md. Checks at commit: see the PR.
- Owner chose the template on 2026-11-11, which answers spec §8 Q1 (stack).
