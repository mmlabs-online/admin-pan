import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { ReportsActionDialog } from './reports-action-dialog'
import { makeReport } from './reports-test-fixtures'

describe('ReportsActionDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a validation error when the name is missing', async () => {
    const onSubmit = vi.fn()
    const screen = await render(
      <ReportsActionDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />
    )

    await expect
      .element(screen.getByRole('heading', { name: 'New report' }))
      .toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Save report' }))

    await expect.element(screen.getByText('Name is required.')).toBeVisible()
    await expect
      .element(screen.getByRole('textbox', { name: 'Name' }))
      .toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a start date after the end date', async () => {
    const onSubmit = vi.fn()
    const screen = await render(
      <ReportsActionDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />
    )

    await userEvent.fill(screen.getByLabelText('Name'), 'Sign-ups Q4')
    await userEvent.fill(screen.getByLabelText('From'), '2026-11-10')
    await userEvent.fill(screen.getByLabelText('To'), '2026-11-01')
    await userEvent.click(screen.getByRole('button', { name: 'Save report' }))

    await expect
      .element(screen.getByText('End date must be on or after the start date.'))
      .toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits valid values and closes', async () => {
    const onSubmit = vi.fn()
    const onOpenChange = vi.fn()
    const screen = await render(
      <ReportsActionDialog
        open
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
      />
    )

    await userEvent.fill(screen.getByLabelText('Name'), 'Sign-ups Q4')
    await userEvent.fill(screen.getByLabelText('From'), '2026-10-01')
    await userEvent.fill(screen.getByLabelText('To'), '2026-12-31')
    await userEvent.click(screen.getByRole('button', { name: 'Save report' }))

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Sign-ups Q4',
        type: 'user_signups',
        app_key: 'all',
        date_from: '2026-10-01',
        date_to: '2026-12-31',
        format: 'csv',
        schedule: 'none',
      })
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('prefills the form when editing', async () => {
    const screen = await render(
      <ReportsActionDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        currentRow={makeReport({
          name: 'Existing report',
          params: {
            app_key: 'stoktok',
            date_from: '2026-09-01',
            date_to: '2026-09-30',
          },
        })}
      />
    )

    await expect
      .element(screen.getByRole('heading', { name: 'Edit report' }))
      .toBeVisible()
    await expect
      .element(screen.getByLabelText('Name'))
      .toHaveValue('Existing report')
    await expect
      .element(screen.getByLabelText('From'))
      .toHaveValue('2026-09-01')
    await expect
      .element(screen.getByRole('combobox', { name: 'App' }))
      .toHaveTextContent('stoktok')
  })
})
