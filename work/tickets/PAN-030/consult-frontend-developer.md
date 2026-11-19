## PAN-030 consult: frontend-developer (read-only)

# PAN-030 consult (frontend/a11y). Read-only; nothing run. Line numbers are current as of 2026-11-18.

## Findings

Nothing is already fixed. Every AC item still reproduces. Two items are partly out of scope or already covered, noted below.

### A. List filters (PAN-029)

1. **Reset drops focus.**
   - The button is mounted only while `canReset` is true: `organizations-toolbar.tsx:44-48`, `apps-toolbar.tsx:78-82`. `canReset` comes from `organizations-table.tsx:141` and `apps-table.tsx:141`.
   - `ListSearchInput` (`src/components/data-table/list-search-input.tsx`) has no ref or focus handle. `ListSearchInput` takes no `ref`/`inputRef` prop, unlike `PickList`.
   - An existing test asserts the opposite of "stay mounted and disabled": `apps-table.test.tsx:442-454` ("no Reset when nothing is set"). So do not keep the button mounted.

2. **`--input` contrast.** `src/styles/theme.css:19` (light) is `oklch(0.929 0.013 255.508)`, about 1.2:1 on white. `:54` (dark) is `oklch(1 0 0 / 15%)`, about 1.4:1 on `--background` (`:38`, `oklch(0.129 0.042 264.695)`). Both fail 1.4.11.
   - `--input` is consumed by 11 primitives: `input`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`, `tabs`, `calendar`, `button` (outline variant), `input-otp`, and `password-input.tsx`.
   - `dark:bg-input/30` is also used as a fill (input, textarea, select, checkbox, radio, outline button, active tab). `switch.tsx:13` uses `bg-input` as the unchecked track colour.

3. **422 not tied to the search input.**
   - `organizations-table.tsx:182-185` and `apps-table.tsx:188-191` render a bare `<p role='alert'>` inside a `MessageRow`, with no id.
   - `ListSearchInput` accepts no `error`/`aria-*` props.
   - A 422 can also come from a status or other select filter, not just the search. The text "search or filters weren't accepted" is accurate, so marking the search field invalid is only a best guess. Search is the only free-text input and `SEARCH_MAX` is enforced client-side, so it is the likely cause but not certain.

4. **`aria-busy` on every fetch.**
   - `organizations-table.tsx:152` and `apps-table.tsx:160` use `aria-busy={q.isFetching}`.
   - `users-table.tsx:118` has the same pattern. It is not in the AC but is the identical defect.
   - Existing tests that depend on it:
     - `organizations-table.test.tsx:458-483` explicitly asserts `aria-busy` true while fetching and false after.
     - `organizations-table.test.tsx:32-40` and `apps-table.test.tsx:39-47` assert it during the initial load. Those still hold under the proposed change.
   - The `role='status'` line (`organizations-table.tsx:148-150`) is already mounted unconditionally and already says "Loading…" for pending and placeholder data. It needs no change.

### B. Roles (PAN-015b)

1. **Phase change (edit to confirm, and back).**
   - `role-permissions-dialog.tsx:189-202` (confirm block, no heading, no ref) and `:219-240` (footer swap). The focused Save button unmounts at `:248-255`.
   - `phase` is set at `:117`, `:99` (on send error) and `:226` (Back).
   - Not handled on the error path: `send()` failing sets `phase` back to `'edit'`, so focus is lost a second time there.

2. **Disabled buttons unlinked from reasons.**
   - Permissions dialog: Save (`:248-255`, `aria-disabled={!ready}`). The reason span (`:243-247`) has no id.
   - Create dialog: "Retry" (`role-create-dialog.tsx:320-327`) and "Create role" (`:330-337`) use `aria-disabled={pending || overLimit}`. The only text is the picker's `role='alert'` at `role-permission-picker.tsx:140-144`, which has no id.
   - Rename (`role-rename-dialog.tsx:154`) is pending-only. The sr-only status already covers it, so it is not needed.

3. **Loading and read-only.**
   - "Loading…" is only in the footer span (`role-permissions-dialog.tsx:131-134`, `:243-247`).
   - The sr-only status at `:214-216` only carries "Saving permissions…".
   - Read-only (`:53`, `:217`) hides the footer and shows no explanation. `readOnly` is derived from `useActionPermission('roles.setPermissions') === 'denied'`. The required permission is `admin:roles:manage` per the existing test title (`role-permissions-dialog.test.tsx:300`).

4. **Disabled menu-item reasons.** `roles-row-actions.tsx:79-92` ("Set as default", `disabled={noDefault}`) and `:97-109` (Delete, `disabled={deleteReason !== null}`).
   - Radix skips `disabled` items in roving focus, so the `<Reason>` text (`:17-21`) is unreachable by keyboard.
   - It also stacks `data-disabled:opacity-50` on `text-muted-foreground` text.

5. **Status regions inserted with their text.**
   - `roles/index.tsx:84` ("Loading apps…").
   - `role-create-dialog.tsx:289` ("Loading permissions…").
   - Same pattern, not listed in the AC: `role-holders-sheet.tsx:135` and `:146`. Check those two before deciding on scope.
   - `roles-table.tsx:93` is the correct pattern to copy.

6. **`focusOpener`.** `roles-dialogs.tsx:15-23`. The key goes unescaped into `[aria-label="Actions for ${key}"]` (the label is set at `roles-row-actions.tsx:49`). The result is a selector that can throw, not an injection. `document.querySelector` does not execute anything.

7. **`send()` readiness.**
   - `role-permissions-dialog.tsx:89-108` guards only on `inFlight`.
   - `save()` (`:110-119`) checks `ready`, but the confirm button calls `send()` directly (`:236`).
   - `selected` is `edit ?? base`. `removed` is computed live against `base`, which is `null` while the detail refetches (`fresh` requires `!isFetching`).
   - So during a refetch in the confirm phase, `held` is empty and `removed` is empty. The confirm list goes blank, yet "Remove and save" still sends the edit set.
   - If `edit` is non-null, that set is the full replace. Re-check is justified.

### C. Assignments (PAN-015c)

1. **Bidi in aria-label.** `assign-pickers.tsx:188` has `aria-label={`Choose ${rowName(row)}`}`. `rowName` is `u.email` (`:260`) or `o.name` (`:304`), both API data.
   - A sanitizer already exists: `sanitizeUserAgent` in `src/features/users/data/sessions.ts` (tested in `sessions.test.ts:10-15`). It strips C0/C1 and bidi controls, but its name is UA-specific.
   - The visible "Choose" is inside the accessible name, so 2.5.3 holds either way.

2. **Org error when the org field is hidden.**
   - `role-assign-dialog.tsx:239-243`. When `!user` and `!showOrg`, `orgChosen` is false (`:156`), so `setOrgError('Choose an organization.')` runs.
   - The text is not rendered when the field is hidden. The error is hidden by `orgScope`, and `:548` renders only when `orgScope !== 'org'`.
   - But `orgError` lingers in state. If the app changes to one with an org field, a stale error can show. The review noted it as harmless; the lingering state is the real, small defect.
   - The same line picks the focus target as `!user ? userInputRef : orgInputRef`. That is correct only in the cases where the org field exists.

### D. Users status dialog (PAN-017)

- `users-status-dialog.tsx:69` still says "They will be signed out of every mmlabs app: all their sessions are revoked and any password-reset or verification links stop working."
- The test that pins the old claim is `users-status-dialog.test.tsx:88` (`/signed out of every mmlabs app/`). It also asserts `/sessions are revoked/` (`:90`) and the reset/verification-links text (`:93`).
- The BUG-001 copy exists in `src/features/users/data/sessions.ts:6,9,12`, and `assignments.ts:15-16` carries the same distinction.
- The copy guard `sessions.test.ts:42-56` bans `signed out|immediately|logged out`. It covers only the three sessions constants, not the status dialog.
- I could not confirm from `src/api` what the API actually revokes on disable. The only hit in `schema.d.ts` is the audit action name list. The "reset and verification links stop working" claim is therefore unverified from this repo (see Open questions).

## Recommendations

### 1. List filters

- **Reset focus (minimal).** Give `ListSearchInput` an optional `inputRef?: React.Ref<HTMLInputElement>` prop, as `PickList` already does at `assign-pickers.tsx:43`. In each table, hold a `useRef` and call `inputRef.current?.focus()` inside `onReset`. Pass the ref through the toolbar. Do not keep the button mounted, because of the existing test.
  - Order matters. `onReset` updates the URL, and `ListSearchInput`'s `useEffect` on `value` resets the draft. Focusing the input synchronously is safe because the input stays mounted.
  - Shared change: put the ref on `ListSearchInput` and add a small prop to both toolbars. Do not duplicate logic.
  - **Test (discriminating, in `organizations-table.test.tsx` and `apps-table.test.tsx`).** Set a filter, click "Reset filters", then assert `expect(document.activeElement).toBe(searchInput)` or `await expect.element(screen.getByLabelText('Search organizations')).toHaveFocus()`. Today focus is `<body>`, so it fails before the fix.

- **Contrast tokens (`theme.css:19`, `:54`).** Approximation used: for grey, relative luminance Y is about L cubed. White has Y=1. Dark `--background` has Y about 0.0022. Required: ≥3:1.
  - Light:
    - `--input: oklch(0.6 0.03 257.417);`
    - The new value has Y about 0.216, so the ratio is (1.05)/(0.266) = **about 3.9:1** on white. L=0.62 gives about 3.65:1 if a lighter look is wanted. Do not go above 0.66.
  - Dark:
    - `--input: oklch(0.55 0.03 264.364);`
    - Opaque. Y about 0.166, ratio (0.216)/(0.052) = **about 4.2:1** on `--background`. For comparison, 0.50 gives about 3.4:1.
  - Both values are estimates. The test below will measure them properly.
  - **Test.** A Vitest unit test that does `import css from '@/styles/theme.css?raw'`. Extract `--background` and `--input` from the `:root` and `.dark` blocks, convert OKLCH to sRGB to luminance, and assert contrast ≥ 3 in both themes.
    - Do the dark case by compositing any alpha over `--background`.
    - It fails today: about 1.2 and 1.4.
    - It avoids needing the CSS in the browser run, because `vite.config.ts` does not load the theme in tests.
    - A new small helper (`oklchToSrgb`, `contrast`) is needed (about 25 lines). Check `src/lib` for any existing colour helper first. I did not find one.

- **422 to search input.**
  - Add `invalid?: boolean` and `describedBy?: string` props to `ListSearchInput`, applied as `aria-invalid={invalid || undefined}` and `aria-describedby`. The audit-log filters already do the same at `audit-log-filters.tsx:260`.
  - Put `id` on the 422 `<p role='alert'>`. Use `useId` in the table, or a fixed constant.
  - Make the message say what to change: "The search or filters weren't accepted. Shorten or change the search." Keep the `role='alert'`.
  - **Test.** Mock a 422, then assert the search input `toHaveAttribute('aria-invalid', 'true')` and that `aria-describedby` equals the alert's id. Also assert that the attribute is absent in the no-error state.

- **`aria-busy`.** Change to `aria-busy={view.status === 'pending' || q.isPlaceholderData}` in both tables. Apply the same to `users-table.tsx:118` only if the owner agrees, since it is outside the AC. Update `organizations-table.test.tsx:458-483`, which currently expects `true` during a background fetch.
  - **Test.** After the first load settles, trigger a refetch (invalidate the query), then assert `aria-busy` is `false`. For `isPlaceholderData`, change a filter and assert `true`. Before the fix the refetch case fails.

### 2. Roles

- **Phase change focus.**
  - Give the confirm block a heading and `tabIndex={-1}` with a ref. Focus it in a `useEffect` keyed on `phase === 'confirm'`.
  - On Back, focus the Save button. On the `send()` failure path, focus the alert box that `RoleAlertView` renders (or Save).
  - Use `aria-live`-free focus: moving focus to the heading already announces it.
  - **Test.** Select a removal, click Save, assert focus is on the confirm heading (`toHaveFocus`). Click Back, assert focus is on Save. Fails today (focus on body).

- **Reason links.**
  - Permissions dialog: add `id` to the reason span at `:243-247` and `aria-describedby={reason ? id : undefined}` on Save.
  - Create dialog: add `id` to the picker's over-limit alert. `RolePermissionPicker` needs an `id` or `limitId` prop, or the create dialog should render its own message with an id.
  - **Test.** Assert `getByRole('button', {name:'Save'})` `toHaveAccessibleDescription(/Loading|at most 200/)`.

- **Loading and read-only.**
  - Put "Loading…" into the always-mounted status at `:214-216` (extend the text to `pending ? 'Saving permissions…' : waiting ? 'Loading…' : ''`). Keep the visible footer text. Do not render both as live regions.
  - For read-only, add a visible paragraph near the footer position, such as "You can view these permissions but not change them (needs admin:roles:manage)", where `:217` hides the footer.
  - **Test.** Read-only: assert that text is visible. Loading: assert the `role=status` has the loading text while `ready` is false.

- **Menu item reasons.** Replace `disabled` with `aria-disabled='true'` plus `onSelect={(e) => e.preventDefault()}` and an `onClick` guard, on both Set as default and Delete. Keep the greyed styling with `aria-disabled:opacity-50`, but make `<Reason>` text colour not rely on the dimmed state (drop the opacity for the reason span, or use `text-foreground/80`). Keep the reason inside the item so it is read as part of the accessible name.
  - Beware: existing tests that use `toBeDisabled()` on these items will need to move to `aria-disabled`. grep `roles-row-actions` tests before changing.
  - **Test.** Open the menu, arrow-key to the disabled Delete (it must be reachable), assert `aria-disabled="true"`, assert its text includes the reason, press Enter, and assert no dialog opened.
  - This is the riskiest roles change (Radix behaviour). If time is short, the alternative is to keep `disabled` and add the reason to the Actions button `aria-describedby`. Defer is acceptable (see Risks).

- **Status regions.**
  - Add a small shared `StatusRegion` (always mounted, text only changes), as the review suggested. Use it at `roles/index.tsx:84`, `role-create-dialog.tsx:289`, and `role-holders-sheet.tsx:135/146` if included.
  - **Test.** Render with a pending query. Assert the `role=status` element exists, then resolve and assert the same DOM node's text changed (hold a reference to the node from before). A guard that "the element is the same node" is what discriminates.
  - Pitfall: at `roles/index.tsx:79-84` the whole page is an early return. The status needs to remain mounted across pending to success, which it cannot do because the subtree is replaced by `RolesProvider`. In that case, announce through an sr-only `role=status` that wraps the early-return branch only, or accept "Loading apps…" being announced by a persistent wrapper rendered by `RolesPage` itself. Do not spend more than a small change on this.

- **`CSS.escape`.** `roles-dialogs.tsx:19`: `` `[aria-label="Actions for ${CSS.escape(key)}"]` ``. `CSS.escape` escapes `"` and `\`, so it is correct inside a quoted attribute value.
  - **Test.** A unit test with a key like `a"b]`: the lookup must not throw and must find the button. Today `querySelector` throws a `SyntaxError`.
  - Roles keys are constrained, so this is hardening only.

- **`send()` readiness.** At the top, `if (inFlight.current || !ready) return`. Also disable the confirm button visibly with `aria-disabled` when `!ready` (it is only guarded by pending at `:234`).
  - **Test.** Enter the confirm phase, force a role refetch that stays pending, click "Remove and save", assert there is no PUT request. Without the guard, one is sent.

### 3. Assignments

- **Bidi.** Export a general `stripControlChars` (or reuse `sanitizeUserAgent` unchanged, importing from `../data/sessions`). Apply it in the `rowName` callbacks at `assign-pickers.tsx:260` and `:304`, or at `:188`. The `aria-labelledby` alternative needs ids and is more change, so prefer sanitizing.
  - Fallback: if the sanitized name is empty, use "this row". The existing `role-assign-dialog.test.tsx:735-739` already covers display-side handling.
  - **Test.** Use a user or org with `name: 'Evil‮org'`. Assert the Choose button's accessible name (`getByRole('button', {name: /^Choose Evilorg/})`) and that its `aria-label` contains no `‮`.

- **Org error.** `role-assign-dialog.tsx:241`: change to `if (showOrg && !orgChosen) setOrgError(...)`. Make the focus choice `!user ? userInputRef : orgInputRef` unaffected (the outer condition already requires `showOrg` for the org branch).
  - **Test.** App with `org_mode: 'none'`, submit with no user chosen. Assert the user error appears and nothing about "Choose an organization". Then switch to an org-enabled app and assert no stale org error is shown.

### 4. Users status dialog copy

- Replace `:69` with BUG-001-consistent wording, for example: "Their access to this admin app ends on their next admin request. Tokens already issued to other apps stay valid until they expire, up to 12 hours. They can't sign in until re-enabled."
- Export it as a constant (for example `DISABLE_EFFECT` in `users/data/`) so it can be copy-guarded like `sessions.test.ts:42-56`. Reuse `APP_TOKEN_MAX_HOURS` from `assignments.ts:11` so the "12" is not a second literal.
- Keep or drop the "sessions are revoked / reset and verification links stop working" sentences depending on the answer in Open questions. Do not repeat the hours claim in new wording.
- **Test.** Update `users-status-dialog.test.tsx:81-96` to assert `next admin request` and `up to 12 hours`, and `not.toMatch(/signed out|immediately|logged out/i)`. Do not leave the old text assertions at `:88-95` unless those sentences are kept.

## Risks

- **Changing `--input` affects 11 primitives plus `password-input`.** Expected visible changes:
  - Light: every input, select, textarea, checkbox, radio, outline button, calendar day and tab gets a visibly darker border. Switch unchecked track also darkens (`switch.tsx:13`). White thumb on a 0.6 grey track still reads fine.
  - Dark: `dark:bg-input/30` and `dark:hover:bg-input/50` fills change from about 4.5% white to about 30% of a mid-grey. Fills get lighter, roughly 0.006 to 0.021 luminance. Text contrast stays fine (muted text on that fill is about 5.6:1), but the look changes everywhere, including the outline Button hover.
  - Do a visual pass on a form-heavy page (organizations action dialog, user-auth-form) in both themes before merging. Check that no snapshot or screenshot tests exist (I found none; PAN-023 is not landed).
- **Focus cue regression.** Focus state is `focus-visible:border-ring` with `--ring` light `oklch(0.704 0.04 256.788)` (about 2.6:1) and dark `oklch(0.551 0.027 264.364)`. After the change the focused border is lighter than the resting border in light mode, and equal to it in dark mode. Only the 3px `ring-ring/50` distinguishes focus. Recommend darkening light `--ring` to `oklch(0.554 0.046 257.417)` (same as `--muted-foreground`, about 4.7:1) and, in dark, using input `oklch(0.52 0.03 264.364)` (about 3.7:1) so it differs from `--ring`. That touches focus on every control, so it is a decision for the owner. Without it the contrast fix still passes 1.4.11 but weakens 2.4.7/2.4.13 indication.
- **Disabled-but-focusable menu items** change Radix behaviour. Tests using `toBeDisabled()` and any `getByRole('menuitem', {disabled})` queries break. Check before committing to this approach.
- **`aria-busy` change.** It breaks `organizations-table.test.tsx:458-483` by design. Rewrite it, do not delete it.
- **Status-region pitfall.** On `roles/index.tsx` the loading state is an early return, so "mounted before the text changes" cannot be satisfied by simply moving the `<p>`. The fix needs a persistent wrapper, or a narrower scope.
- **Scope (R7).** Several items touch shared components (`ListSearchInput`, `RolePermissionPicker`, a new `StatusRegion`). Keep the diff to the listed fixes, and do not retrofit other screens.

## Better deferred or split

- **Menu items with `aria-disabled`** and the `StatusRegion` shared component are the highest-risk, lowest-severity items. If the diff gets big, ship the other items and defer them, or take the simple alternative (reason on the trigger's `aria-describedby`).
- **`users-table.tsx:118` `aria-busy`** and `role-holders-sheet.tsx` status regions are identical defects outside the AC. Fix only if the owner says so; otherwise record as follow-ups.
- **Focus-ring token change** (see Risks) should be its own decision, not bundled silently.
- **Axe-core scans** need PAN-023 and are out of scope here.
- **PAN-015b 💭 notes not in the AC** (region landmarks and h4 jump in the picker, `<th scope='row'>` for Key, "1 permissions" pluralisation, the em dash in the Privileged column, `aria-describedby` for the picker helper). The AC does not list them. Leave them as follow-ups.
- **PAN-015c N1-N4** (email in query key, DST label, org UUIDs in tables, user snapshot) are not in this ticket.

## Open questions

1. **Disable semantics.** Does org-admin-api's PATCH to disable a user really revoke all sessions and invalidate reset and verification links? I could not confirm this from `src/api`. If not, drop those two clauses from the copy, since R9 says copy must not overclaim. If yes, keep them alongside the BUG-001 wording. Someone should check the endpoint description in `/openapi.json` or ask org-admin-api.
2. **Focus tokens.** Should the PAN-030 diff also darken `--ring`, or only `--input` (see Risks)?
3. **Reset focus target.** The ticket allows "search input" or "button stays mounted". I recommend the search input because of `apps-table.test.tsx:442-454`. Confirm the existing test should stay as is.
4. **`aria-busy` scope.** Include `users-table.tsx:118` for consistency, or leave it?
5. **Holders sheet.** Include `role-holders-sheet.tsx` "Loading…" regions in the status-region fix?

## Files

- `/home/user/admin-pan/src/styles/theme.css`
- `/home/user/admin-pan/src/components/data-table/list-search-input.tsx`
- `/home/user/admin-pan/src/features/organizations/components/organizations-table.tsx`, `organizations-toolbar.tsx`, `organizations-table.test.tsx`
- `/home/user/admin-pan/src/features/apps/components/apps-table.tsx`, `apps-toolbar.tsx`, `apps-table.test.tsx`
- `/home/user/admin-pan/src/features/users/components/users-table.tsx`
- `/home/user/admin-pan/src/features/roles/components/role-permissions-dialog.tsx`, `role-create-dialog.tsx`, `role-permission-picker.tsx`, `roles-row-actions.tsx`, `roles-dialogs.tsx`, `role-holders-sheet.tsx`
- `/home/user/admin-pan/src/features/roles/index.tsx`
- `/home/user/admin-pan/src/features/users/components/assign-pickers.tsx`, `role-assign-dialog.tsx`, `users-status-dialog.tsx`, `users-status-dialog.test.tsx`
- `/home/user/admin-pan/src/features/users/data/sessions.ts`, `sessions.test.ts`, `assignments.ts`
