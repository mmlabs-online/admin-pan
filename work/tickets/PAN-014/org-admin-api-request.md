# Request to org-admin-api from admin-pan (2026-11-16)

Paste the prompt below into an org-admin-api session. Its planner owns the final design.

---

```
/ticket "Filters and sort for the staff organizations list" P1
```

Context: admin-pan PAN-014 puts the Organizations screen on the real API. `GET /api/v1/organizations` accepts only `limit` and `offset`. The order is fixed (`created_at DESC, id`), and unknown query params are silently ignored. The admin UI needs server-side filters so staff can find an organization without paging through the whole list. The admin-pan owner decided (2026-11-16) to wait for this rather than ship a list without search.

Proposal (adjust as your planner sees fit):

- **`status`**: optional, `active` | `suspended`, one value.
- **`q`**: optional, trimmed, 1..100 chars.
  - Case-insensitive substring match on `name` OR `slug`.
  - Escape LIKE wildcards, as the users `email` filter already does.
  - Empty → 422, or treat it as absent. Document which.
- **`sort`**: optional, an allow-list only, e.g. `created_at`, `-created_at` (default), `name`, `-name`, `slug`, `-slug`.
  - Always add `id` as a tie-breaker, so offset paging stays stable.
  - Unknown value → 422.
- **Response shape:** keep `Page<OrganizationRead>`, with `total` = the filtered count.
- **Indexes:** consider them for `lower(name)` / `slug` (trigram or `text_pattern_ops`). The table is small today, so this is optional.
- **Unknown params:** consider rejecting them (or at least `extra` params on list routes), so a client typo does not silently return unfiltered data. Optional.
- **Tests:**
  - each filter alone and combined;
  - escaping (`%`, `_`);
  - sort order plus the tie-breaker;
  - 422 for a bad `status` / `sort` / empty `q`;
  - 403 without `admin:organizations:read`.
- **OpenAPI:** keep it accurate. Please also declare the 404 (get/patch/delete) and 409 (duplicate slug, `code: conflict`) responses, so admin-pan's generated types show them.
- **Consumer:** admin-pan PAN-014. When this is DONE and merged, admin-pan unblocks PAN-014.

Optional, same ticket or a follow-up: the same `sort` param on `GET /api/v1/users` (admin-pan PAN-013 had to disable column sorting).
