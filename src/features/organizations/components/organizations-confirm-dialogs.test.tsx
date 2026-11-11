import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { OrganizationsHarness } from './test-fixtures'

async function openRowAction(
  screen: Awaited<ReturnType<typeof render>>,
  orgName: string,
  action: string
) {
  await userEvent.click(
    screen.getByRole('button', { name: `Actions for ${orgName}` })
  )
  await userEvent.click(screen.getByRole('menuitem', { name: action }))
}

describe('Organization destructive actions', () => {
  it('delete: cancel keeps the organization', async () => {
    const screen = await render(<OrganizationsHarness />)
    await openRowAction(screen, 'Acme Corp', 'Delete')

    const dialog = screen.getByRole('alertdialog', {
      name: 'Delete organization',
    })
    await expect
      .element(
        dialog.getByText(/Are you sure you want to delete Acme Corp \(acme\)\?/)
      )
      .toBeInTheDocument()

    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .element(
        screen.getByRole('table').getByText('Acme Corp', { exact: true })
      )
      .toBeInTheDocument()
  })

  it('delete: confirm removes the organization', async () => {
    const screen = await render(<OrganizationsHarness />)
    await openRowAction(screen, 'Acme Corp', 'Delete')

    const dialog = screen.getByRole('alertdialog', {
      name: 'Delete organization',
    })
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }))

    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .element(
        screen.getByRole('table').getByText('Acme Corp', { exact: true })
      )
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('table').getByText('Initech', { exact: true }))
      .toBeInTheDocument()
  })

  it('suspend: confirm changes the status badge; cancel does not', async () => {
    const screen = await render(<OrganizationsHarness />)
    const table = screen.getByRole('table')
    const initechRow = table.getByRole('row').filter({ hasText: 'Initech' })
    await expect.element(initechRow.getByText('Active')).toBeInTheDocument()

    await openRowAction(screen, 'Initech', 'Suspend')
    let dialog = screen.getByRole('alertdialog', {
      name: 'Suspend organization',
    })
    await expect
      .element(dialog.getByText(/Suspend Initech/))
      .toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    await expect.element(initechRow.getByText('Active')).toBeInTheDocument()

    await openRowAction(screen, 'Initech', 'Suspend')
    dialog = screen.getByRole('alertdialog', { name: 'Suspend organization' })
    await userEvent.click(dialog.getByRole('button', { name: 'Suspend' }))
    await expect.element(dialog).not.toBeInTheDocument()
    await expect.element(initechRow.getByText('Suspended')).toBeInTheDocument()
  })

  it('reactivate: offered for suspended organizations', async () => {
    const screen = await render(<OrganizationsHarness />)
    await openRowAction(screen, 'Globex', 'Reactivate')
    const dialog = screen.getByRole('alertdialog', {
      name: 'Reactivate organization',
    })
    await userEvent.click(dialog.getByRole('button', { name: 'Reactivate' }))
    await expect.element(dialog).not.toBeInTheDocument()
    const globexRow = screen
      .getByRole('table')
      .getByRole('row')
      .filter({ hasText: 'Globex' })
    await expect.element(globexRow.getByText('Active')).toBeInTheDocument()
  })
})
