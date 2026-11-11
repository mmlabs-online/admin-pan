Status: READY | BLOCKED

# Plan — <ID>: <title>

## Spec summary
<Quote the exact spec lines this ticket implements.>

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | | <test name / command / observable behaviour> |

## Files to create / modify
| File | Change | Required because |
|---|---|---|

## Tests to write
| Test (file › name) | Covers |
|---|---|

## Approach
<Short, ordered steps. Note which rules (R1–R11) apply and how they are met.>

## Specialist input used
<consult-*.md items adopted or rejected, with one-line reason. "None" if no consults.>

## Assumptions
<Non-blocking assumptions.>

## Blocking questions
<Only if Status: BLOCKED. Otherwise "None".>

## Split proposal
<If the ticket is too large: the slices, and which one this plan covers. Otherwise "None".>

## Screens
| Route | Permission | States (loading / empty / error / 403 / happy) | User actions → mutation | Invalidates |
|---|---|---|---|---|
<"None" if no screen change.>

## API calls used
| Method | Path | Params / body | Response type (generated schema) | Error codes handled | org-admin-api ticket |
|---|---|---|---|---|---|
<"None" if no API call change. Endpoints that do not exist yet → Blocking questions or Follow-ups, never mocked in production code.>
