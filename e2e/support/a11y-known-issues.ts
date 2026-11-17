export type KnownIssue = {
  rule: string
  pageId: string
  /** Exact axe node target (selectors joined with a space). */
  target: string
  reason: string
  /** Proposed follow-up ticket title. */
  followUp: string
}

/** Narrow escape hatch (PAN-023 plan): one rule, one page, one node each. Max 5. */
export const knownIssues: KnownIssue[] = []
