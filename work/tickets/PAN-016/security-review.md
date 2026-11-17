## Attempt 1

**PASS: no 🔴 blockers and no 🟡 should-fix items.** I reviewed the src/docs diff. For the snapshot I checked the `x-permission` values and the shape of the audit operation against 8a4efb2. Typecheck passes. Lint, test and build belong to the reviewer.

### Verified
- **R6, XSS:** no `innerHTML`, `dangerouslySetInnerHTML`, `href`, `window.open` or `location` was added. Every audit field is rendered as React text only:
  - `changes` through `formatValue`, capped at 500 characters, and as JSON in a `<pre>` (`audit-log-detail-sheet.tsx:499-578`);
  - `actor_label`, `user_agent` and `ip` in `<dd>` (`:348-368`);
  - `request_id` in a `<span>`, copied with `clipboard.writeText`;
  - unknown enum values fall back to the raw string, still as text.

  The regression test (`audit-log-detail-sheet.test.tsx:82-95`) feeds in `<img onerror>` and `<script>` payloads and checks that no element is created. The CSV export, a formula-injection risk, has been removed.
- **R5, PII:**
  - The URL schema (`data/search.ts:19-31`) accepts only enums, an app key that matches the pattern, `z.guid()` values and `yyyy-MM-dd` dates; anything else becomes `undefined`.
  - `toAuditListParams` (`api/queries.ts:56-78`) checks again before calling the API.
  - `TextFilter` (`audit-log-filters.tsx:847-854`) commits only valid or empty text.
  - The free-text email filter is gone. The users links put only a uuid in the URL.
  - No new `console` calls; the toasts use fixed text.
- **R4:**
  - `admin:audit:read` is in `ADMIN_PERMISSIONS`. The route requires `perm('admin:audit:read', 'GET /api/v1/audit-logs')` and the `audit.view` action uses the same key (`registry.ts:10, 70-73, 142`). This matches the API router.
  - The sidebar is gated through the route, and the users links through `<Can action='audit.view'>`, which has a test.
  - A 403 shows `ForbiddenPanel` (`audit-log-table.tsx:1098-1105`), including a 403 on refetch. A 422 offers Reset.
- **Snapshot:** the `x-permission` values are the 8 existing keys plus `admin:audit:read`. The audit params (uuids, enums, `app_key` pattern, date-time, `limit` ≤ 100) match 8a4efb2. `/me/permissions` is still there. No sign of hand edits.
- **`errors.ts`:** a type-only change: a comment, plus `export type ErrorEnvelopeWire`. Runtime parsing is unchanged, and an `expectTypeOf` test was added.

### Notes
- 💭 `audit-log-detail-sheet.tsx:570-572`: the Raw JSON `<pre>` has no length cap. That is a rendering cost, not XSS. Optionally cap it at about 20k characters.
- 💭 `src/api/errors.ts:1-2`: the comment no longer says the zod envelope is a hand-written R2 exception. Suggested wording: "Runtime zod parser (hand-written, R2 exception); errors.test.ts checks the generated `ErrorEnvelope` fits it."
- 💭 `user_agent` and `actor_label`: the API already strips control, bidi and zero-width characters (`service.py:31-33`), and `actor_label` is at most 64 characters, so no client-side stripping is needed.

### Follow-ups
- F1, F2 and F3 cover the removed CSV export and the org link. None of them may put an email in a URL.
