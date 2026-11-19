import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { type Report } from '../data/schema'
import { ReportsDialogs } from './reports-dialogs'
import { ReportsProvider, useReports } from './reports-provider'
import { makeReport } from './reports-test-fixtures'

// Stubs that close twice in the same tick: Radix can report two close events
// (Escape + outside click, or a close during a close).
vi.mock('./reports-action-dialog', () => ({
  ReportsActionDialog: (props: {
    open: boolean
    onOpenChange: (open: boolean) => void
    currentRow?: Report
  }) => (
    <div>
      <output data-testid={props.currentRow ? 'edit' : 'create'}>
        {String(props.open)}
      </output>
      <button
        type='button'
        onClick={() => {
          props.onOpenChange(false)
          props.onOpenChange(false)
        }}
      >
        {props.currentRow ? 'close edit twice' : 'close create twice'}
      </button>
    </div>
  ),
}))
vi.mock('./reports-delete-dialog', () => ({
  ReportsDeleteDialog: (props: {
    open: boolean
    onOpenChange: (open: boolean) => void
  }) => (
    <div>
      <output data-testid='delete'>{String(props.open)}</output>
      <button
        type='button'
        onClick={() => {
          props.onOpenChange(false)
          props.onOpenChange(false)
        }}
      >
        close delete twice
      </button>
    </div>
  ),
}))

const ROW = makeReport({ id: 'r1', name: 'Weekly' })

function Harness() {
  const { open, setOpen, currentRow, setCurrentRow } = useReports()
  return (
    <>
      <output data-testid='state'>{`open=${open ?? 'none'} row=${currentRow?.id ?? 'none'}`}</output>
      <button
        type='button'
        onClick={() => {
          setCurrentRow(ROW)
          setOpen('edit')
        }}
      >
        open edit
      </button>
      <button
        type='button'
        onClick={() => {
          setCurrentRow(ROW)
          setOpen('delete')
        }}
      >
        open delete
      </button>
      <button type='button' onClick={() => setOpen('create')}>
        open create
      </button>
      <ReportsDialogs />
    </>
  )
}

describe('ReportsDialogs', () => {
  it('a double close of edit/delete/create leaves every dialog closed and the row is still cleared', async () => {
    const screen = await render(
      <ReportsProvider initialReports={[ROW]}>
        <Harness />
      </ReportsProvider>
    )
    const state = screen.getByTestId('state')

    for (const kind of ['edit', 'delete'] as const) {
      await userEvent.click(
        screen.getByRole('button', { name: `open ${kind}` })
      )
      await expect.element(state).toHaveTextContent(`open=${kind} row=r1`)
      await userEvent.click(
        screen.getByRole('button', { name: `close ${kind} twice` })
      )
      await expect.element(state).toHaveTextContent(/open=none/)
      await expect.element(screen.getByTestId(kind)).toHaveTextContent('false')
      await expect
        .poll(() => state.element().textContent, { timeout: 2000 })
        .toBe('open=none row=none')
    }

    await userEvent.click(screen.getByRole('button', { name: 'open create' }))
    await expect.element(state).toHaveTextContent('open=create')
    await userEvent.click(
      screen.getByRole('button', { name: 'close create twice' })
    )
    await expect.element(state).toHaveTextContent('open=none')
    await expect
      .element(screen.getByTestId('create'))
      .toHaveTextContent('false')
  })
})
