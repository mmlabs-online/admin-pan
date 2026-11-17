import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { type KnownIssue, knownIssues } from './a11y-known-issues'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/**
 * Fails on any serious or critical WCAG 2.x A/AA violation on the current page
 * state, minus exact known-issue entries (stale entries fail too). Output lists
 * rule, target and summary only, never page text (R5).
 */
export async function expectNoSeriousA11y(
  page: Page,
  pageId: string,
  issues: KnownIssue[] = knownIssues
) {
  await page.waitForFunction(() => {
    const loading = [...document.querySelectorAll('[role=status]')].some((e) =>
      /loading/i.test(e.textContent ?? '')
    )
    const running = document
      .getAnimations()
      .some(
        (a) =>
          a.playState === 'running' &&
          a.effect?.getComputedTiming().iterations !== Infinity
      )
    return !loading && !running
  })
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()

  const blocking = violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  )
  const rest = violations.filter((v) => !blocking.includes(v))
  if (rest.length) {
    await test.info().attach('axe-moderate-minor', {
      body: JSON.stringify(
        rest.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target.join(' ')),
        })),
        null,
        2
      ),
      contentType: 'application/json',
    })
  }

  const mine = issues.filter((i) => i.pageId === pageId)
  const matched = new Set<KnownIssue>()
  const failures: string[] = []
  for (const v of blocking) {
    for (const node of v.nodes) {
      const target = node.target.join(' ')
      const known = mine.find((i) => i.rule === v.id && i.target === target)
      if (known) matched.add(known)
      else
        failures.push(
          `${v.id} (${v.impact}) at ${target}: ${node.failureSummary ?? ''}`
        )
    }
  }
  for (const i of mine) {
    if (!matched.has(i))
      failures.push(`stale known issue ${i.rule} ${i.target}`)
  }
  expect(failures, `axe on ${pageId}`).toEqual([])
}
