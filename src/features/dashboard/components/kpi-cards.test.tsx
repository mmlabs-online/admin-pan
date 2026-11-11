import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { kpis } from '../data/stats'
import { formatChange } from '../lib/format'
import { KpiCards } from './kpi-cards'

describe('formatChange', () => {
  it('formats positive, negative and zero changes', () => {
    expect(formatChange(8.24)).toBe('+8.2%')
    expect(formatChange(-4.1)).toBe('-4.1%')
    expect(formatChange(0)).toBe('0%')
  })
})

describe('KpiCards', () => {
  it('renders one card per KPI with a formatted value', async () => {
    const screen = await render(<KpiCards items={kpis} />)
    await expect
      .element(screen.getByText('Users', { exact: true }))
      .toBeInTheDocument()
    await expect.element(screen.getByText('1,284')).toBeInTheDocument()
    await expect
      .element(screen.getByText('Sign-ins (24 h)'))
      .toBeInTheDocument()
  })
})
