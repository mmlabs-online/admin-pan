# PAN-026: Upgrade dependencies with known security advisories

| Field | Value |
|---|---|
| State | REVIEW |
| Priority | P1 |
| Areas | architecture, security |
| Attempts | 0 |
| Created | 2026-11-16 |
| PR | — |

## Goal
Clear the `pnpm audit --prod` advisories (2 critical, 12 high, 7 moderate, 1 low on 2026-11-16) by upgrading the packages that pull them in, without changing app behaviour, and keep them from coming back unnoticed.

## Spec reference
`docs/spec-v1.md` §6 (non-functional: security); CLAUDE.md R5/R8. Owner 2026-11-16: "làm tiếp nâng cấp các dependency" after PAN-022.

## Depends on
None (PAN-022 and PAN-025 are done; CI `image` job and smoke test exist).

## Advisories at creation (pnpm audit --prod, 2026-11-16)
| Module | Path | Needs |
|---|---|---|
| seroval (critical/high) | @tanstack/react-router → @tanstack/router-core | ≥ 1.6.8 |
| vite (high/moderate/low) | direct, and via @tailwindcss/vite | ≥ 8.1.6 |
| postcss (high/moderate) | @tailwindcss/vite → vite | ≥ 8.5.23 |
| nanoid (high) | @tailwindcss/vite → vite → postcss | ≥ 3.3.18 |
| source-map-js (high) | @tailwindcss/vite → @tailwindcss/node | ≥ 1.2.2 |
| zod (high) | direct | ≥ 4.6.6 |

## Acceptance criteria
- [ ] `pnpm audit --prod` reports no critical or high advisories (any remaining moderate/low listed in the PR with the reason they cannot be fixed yet)
- [ ] Fixed by upgrading the parent packages where possible (`@tanstack/react-router` and its router packages, `vite`, `@tailwindcss/vite`, `zod`); `pnpm.overrides` only where no parent release exists yet, each with a comment and a follow-up to remove it
- [ ] Lockfile updated with `--frozen-lockfile` clean in CI; no other unrelated version bumps
- [ ] App behaviour unchanged: `pnpm typecheck`, `lint`, `format:check`, `test`, `build` pass; `src/routeTree.gen.ts` regenerated if the router plugin changes it; image builds and `scripts/smoke-image.sh` passes; CI `check` + `image` green
- [ ] CI runs `pnpm audit --prod --audit-level high` so new high/critical advisories fail the build

## Notes / answers from owner
- 2026-11-16: created from PAN-022 / PAN-025 security-review follow-ups.
