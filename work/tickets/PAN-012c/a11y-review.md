## Attempt 1

A11y review, PAN-012c, attempt 1. This is a read-only code review: I did not run axe or a screen reader. Result: no 🔴 blockers.

### Findings

- 🟡 1. **The notice title is not a heading** (`src/features/auth/forgot-password/index.tsx:14-18`; WCAG 1.3.1, 2.4.6).
  - `CardTitle` renders as a `<div>`. The page's only heading is the layout `<h1>` "mmlabs Admin".
  - The same gap existed before this diff, but it matters more now that the page is text only.
  - Fix: use `<CardTitle asChild>` with an `<h2>`, or a plain `<h2>`, which matches `StatusPanel`.
- 🟡 2. **The instruction is one dense paragraph with a nested quoted UI label** (`index.tsx:20-28`; WCAG 3.3.2, readability).
  - Consider an `<ol>` with the steps: choose "Forgot password" in another mmlabs app, follow the email link, then come back and sign in.
- 💭 3. **Link name vs. the sentence before it** (`reset-password-form.tsx:32,110`).
  - "How to reset your password" is a clear link name and is consistent in both places.
  - The preceding text "Request a new one." (line 31) no longer matches the link. Consider rewording it (3.3.3).
- 💭 4. **Focus and contrast on links** (`forgot-password/index.tsx:35-39`).
  - The "Sign in" link is underlined, so 1.4.1 (use of color) is met.
  - Confirm that the global `outline-ring` gives a focus indicator of at least 3:1, for this link and for `linkClass` (2.4.7).
  - The contrast of `text-muted-foreground` was not measured.
- 💭 5. **No new live regions.** The notice correctly has no `role='status'`.
  - Separately, the existing `StatusPanel` combines `role='status'` with heading focus, which can announce twice. Follow-up.
- 💭 6. **`AuthLayout` has no `<main>` landmark** (existing; 1.3.1, 2.4.1). Follow-up.

### Follow-ups
- Use real headings across all auth screens (`CardTitle`).
- Add a `<main>` landmark to `AuthLayout`.
- Run axe on `/forgot-password`, `/reset-password` and `/verify-email` once PAN-023 is in.
- In `StatusPanel`, use either `role='status'` or heading focus, not both.

**Test coverage:** the new `forgot-password.test.tsx` covers the notice page.
