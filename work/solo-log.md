# Solo log

| Date | Summary | Files | Checks |
|---|---|---|---|
| 2026-11-15 | /verify-email a11y (PAN-012b follow-ups): removed `aria-busy` around the "Verifying…" status region; Confirm button uses `aria-disabled` instead of `disabled` so focus stays on it after 429/network errors (double clicks still blocked by the inFlight ref); tests for both | src/features/auth/verify-email/components/verify-email-panel.tsx, src/features/auth/verify-email/verify-email.test.tsx | typecheck, lint, format:check, test 274/274, build pass |
| 2026-11-18 | Move `@tailwindcss/vite` to devDependencies (build-only tool). Fixes the red CI `audit` job: `pnpm audit --prod` flagged GHSA-fc5q-39xc-vjpf (picomatch ≤4.0.7, no patched version) via `@tailwindcss/vite → vite → picomatch`, which never ships in the static nginx image. Dockerfile runs a full `pnpm install`, so the image build is unaffected | package.json, pnpm-lock.yaml | `pnpm audit --prod --audit-level high` clean; typecheck, lint, format:check, test 719/719, build pass |
