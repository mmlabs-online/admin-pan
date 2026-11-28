# PAN-034 — security review

## Attempt 1

**Security review: PAN-034, attempt 1** (`git diff origin/main...HEAD -- src/ e2e/ docs/adr/`, read-only)

I ran typecheck, lint and format:check, and all pass. `pnpm test src/features/apps src/lib/permissions` passed: 17 files, 177 tests. I did not run build or the e2e suite.

## Findings

No 🔴 blockers and no 🟡 should-fix items. Each point you asked about:

1. **ADR 0007 (one-time secret handling) still holds.**
   - `src/features/apps/api/queries.ts:338-349`: the mutation variables are `{ scope, onSecret }`. The secret is split off from `meta` and handed to the sink. There is still no `mutationKey`, and the body is exactly `{ scope }`.
   - `app-credential-issue-dialog.tsx:105-119`: the secret goes only into component state. There is no toast.
   - The scope lives only in react-hook-form state (`:82-89`). It is not in the URL or a query key.
   - The react-hook-form `<form>` wraps only the Scope select (`:406-441`). The reveal input is in the other branch (`:155-235`), outside any form. Its anti-autofill attributes and the masked `mmak_<key_id>_••••` value are unchanged.
   - The leak regression now runs for both `manifest` and `org-members:read` (`app-credential-issue-dialog.test.tsx`, `it.each`). It checks the mutation and query caches, DOM, storage, URL, console and toasts. The ADR 0007 amendment matches the code.
2. **No runtime scope is preselected.** `defaultValues: { scope: undefined }` and zod `z.enum` make the field required. A test confirms that "Select a scope." is shown, linked with aria-describedby, and no POST is sent.
3. **Runtime-scope warnings are in place.**
   - Confirm view: an Alert (`:442-451`) says "Backend deploy environment only, never CI or browser code" and states the blast radius (all orgs of the app).
   - Reveal view: the copy is specific to the scope (`:385-387`).
   - Hints are in `data/data.ts:894-906`.
   - `limits:write` is never offered (`data.ts:869-881`).
4. **Refusal mapping is correct** (`data/errors.ts:240-260`).
   - `admin_app`, `app_disabled`, `scope_not_available` and `credential_limit` each map to their own message. `credential_limit` names the scope the user chose; nothing is echoed from the server.
   - 422 gives fixed copy. 403 `admin_wildcard_required` shows the super-admin panel.
   - Unknown-outcome handling is unchanged: the Issue button is removed and the list is refetched.
   - The e2e fake-api follows the API's refusal order.
5. **The new `super` requirement does not weaken R4 / ADR 0004.**
   - `source.ts:27` calls `check('admin:*')`, and `permits.ts:12` grants that only for a literal `admin:*`. Holding `admin:apps:write` alone gives `denied`, which is stricter than before. `unknown` still fails open, as ADR 0004 intends.
   - `can.tsx:38-40` shows "Requires admin:*".
   - `registry.test.ts` checks `base` against `x-permission` and `when` against `x-requires-super` (present at `openapi.json:4822`).
   - 403 handling in the dialog is unchanged.
6. **The admin app is limited to releases.** `credentialScopeOptions('admin')` returns `['releases']` (`data.ts:878-881`). Tests cover this. The confirm view calls the key a control-plane CI secret (`dialog.tsx:402-403`), and the API still enforces the limit.

Three 💭 notes, none needing a fix in this ticket:
- `src/components/permissions/route-permission-guard.tsx:31`: a `super` requirement in the `denied` state is not special-cased, so the route renders its children (fails open). ADR 0004's amendment says `super` is not used on routes, which makes this harmless today. If you want it enforced, narrow the route requirement type to exclude `super`, or handle it the same way as `permission`.
- `src/lib/permissions/source.ts:27`: `when: 'conditional'` is evaluated as always needing `admin:*`. For PAN-034b, use it only on the Super-admin role field, never on the whole Save button. Otherwise staff without `admin:*` will be blocked from editing other fields.
- `app-credential-issue-dialog.tsx:316-326`: the confirm button reads "Issue credential" and does not include the scope. The scope is visible in the select in the same view, so this is acceptable. Naming it in the button (my consult suggestion) would be a small hardening.

## Follow-ups (out of scope)
- PAN-034b: apply the (field, reason) error table and the role-diff and confirmation rules from my consult, and keep `conditional` limited to the Super-admin field.

**Summary:** PASS from security: ADR 0007 is intact (leak test runs for a runtime scope too), no scope is preselected, runtime warnings and refusal copy are correct, `super` only makes permission checks stricter, and the admin app is limited to `releases`.

## Attempt 2

**Security review: PAN-034, attempt 2** (`git diff HEAD~1 -- src/`, commit b85586e, read-only)

I did not run checks in this pass. The diff is small and only touches presentation.

## Findings

No 🔴 blockers and no 🟡 should-fix items. I checked each point you asked about:

1. **ADR 0007 one-time secret handling is unchanged.** The diff does not touch the reveal branch, `queries.ts`, or the mutation or query cache. The secret path is the same as in attempt 1: component state only, a masked value, no toast. `form.setFocus('scope')` (`app-credential-issue-dialog.tsx:254-257`) only moves focus. `triggerRef={field.ref}` (`:274`) and `aria-required` (`select-dropdown.tsx:44-49`) are DOM attributes and carry no data.
2. **No runtime scope is preselected.** `defaultValue={field.value ?? ''}` is unchanged. Adding `required` and moving focus on an invalid submit does not pick a scope. The test (`app-credential-issue-dialog.test.tsx:326-327`) checks that focus goes to the trigger and that `aria-required="true"` is set.
3. **The runtime warning is still shown, now once instead of twice.**
   - The diff removed the confirm-view `<Alert>` that repeated "Backend deploy environment only, never CI or browser code." (old `:286-293`).
   - That sentence still appears for every runtime scope through `FormDescription` → `credentialScopeHints[chosen]` (`app-credential-issue-dialog.tsx:284-288`, `data/data.ts:101-111` `RUNTIME_ADVICE`). `FormDescription` is linked to the trigger by aria-describedby.
   - The blast-radius line is still rendered for runtime scopes, now as `<p role='status' aria-live='polite'>` (`:295-300`).
   - Tests still assert both the advice (`test.tsx:81`, and `data.test.ts:29-41` for every runtime hint) and the blast-radius copy (`test.tsx:382-384`).
   - 💭 One note: the blast-radius line is now plain `text-sm` text, not an Alert, so it stands out less visually. This is acceptable because the advice is in the field description, which is announced with the control. If you want a small hardening, give it `font-medium`. It is not required.
4. **No new data in logs, URLs or storage.** The diff adds no `console` calls, navigation, search params or storage writes. The only interpolated value in the live region is `app.name`, which is public app metadata already shown in the dialog.

## Follow-ups (out of scope)
- None new. The attempt-1 notes still apply: the `super` requirement on route guards, `conditional` used only on the Super-admin field (PAN-034b), and an optional scope name in the Issue button.

**Summary:** PASS from security: the attempt-2 changes are a11y-only. The one-time secret handling is untouched, nothing is preselected, and the runtime advice and blast-radius warning are still shown and tested.
