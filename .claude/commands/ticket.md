---
description: Create a new ticket in work/ from a short description.
argument-hint: "<description> [P1|P2|P3]"
---

Create a ticket from: `$ARGUMENTS`

1. Read `work/backlog.md`. The new ID is `PAN-XXX` (3 digits): the highest existing ID (including any "Renamed / merged" table) + 1. Never reuse an ID.
2. Create `work/tickets/<ID>/ticket.md` from `work/templates/ticket.md`:
   - **Goal**: one or two sentences, in English.
   - **Spec reference**: the section(s) of `docs/spec-v1.md` this ticket implements. If none fits, say so and ask the owner whether it is in scope (or suggest `/idea` first) before creating the ticket.
   - **Acceptance criteria**: 3–7 testable bullets derived from the description and the spec (screens, states, permissions, errors). Do not invent requirements.
   - **Areas**: any of `architecture`, `ui`, `ux`, `api`, `auth`, `security`, `a11y` that genuinely apply.
   - **Depends on**: other `PAN-xxx` tickets, and the org-admin-api tickets that provide the endpoints it needs, written `org-admin-api <ID>` (look them up in that repo's `docs/identity-architecture.md` §4 and `work/backlog.md`). If an endpoint the ticket needs is not planned in org-admin-api at all, say so — the owner must add an API ticket there first.
   - **Priority**: from the argument if given, else `P2`. State `BACKLOG`, attempts `0`.
3. Add a row to the table in `work/backlog.md`, and add the ticket's dependencies to the "Order of work" line.
4. If the description clearly contains more than one deliverable (e.g. several screens), propose a split instead and ask which to create.
5. Do not commit. Show the owner the ticket in a short Vietnamese summary.
