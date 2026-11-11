# PAN-001: Scaffold the admin UI app, tooling and CI

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Areas | architecture, ui, security |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
Create the empty, runnable admin UI project on the confirmed stack, with the folder layout, API client skeleton, generated API types and checks from `CLAUDE.md`, and CI that runs them on every PR.

## Spec reference
`CLAUDE.md` (Stack, Layout, R2, R5, R8); `docs/spec-v1.md` §6, §8 Q1.

## Depends on
None. (Needs the owner's answer to spec §8 Q1 — stack.)

## Acceptance criteria
- [ ] `pnpm install && pnpm dev` serves an app shell page; `pnpm build` produces static files.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` exist and pass; one sample Vitest + Testing Library + MSW test runs.
- [ ] `pnpm api:types` generates `src/api/schema.d.ts` from org-admin-api's OpenAPI (URL or file from `.env`/argument); the generated file is committed.
- [ ] `src/api/` has the single API client: base URL from `VITE_API_BASE_URL`, parses the error envelope and `Page<T>`; unit tests cover success, error envelope, and non-JSON errors (R2).
- [ ] `.env.example` lists only public `VITE_*` keys without values; `.gitignore` covers `.env.local` (R5).
- [ ] `.github/workflows/ci.yml` runs install (frozen lockfile), typecheck, lint, test, build on pull requests and on `main`.
- [ ] `README.md` quick start updated with the real commands.

## Notes / answers from owner
- 2026-11-11: created while bootstrapping the workflow. The stack in `CLAUDE.md` is a proposal; if spec §8 Q1 is unanswered, the planner must return BLOCKED.
