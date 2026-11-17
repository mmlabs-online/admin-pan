# Backlog

States: BACKLOG → PLANNING → IN_PROGRESS → REVIEW → DONE · plus REWORK, BLOCKED, ESCALATED.
Priority: P1 (next) > P2 > P3. `/run` with no ID picks the top BACKLOG ticket whose dependencies are met.

Ticket IDs: `PAN-XXX`; bugs `BUG-XXX` (recorded with `/bug`, severity in ticket.md, S1 rows above the first BACKLOG row — ADR 0003). Dependencies on the API are written `org-admin-api <ID>` and checked against `mmlabs-online/org-admin-api` `work/backlog.md`.

Phases: **1. UI with mock data** (PAN-001…008, done) → **2. Foundations** (PAN-009…012) → **3. Real API per screen** (PAN-013…021) → **4. Ship** (PAN-022…024).

| ID | Title | State | Priority | Areas | Attempts | Updated |
|---|---|---|---|---|---|---|
| PAN-001 | Scaffold the app from shadcn-admin, tooling and CI | DONE | P1 | architecture, ui, security | 1 | 2026-11-11 |
| PAN-002 | Dashboard with mock data | DONE | P2 | ui | 1 | 2026-11-11 |
| PAN-003 | Users management with mock data | DONE | P1 | ui | 1 | 2026-11-11 |
| PAN-004 | Organizations management with mock data | DONE | P1 | ui | 1 | 2026-11-11 |
| PAN-005 | Apps management with mock data | DONE | P1 | ui, ux | 1 | 2026-11-11 |
| PAN-006 | Roles and role assignments with mock data | DONE | P1 | ui, ux | 1 | 2026-11-11 |
| PAN-007 | Reports management with mock data | DONE | P2 | ui | 1 | 2026-11-11 |
| PAN-008 | Audit log viewer with mock data | DONE | P2 | ui | 1 | 2026-11-11 |
| PAN-009 | API client, error envelope and generated OpenAPI types | DONE | P1 | architecture, api, security | 1 | 2026-11-15 |
| PAN-010 | Sign-in with @mmlabs/auth-client, account switch, logout and route guard | DONE | P1 | architecture, auth, security, api, ui | 1 | 2026-11-16 |
| PAN-011b | Hide/disable nav and actions from the caller's real admin permissions | BACKLOG | P2 | auth, ui, security | 0 | 2026-11-16 |
| PAN-011 | Permission-aware UI and 403 handling | DONE | P1 | auth, ui, security | 1 | 2026-11-16 |
| PAN-012 | Forgot password and reset password pages | DONE | P2 | auth, ui, security | 1 | 2026-11-15 |
| PAN-012b | Verify-email page | DONE | P2 | auth, ui, security | 1 | 2026-11-15 |
| PAN-010b | Resend verification email from the admin UI | BACKLOG | P2 | auth, ui, security | 0 | 2026-11-16 |
| PAN-012c | Retire the forgot-password page on admin (ADM-002d) | DONE | P2 | auth, ui, security | 1 | 2026-11-17 |
| PAN-013 | Users screen on the real API | DONE | P1 | api, ui | 1 | 2026-11-16 |
| PAN-014 | Organizations screen on the real API | BLOCKED | P1 | api, ui | 0 | 2026-11-16 |
| PAN-015 | Apps registry and app permissions on the real API | BLOCKED | P1 | api, ui, auth | 0 | 2026-11-17 |
| PAN-015b | Roles and role permissions on the real API | BACKLOG | P1 | api, ui, auth | 0 | 2026-11-17 |
| PAN-015c | Role assignments (assign, revoke, holders of a role) on the real API | BACKLOG | P1 | api, ui, auth, security | 0 | 2026-11-17 |
| PAN-016 | Audit log on the real API | BACKLOG | P2 | api, ui | 0 | 2026-11-11 |
| PAN-017 | User sessions: list and revoke | BACKLOG | P2 | api, ui, security | 0 | 2026-11-11 |
| PAN-018 | Organization members and invitations | BACKLOG | P3 | api, ui | 0 | 2026-11-11 |
| PAN-019 | Org product entitlements screen | BACKLOG | P2 | ui, api | 0 | 2026-11-11 |
| PAN-020 | Dashboard stats on the real API | BACKLOG | P3 | api, ui | 0 | 2026-11-11 |
| PAN-021 | Reports on the real API | BACKLOG | P3 | api, ui | 0 | 2026-11-11 |
| PAN-022 | Release and deploy to admin-portal.mmlabs.online | DONE | P2 | architecture, security | 1 | 2026-11-16 |
| PAN-023 | End-to-end smoke tests | BACKLOG | P2 | ui, a11y | 0 | 2026-11-11 |
| PAN-024 | UI language | BACKLOG | P3 | ui | 0 | 2026-11-11 |
| PAN-025 | Self-host the Inter and Manrope fonts | DONE | P2 | ui, security | 1 | 2026-11-16 |
| PAN-026 | Upgrade dependencies with known security advisories | DONE | P1 | architecture, security | 1 | 2026-11-16 |

Order of work (dependencies): PAN-001 → PAN-002…008 → PAN-009 → PAN-010 → PAN-011 → PAN-013, PAN-014, PAN-015 → PAN-016 → PAN-012, PAN-019, PAN-022, PAN-023 → PAN-025 → PAN-026 → PAN-017, PAN-018, PAN-020, PAN-021, PAN-024.
Waiting on org-admin-api (state 2026-11-16, origin/main 0899731): PAN-010b ← new org-admin-api ticket allowing resend for `admin` (ADM-002d refuses it) · PAN-011 ← an endpoint returning the caller's effective admin permissions (no ticket yet) · PAN-018 ← USR-06 · PAN-019 ← ADM-006. Met: USR-08, ADM-002, ADM-002b, ADM-004, ADM-012.
API gaps (no org-admin-api ticket yet): caller's admin permissions (PAN-011), resend for `admin` (PAN-010b), admin sessions list/revoke (PAN-017). Proposed on org-admin-api: dashboard stats ADM-015 (PAN-020), member_count ADM-016 (PAN-015), reports ADM-017 (PAN-021).
Ready now (2026-11-17): PAN-016, PAN-012c, PAN-023. PAN-014 and PAN-015 BLOCKED (owner: wait for org-admin-api list filters); PAN-015b/c wait on an admin role list and a role-holders endpoint (request in PAN-015/org-admin-api-request.md). PAN-011b (org-admin-api USR-11 done) and PAN-010b (USR-12 done) are unblocked as of 2026-11-16.
