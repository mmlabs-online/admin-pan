import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { toKpis } from '../data/view'
import { KpiCards } from './kpi-cards'
import { STATS } from './test-data'

describe('KpiCards', () => {
  it('renders four cards with label, formatted value and the detail sub-line; no trend', async () => {
    const screen = await render(<KpiCards items={toKpis(STATS)} />)
    for (const [label, value, detail] of [
      ['Users', '1,284', '1,200 active · 84 disabled'],
      ['Active organizations', '57', '4 suspended · 61 total'],
      ['Registered apps', '9', '8 active · 1 disabled'],
      ['Sign-ins (24 h)', '342', '19 failed'],
    ]) {
      await expect
        .element(screen.getByText(label, { exact: true }))
        .toBeInTheDocument()
      await expect
        .element(screen.getByText(value, { exact: true }))
        .toBeInTheDocument()
      await expect
        .element(screen.getByText(detail, { exact: true }))
        .toBeInTheDocument()
    }
    expect(screen.container.textContent).not.toContain('%')
    expect(screen.container.textContent).not.toContain('vs ')
  })
})
