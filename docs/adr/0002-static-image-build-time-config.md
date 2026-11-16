# ADR 0002: Static nginx image with build-time config

Status: Accepted pending owner merge (PAN-022)

## Context
admin-pan has no server code (R1). It must be released like org-admin-api (image on Docker Hub, PR on the deployment repo) and serve security headers (R6). Every `VITE_*` value is public (R5).

## Decision
- One immutable image of static files behind unprivileged nginx (uid 101, :8080). No runtime templating, no envsubst, no secrets.
- `VITE_*` values are baked at build time from explicit build args; one image per environment. The Dockerfile validates them.
- The CSP `connect-src` is rendered at build time from the same `VITE_API_BASE_URL` build arg, so the bundle and the policy cannot disagree.
- Headers are owned by nginx and repeated in every location (nginx does not inherit `add_header` into a location that sets its own). `scripts/smoke-image.sh` checks every route class and runs in CI (job `image`) and in `release.yml` against the pushed digest.
- Base images are pinned by tag and digest.

## Alternatives
Runtime config via envsubst (a mutable image, config injection risk); headers in Cloudflare (not under review in this repo); a Node server (server code, R1).

## Consequences
A new environment needs a new build. Base image digests are bumped by hand until Dependabot is added (follow-up).
