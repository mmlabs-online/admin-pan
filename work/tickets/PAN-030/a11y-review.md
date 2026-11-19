# PAN-030: accessibility review

## Attempt 1

PAN-030 a11y review (WCAG 2.2 AA), read-only, based on the diff and code reading. I did not run axe, a screen reader or `pnpm test`. Verdict: no 🔴 blockers. All targeted findings are fixed correctly. There are two 🟡 should-fix items and a few 💭 notes.

## Targeted findings: verified

- **Reset focus (2.4.3).** Fixed. `apps-table.tsx` (onReset) and `organizations-table.tsx` call `searchRef.current?.focus()` after clearing, so focus no longer drops to `<body>` when the Reset button unmounts.
- **--input / --ring contrast (1.4.11).** Fixed.
  - `theme.css` now has `--input` L0.62 in light, about 3.6:1 on white. In dark it is L0.52, about 3.6:1 on the dark background.
  - `--ring` is darker in light (L0.446, about 7:1) and lighter in dark (L0.704).
  - `theme-contrast.test.ts` pins both themes with a correct OKLCH-to-linear luminance computation.
  - `input.tsx` and `select.tsx` also use a full-opacity `border-ring` on focus, so the input and select focus indicator is solid.
- **422 on search (3.3.1).** Fixed. `ListSearchInput` takes `invalid` and `describedBy`. Apps and organizations pass `aria-invalid` and `aria-describedby`, pointing at the `role=alert` message. The message now also says what to do about it.
- **aria-busy scope.** Fixed. In apps and organizations it is `pending || isPlaceholderData`. In roles it is `pending`. Background refetches no longer set it.
- **Permissions dialog.**
  - Phase focus: the confirm step heading is `tabIndex=-1` and receives focus on edit to confirm. On the way back, focus goes to the alert box if there is an alert, otherwise to Save. This is in `role-permissions-dialog.tsx`, the `useEffect` keyed on `phase`, with the heading at about line 228.
  - Status: the `role=status` region is always mounted and covers saving and loading.
  - Read-only: a visible explanation was added, naming `admin:roles:manage`.
  - Reason links: Save and the Remove button use `aria-describedby` to point at `reasonId`. The reason span is not rendered when there is no reason, so the description is never dangling.
  - `send()` re-checks readiness and stale state.
- **Role create dialog.** The status region is mounted before its text changes. `aria-describedby={limitId}` points at the picker's `role=alert` message, which only renders when over the limit, which is exactly when the describedby is set.
- **Row-menu items.** `roles-row-actions.tsx` uses `aria-disabled` with `onSelect` and `preventDefault`, plus an `onClick` guard. The items stay focusable by keyboard, and the reason sits inside the item so it is part of the accessible name. The reason text is `text-foreground/80`, which is readable. The disabled-looking `opacity-60` applies only to the label, which is exempt from contrast requirements.
- **Status regions mounted before text changes.** In `roles/index.tsx`, `loadingStatus` is the first child of a fragment in both the early-return and main-return trees. React therefore keeps the node across the pending-to-success transition.
- **Assignments.**
  - `toPlainLabel` strips bidi and control characters and falls back to a "result N" label, so the "Choose …" label cannot be spoofed.
  - The "Choose an organization." error is only set when `showOrg` is true.

## Regressions and new issues

1. 🟡 **1.4.11 Non-text Contrast / 2.4.7: the focus ring on buttons is weak in light mode.**
   - Location: `src/components/ui/button.tsx:7`.
   - `button.tsx` has `focus-visible:ring-ring/50` and no border, so buttons rely only on the 3px ring at 50% opacity. In light mode the new `--ring` at 50% over white is roughly 1.8:1, below 3:1.
   - It is still better than before and the dark theme is fine (about 4:1 or more). The same pattern applies to the `ring/50` halo on inputs, but those keep a solid `border-ring`.
   - Fix: in `button.tsx`, use `focus-visible:ring-ring` (full opacity), or add `focus-visible:outline-2 outline-ring`. Add the same to other buttons or links that use only the ring.
   - This is shadcn template code, so only touch it as a bug fix per CLAUDE.md. Otherwise record it as a follow-up.

2. 🟡 **3.3.1 Error Identification: the 422 marks the search input invalid even when a filter caused it.**
   - Location: `apps-table.tsx` (`rejected` is not scoped to the search term) and the equivalent in `organizations-table.tsx`.
   - The message says "search or filters", but only the search input gets `aria-invalid`. A screen-reader user with an empty search and a rejected filter hears an invalid empty field.
   - Fix: set `searchInvalid` only when `term` is non-empty, or accept this and word it as "the search or filters" in the description. The message already points to Reset.

3. 💭 **Permissions dialog, 4.1.3.** The `alertBox` wrapper `div` (`tabIndex=-1`) is focused only when returning to edit with an alert. A save failure in the confirm step relies on the `role=alert` live announcement alone, which is acceptable. The wrapper is a non-interactive `div` with `tabIndex`, but it is only programmatically focusable, so it is not a tab stop.

4. 💭 **Menu items.** Pressing Enter on an `aria-disabled` item does nothing and the menu stays open. This is consistent with the APG disabled-item pattern. The reason is read as part of the item name, so no extra announcement is needed.

5. 💭 `reset` in the permissions dialog does not reset `prevPhase`, so reopening after closing in the confirm step triggers a no-op focus effect on null refs. It is harmless.

## What's working well

- Disabled buttons use the `aria-disabled` plus `aria-describedby` reason pattern consistently, and stay focusable.
- Both themes have a unit test for contrast.
- The tests added for focus, ARIA and copy cover each targeted behaviour.

## Follow-ups

- Fix finding 1 (button focus ring opacity) as a shared-primitive bug fix or its own ticket.
- Scope `aria-invalid` on the search input to cases where a search term exists (finding 2).
- Add an axe run on `/apps`, `/organizations` and `/roles` when Playwright e2e (PAN-023) lands.

Relevant files:
- `/home/user/admin-pan/src/styles/theme.css`
- `/home/user/admin-pan/src/components/ui/button.tsx`
- `/home/user/admin-pan/src/features/apps/components/apps-table.tsx`
- `/home/user/admin-pan/src/features/roles/components/role-permissions-dialog.tsx`
- `/home/user/admin-pan/src/features/roles/components/roles-row-actions.tsx`
- `/home/user/admin-pan/src/features/roles/index.tsx`

## Attempt 2

PAN-030 a11y re-review, attempt 2 (WCAG 2.2 AA). I read the diff `a9b48bc..HEAD` and did not run axe, a screen reader or `pnpm test`. There are no 🔴 blockers. Both Attempt 1 🟡 findings are fixed, but the button fix does not cover the destructive variant, which leaves one new 🟡.

**Attempt 1 findings**
- 🟡 Button focus ring (1.4.11 / 2.4.7): fixed for default, outline, secondary, ghost and link.
  - `src/components/ui/button.tsx:7` now has `focus-visible:ring-ring` at full opacity.
  - `--ring` is `oklch(0.446 …)` in light (`src/styles/theme.css:20`, about 7:1 on white) and `oklch(0.704 …)` in dark (`theme.css:55`, well above 3:1).
  - `theme-contrast.test.ts` pins the full-opacity class.
  - `--input` is unchanged, and the test now blends alpha in gamma-encoded sRGB as browsers do.
- 🟡 422 `aria-invalid` (3.3.1): fixed. `apps-table.tsx:146` and `organizations-table.tsx:146` set `searchInvalid={rejected && Boolean(term)}`. `aria-describedby` still points at the alert whenever `rejected` is true, so the message stays linked. The tests cover empty search, then typing a term.

**New finding**
1. 🟡 Destructive button variant keeps a near-invisible focus ring (2.4.7 Focus Visible, 1.4.11 Non-text Contrast).
   - Location: `src/components/ui/button.tsx:14`.
   - The variant sets `focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40`. twMerge lets these override the new base `ring-ring`, so the ring is 20% opacity in light mode and 40% in dark, far below 3:1.
   - Destructive buttons have no `border` class, so the `border-ring` on focus does nothing. The effective indicator is that faint ring.
   - This is not a regression, since the old base was `/50`, but the Attempt 1 fix leaves this variant out.
   - It affects a changed screen: the Remove button at `role-permissions-dialog.tsx:302` uses `variant='destructive'`.
   - It also affects `reports-row-actions.tsx`, `nav-user.tsx`, `profile-dropdown.tsx` and `config-drawer.tsx`.
   - Fix: in the destructive variant, replace those two ring classes with `focus-visible:ring-ring`, or add `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`.
   - Also extend the `theme-contrast.test.ts` button assertion to forbid `ring-destructive/`. `badge.tsx:16` has the same pattern, but it only matters if the badge is focusable (`[a&]`).

**Other changes in the diff**
- `role-permissions-dialog.tsx` now treats a `forbidden` view as non-waiting and shows "You no longer have access to this role." as the confirm reason. That is better than an indefinite "Loading…" (4.1.3), and nothing regressed.
- `assign-pickers.tsx` changes the fallback label to "Choose app 1". The accessible name is still unique and explicit.

**Follow-ups**
- Fix the destructive focus ring, or record it as a shared-primitive bug.
- Run axe on `/apps`, `/organizations` and `/roles` when PAN-023 lands.

Files:
- /home/user/admin-pan/src/components/ui/button.tsx
- /home/user/admin-pan/src/styles/theme.css
- /home/user/admin-pan/src/features/apps/components/apps-table.tsx
- /home/user/admin-pan/src/features/organizations/components/organizations-table.tsx
- /home/user/admin-pan/src/features/roles/components/role-permissions-dialog.tsx
