# PAN-022: Release and deploy to admin.mmlabs.online

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Areas | architecture, security |
| Attempts | 0 |
| Created | 2026-11-11 |
| PR | — |

## Goal
nginx image serving the static build with security headers (CSP, frame-ancestors none, Referrer-Policy), `release.yml` (branch `release/vX.Y.Z` → tag, image, deployment PR) like org-admin-api, and the origin registered on app `admin`.

## Spec reference
`docs/spec-v1.md` §6.1

## Depends on
PAN-001, PAN-010

## Acceptance criteria
- [ ] Dockerfile + nginx config with SPA fallback and security headers (R6)
- [ ] `release.yml` mirrors org-admin-api's flow; smoke test of the image
- [ ] Runbook `docs/deploy.md`
- [ ] Origin registration on org-admin-api app `admin` documented

## Notes / answers from owner
- Hostname to confirm (spec §8 Q2).
