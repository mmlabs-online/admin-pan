import { z } from 'zod'

// Limits of the API's `q` parameter (org-admin-api list endpoints).
export const SEARCH_MAX = 100
export const SEARCH_DEBOUNCE_MS = 300

// URL `q`. The router JSON-parses search values, so a hand-typed `?q=123`
// arrives as a number. An empty or over-long value falls back to "no search"
// (the API answers 422 for an empty `q`).
export const searchTermSchema = z
  .preprocess(
    (v) => (typeof v === 'number' ? String(v) : v),
    z.string().trim().min(1).max(SEARCH_MAX)
  )
  .optional()
  .catch(undefined)

/** What is sent as `q`: NFC, trimmed, `undefined` when nothing is left. */
export function toSearchTerm(value?: string): string | undefined {
  return value?.normalize('NFC').trim() || undefined
}
