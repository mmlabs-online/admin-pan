# ADR 0007: One-time secrets in the UI

Status: Accepted pending owner merge (PAN-027). Builds on spec §6 and R3/R5 (no secret in storage, logs or URLs).

## Context
Issuing an app credential (org-admin-api ADR-0016) returns a long-lived `mmak_…` value exactly once. TanStack Query keeps mutation results and variables in its `MutationCache` (readable by devtools, retained for `gcTime`), so a secret returned by `mutationFn` would outlive the dialog that shows it. Future once-shown values (for example invitation links) face the same problem.

## Decision
- **Sink, not state.** The mutation's `mutationFn` receives a caller-owned sink function, passes the secret to it and resolves with metadata only. The mutation uses `retry: false`, `gcTime: 0`, no `mutationKey`, and never `setQueryData` with the result. The variables are the sink function, which serialises to nothing.
- **Local state only.** The secret lives in the local state of the one component that shows it. The tab mounts that component only while open, so closing unmounts it and drops the state. It is also cleared on `pagehide` (bfcache) and on unmount.
- **Masked by default.** The DOM holds only the non-secret `mmak_<key_id>_` prefix and a mask until the user chooses Show. Copy works while masked and runs only on click. No toast, live region, `aria-label`, `title` or `data-*` carries the value.
- **Deliberate close.** No X button; Escape and outside click are ignored while the value is shown. The only way out is "I've saved it". No `beforeunload` prompt.
- **Unknown outcome.** A network error, timeout, 5xx or garbled 201 is shown as "may have been created". The Issue button is removed so no blind retry can issue a second key, and the list is refetched.
- **Tests.** One obviously fake constant, `FAKE_CREDENTIAL` in `src/test-utils/fake-credential.ts`, is shared by Vitest and the e2e fake API. A leak regression test asserts it is never in the mutation or query cache, the DOM after close, storage, the URL, the console or toasts.

## Alternatives rejected
- Reading `mutation.data` then `reset()`: the value sits in `MutationCache` for at least one render.
- `onSuccess` into local state: the value is still in the mutation result.
- A `beforeunload` prompt: unreliable and noisy; clearing on `pagehide` is enough.

## Consequences
- Every once-shown secret uses the same shape; the reviewer checks it against this ADR.
- A Sentry-style reporter, if ever added, needs an `mmak_` scrubber.
