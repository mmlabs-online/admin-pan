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
| PAN-011b | Hide/disable nav and actions from the caller's real admin permissions | DONE | P2 | auth, ui, security | 1 | 2026-11-17 |
| PAN-011 | Permission-aware UI and 403 handling | DONE | P1 | auth, ui, security | 1 | 2026-11-16 |
| PAN-012 | Forgot password and reset password pages | DONE | P2 | auth, ui, security | 1 | 2026-11-15 |
| PAN-012b | Verify-email page | DONE | P2 | auth, ui, security | 1 | 2026-11-15 |
| PAN-010b | Resend verification email from the admin UI | DONE | P2 | auth, ui, security | 2 | 2026-11-17 |
| PAN-012c | Retire the forgot-password page on admin (ADM-002d) | DONE | P2 | auth, ui, security | 1 | 2026-11-17 |
| PAN-013 | Users screen on the real API | DONE | P1 | api, ui | 1 | 2026-11-16 |
| PAN-014 | Organizations screen on the real API | DONE | P1 | api, ui | 1 | 2026-11-17 |
| PAN-015 | Apps registry and app permissions on the real API | DONE | P1 | api, ui, auth | 1 | 2026-11-17 |
| PAN-015b | Roles and role permissions on the real API | DONE | P1 | api, ui, auth | 0 | 2026-11-18 |
| PAN-015c | Role assignments (assign, revoke, holders of a role) on the real API | DONE | P1 | api, ui, auth, security | 1 | 2026-11-18 |
| PAN-016 | Audit log on the real API | DONE | P2 | api, ui | 1 | 2026-11-17 |
| PAN-017 | User sessions: list and revoke | DONE | P2 | api, ui, security | 1 | 2026-11-17 |
| PAN-018 | Organization members and invitations | DONE | P3 | api, ui | 0 | 2026-11-26 |
| PAN-019 | Org product entitlements screen | DONE | P2 | ui, api | 1 | 2026-11-17 |
| PAN-020 | Dashboard stats on the real API | DONE | P3 | api, ui | 1 | 2026-11-18 |
| PAN-021 | Reports on the real API | BACKLOG | P3 | api, ui | 0 | 2026-11-11 |
| PAN-022 | Release and deploy to admin-portal.mmlabs.online | DONE | P2 | architecture, security | 1 | 2026-11-16 |
| PAN-023 | End-to-end smoke tests | DONE | P2 | ui, a11y | 1 | 2026-11-17 |
| PAN-024 | UI language | DONE | P3 | ui | 0 | 2026-11-26 |
| PAN-025 | Self-host the Inter and Manrope fonts | DONE | P2 | ui, security | 1 | 2026-11-16 |
| PAN-026 | Upgrade dependencies with known security advisories | DONE | P1 | architecture, security | 1 | 2026-11-16 |
| PAN-027 | App credentials (list, issue, revoke) | DONE | P2 | api, ui, security | 1 | 2026-11-17 |
| PAN-028 | App join requests (list, approve, reject) | DONE | P2 | api, ui, auth | 2 | 2026-11-17 |
| PAN-029 | Filters and sort for the Organizations and Apps lists | DONE | P1 | api, ui, a11y | 0 | 2026-11-18 |
| BUG-002 | Row dialogs close themselves when re-opened within 500 ms (flaky dialog/toast tests) | DONE | P1 | ui, a11y | 0 | 2026-11-18 |
| PAN-030 | Accessibility and safety follow-ups (Roles, Assignments, list filters) | DONE | P2 | ui, a11y, security | 1 | 2026-11-18 |
| PAN-031 | Success toasts in mutation hooks; dialog-host and test robustness | DONE | P2 | ui | 0 | 2026-11-18 |
| BUG-001 | Session revoke copy says admin tokens stay valid up to 12 h | DONE | P1 | ui, auth | 1 | 2026-11-18 |
| BUG-003 | First Sign in click lands back on the sign-in page; a second click is needed | DONE | P1 | ui, auth, security | 0 | 2026-11-27 |
| PAN-032 | Sign-in form: keep focus while busy and announce "Signing in…" | IN_PROGRESS | P2 | ui, a11y | 0 | 2026-11-27 |
| PAN-033 | Adopt an @mmlabs/auth-client whose login() resolves after the provider state is updated | BACKLOG | P3 | auth, security | 0 | 2026-11-27 |

Order of work (dependencies): PAN-001 → PAN-002…008 → PAN-009 → PAN-010 → PAN-011 → PAN-013, PAN-014, PAN-015 → PAN-016 → PAN-012, PAN-019, PAN-022, PAN-023 → PAN-025 → PAN-026 → PAN-027 (after PAN-015) → PAN-019, PAN-028 → PAN-017, PAN-018, PAN-020, PAN-021, PAN-024 · PAN-029 (after PAN-014, PAN-015; org-admin-api ADM-020, USR-18) → BUG-002 → PAN-030, PAN-031 · BUG-003 → PAN-032; BUG-003 → PAN-033 (after a fixed @mmlabs/auth-client release; library ticket needed).
Waiting on org-admin-api (state 2026-11-16, origin/main 0899731): PAN-010b ← new org-admin-api ticket allowing resend for `admin` (ADM-002d refuses it) · PAN-011 ← an endpoint returning the caller's effective admin permissions (no ticket yet) · PAN-018 ← USR-06 · PAN-019 ← ADM-006. Met: USR-08, ADM-002, ADM-002b, ADM-004, ADM-012.
API gaps (no org-admin-api ticket yet): caller's admin permissions (PAN-011), resend for `admin` (PAN-010b), admin sessions list/revoke (PAN-017). Proposed on org-admin-api: dashboard stats ADM-015 (PAN-020), member_count ADM-016 (PAN-015), reports ADM-017 (PAN-021).
Ready now (2026-11-17, org-admin-api c41ef57: ADM-006 entitlements and USR-03g join requests DONE): PAN-019 → PAN-028. PAN-015b/c wait on an admin role list and a role-holders endpoint; PAN-017 on USR-10; PAN-020 on ADM-015; PAN-021 on ADM-017.
