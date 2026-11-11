# Backlog

States: BACKLOG → PLANNING → IN_PROGRESS → REVIEW → DONE · plus REWORK, BLOCKED, ESCALATED.
Priority: P1 (next) > P2 > P3. `/run` with no ID picks the top BACKLOG ticket whose dependencies are met.

Ticket IDs: `PAN-XXX`. Dependencies on the API are written `org-admin-api <ID>` and checked against `mmlabs-online/org-admin-api` `work/backlog.md`.

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
| PAN-009 | API client, error envelope and generated OpenAPI types | BACKLOG | P1 | architecture, api, security | 0 | 2026-11-11 |
| PAN-010 | Sign-in with @mmlabs/auth-client, account switch, logout and route guard | BACKLOG | P1 | architecture, auth, security, api, ui | 0 | 2026-11-11 |
| PAN-011 | Permission-aware UI and 403 handling | BACKLOG | P1 | auth, ui, security | 0 | 2026-11-11 |
| PAN-012 | Forgot password, reset password and verify-email pages | BACKLOG | P2 | auth, ui, security | 0 | 2026-11-11 |
| PAN-013 | Users screen on the real API | BACKLOG | P1 | api, ui | 0 | 2026-11-11 |
| PAN-014 | Organizations screen on the real API | BACKLOG | P1 | api, ui | 0 | 2026-11-11 |
| PAN-015 | Apps, permissions, roles and assignments on the real API | BACKLOG | P1 | api, ui, auth | 0 | 2026-11-11 |
| PAN-016 | Audit log on the real API | BACKLOG | P2 | api, ui | 0 | 2026-11-11 |
| PAN-017 | User sessions: list and revoke | BACKLOG | P2 | api, ui, security | 0 | 2026-11-11 |
| PAN-018 | Organization members and invitations | BACKLOG | P3 | api, ui | 0 | 2026-11-11 |
| PAN-019 | Org product entitlements screen | BACKLOG | P2 | ui, api | 0 | 2026-11-11 |
| PAN-020 | Dashboard stats on the real API | BACKLOG | P3 | api, ui | 0 | 2026-11-11 |
| PAN-021 | Reports on the real API | BACKLOG | P3 | api, ui | 0 | 2026-11-11 |
| PAN-022 | Release and deploy to admin.mmlabs.online | BACKLOG | P2 | architecture, security | 0 | 2026-11-11 |
| PAN-023 | End-to-end smoke tests | BACKLOG | P2 | ui, a11y | 0 | 2026-11-11 |
| PAN-024 | UI language | BACKLOG | P3 | ui | 0 | 2026-11-11 |

Order of work (dependencies): PAN-001 → PAN-002…008 → PAN-009 → PAN-010 → PAN-011 → PAN-013, PAN-014, PAN-015 → PAN-016 → PAN-012, PAN-019, PAN-022, PAN-023 → PAN-017, PAN-018, PAN-020, PAN-021, PAN-024.
Waiting on org-admin-api: PAN-010 ← USR-03, USR-03b · PAN-011 ← ADM-002, USR-02 · PAN-012 ← USR-04 · PAN-013 ← USR-01b (done), ADM-002 · PAN-014 ← ADM-001 (done) · PAN-015 ← USR-02 · PAN-016 ← ADM-004 · PAN-018 ← USR-06 · PAN-019 ← ADM-006.
API gaps (no org-admin-api ticket yet): admin sessions list/revoke (PAN-017), dashboard stats (PAN-020), reports (PAN-021).
Only PAN-009 can start now without waiting on the API.
