# Registry facts gathered by the orchestrator (2026-11-16, `pnpm view`), for the planner

Read-only lookups; the architect consult could not run `pnpm view`. Verify again at implementation time.

| Package | Locked today | Latest on registry | Relevant dependency ranges |
|---|---|---|---|
| @tanstack/react-router | 1.168.22 | 1.170.46 | — |
| @tanstack/router-core | 1.168.15 (seroval 1.5.1) | 1.171.39 | `seroval ^1.6.7`, `seroval-plugins ^1.6.7` → resolves ≥ 1.6.8 |
| @tanstack/router-plugin | 1.167.22 | 1.169.0 | — |
| @tanstack/react-router-devtools | 1.166.13 | 1.167.3 | — |
| vite | 8.0.8 (postcss 8.5.8) | 8.3.8 | `postcss ^8.5.32` |
| postcss | 8.5.8 | 8.5.33 | `nanoid ^3.3.20` |
| @tailwindcss/node | 4.2.2 | (4.3.5 for @tailwindcss/vite) | `source-map-js ^1.2.1` → in-range refresh to ≥ 1.2.2 is enough; no Tailwind bump needed |
| zod | 4.3.6 | 4.6.7 | — |
| @hookform/resolvers | 5.2.2 | 7.0.6 (major) | 7.x peer `zod ^3.25.0 \|\| ^4.0.0`; check 5.2.2's peer/type compatibility with zod 4.6 before considering any bump |
| vitest | 4.1.4 | 5.1.0 (major) | only bump within 4.x if browser-mode breaks with the new vite |

`pnpm audit --prod` at ticket creation: 2 critical, 12 high, 7 moderate, 1 low (see ticket.md table).
