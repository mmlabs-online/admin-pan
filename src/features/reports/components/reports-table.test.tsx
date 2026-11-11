import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { makeReport } from './reports-test-fixtures'
import { ReportsTestHarness } from './reports-test-harness'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const REPORTS = [
  makeReport({ id: 'r1', name: 'Weekly sign-ups', status: 'ready' }),
  makeReport({
    id: 'r2',
    name: 'Audit trail October',
    type: 'audit_activity',
    status: 'failed',
    row_count: null,
  }),
  makeReport({
    id: 'r3',
    name: 'Org overview monthly',
    type: 'org_overview',
    schedule: 'monthly',
    status: 'scheduled',
    last_run_at: null,
    row_count: null,
  }),
]

describe('ReportsTable', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the reports with their columns', async () => {
    const screen = await render(<ReportsTestHarness reports={REPORTS} />)

    await expect
      .element(screen.getByRole('table', { name: 'Reports' }))
      .toBeInTheDocument()
    for (const header of ['Name', 'Type', 'Schedule', 'Status', 'Last run']) {
      await expect
        .element(screen.getByRole('columnheader', { name: header }))
        .toBeInTheDocument()
    }
    await expect
      .element(screen.getByText('Weekly sign-ups', { exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByText('Audit trail October', { exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByText('Organization overview'))
      .toBeVisible()
    await expect.element(screen.getByText('Never')).toBeVisible()
  })

  it('filters by name search', async () => {
    const screen = await render(<ReportsTestHarness reports={REPORTS} />)

    await userEvent.fill(screen.getByPlaceholder('Search reports...'), 'audit')

    await expect
      .element(screen.getByText('Audit trail October', { exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByText('Weekly sign-ups', { exact: true }))
      .not.toBeInTheDocument()
  })

  it('filters by status facet', async () => {
    const screen = await render(<ReportsTestHarness reports={REPORTS} />)

    await userEvent.click(screen.getByRole('button', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: /Failed/ }))
    await userEvent.keyboard('{Escape}')

    await expect
      .element(screen.getByText('Audit trail October', { exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByText('Weekly sign-ups', { exact: true }))
      .not.toBeInTheDocument()
  })

  it('"Run now" sets the status to running, then ready with a new last run', async () => {
    const screen = await render(
      <ReportsTestHarness reports={REPORTS} runDelayMs={300} />
    )
    const row = screen.getByRole('row').filter({ hasText: 'Audit trail' })

    await expect.element(row.getByText('Failed')).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Audit trail October' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: /Run now/ }))

    await expect.element(row.getByText('Running')).toBeVisible()
    await expect.element(row.getByText('Ready')).toBeVisible()
    await expect.element(row.getByText(/rows$/)).toBeVisible()
    expect(toast.success).toHaveBeenCalledWith(
      'Report "Audit trail October" is ready to download.'
    )
  })

  it('disables Download unless the report is ready', async () => {
    const screen = await render(<ReportsTestHarness reports={REPORTS} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Org overview monthly' })
    )
    await expect
      .element(screen.getByRole('menuitem', { name: /Download/ }))
      .toHaveAttribute('aria-disabled', 'true')
  })

  it('keeps the report when delete is cancelled', async () => {
    const screen = await render(<ReportsTestHarness reports={REPORTS} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Weekly sign-ups' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))

    const dialog = screen.getByRole('alertdialog')
    await expect
      .element(dialog.getByText(/delete the report Weekly sign-ups\?/))
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .element(screen.getByText('Weekly sign-ups', { exact: true }))
      .toBeVisible()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('removes the report when delete is confirmed', async () => {
    const screen = await render(<ReportsTestHarness reports={REPORTS} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Weekly sign-ups' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    await userEvent.click(
      screen.getByRole('alertdialog').getByRole('button', { name: 'Delete' })
    )

    await expect
      .element(screen.getByText('Weekly sign-ups', { exact: true }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText('Audit trail October', { exact: true }))
      .toBeVisible()
    expect(toast.success).toHaveBeenCalledWith(
      'Report "Weekly sign-ups" deleted.'
    )
  })
})
