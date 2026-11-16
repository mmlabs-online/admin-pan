# PAN-022: Release and deploy to admin-portal.mmlabs.online

| Field | Value |
|---|---|
| State | DONE |
| Priority | P2 |
| Areas | architecture, security |
| Attempts | 1 |
| Created | 2026-11-11 |
| PR | https://github.com/mmlabs-online/admin-pan/pull/6 (deployment: https://github.com/mmlabs-online/deployment/pull/75, https://github.com/mmlabs-online/deployment/pull/76) |

## Goal
nginx image serving the static build with security headers (CSP, frame-ancestors none, Referrer-Policy), `release.yml` (branch `release/vX.Y.Z` → tag, image, deployment PR) like org-admin-api, and the origin registered on app `admin`.

## Spec reference
`docs/spec-v1.md` §6.1

## Depends on
PAN-001 (PAN-010 dependency dropped by the owner, 2026-11-16)

## Acceptance criteria
- [x] Dockerfile + nginx config with SPA fallback and security headers (R6)
- [x] `release.yml` mirrors org-admin-api's flow; smoke test of the image
- [x] Runbook `docs/deploy.md`
- [x] Origin registration on org-admin-api app `admin` documented
- [x] Deployment side prepared as a PR on `mmlabs-online/deployment` (app folder, deploy workflow, proxy/tunnel route), following that repo's conventions

## Notes / answers from owner
- Hostname to confirm (spec §8 Q2).
- 2026-11-16 (owner): hostname **`admin-portal.mmlabs.online`**; release the first version **publicly** with the mock-data UI and mock sign-in (no Cloudflare Access), so the PAN-010 dependency is dropped; the agent may add `mmlabs-online/deployment` to the session and open a PR there (owner reviews and merges). After the PAN-022 PR is merged, cut the first release (`release/v0.1.0`).
- 2026-11-16 (owner, after consults):
  - Build the public image against the **real API**: `VITE_API_BASE_URL=https://api.mmlabs.online`, `VITE_APP_KEY=admin` (forgot/reset/verify go live). The agent may open a **separate** deployment PR adding `admin-portal.mmlabs.online` to org-admin-api's `TURNSTILE_ALLOWED_HOSTNAMES`; the owner registers the origin on app `admin` (`set-admin-origins`) and adds the hostname to the Turnstile widget, per the runbook.
  - Before public release: replace every `@mmlabs.online` address in mock data with `@example.com` (in scope for PAN-022). **No** demo banner and **no** redirect validation in this ticket (redirect validation stays with PAN-010).
  - Keep **Google Fonts** (allow `fonts.googleapis.com` / `fonts.gstatic.com` in the CSP); do not self-host.
  - Docker Hub image **`mingming21400/admin-pan`, public**.

