import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { resetAccessStore } from './data/access-store'
import { AppsContent } from './index'

function renderApps() {
  return render(<AppsContent search={{}} navigate={vi.fn()} />)
}

describe('Apps page', () => {
  beforeEach(() => resetAccessStore())

  it('lists the registered apps', async () => {
    const screen = await renderApps()

    await expect
      .element(screen.getByRole('heading', { name: 'Apps' }))
      .toBeInTheDocument()
    for (const key of ['admin', 'stoktok', 'calechip', 'seatmgt']) {
      await expect
        .element(screen.getByRole('cell', { name: key, exact: true }))
        .toBeInTheDocument()
    }
  })

  it('filters by text search', async () => {
    const screen = await renderApps()

    await userEvent.fill(
      screen.getByPlaceholder('Search apps by key or name...'),
      'stok'
    )

    await expect
      .element(screen.getByRole('cell', { name: 'stoktok', exact: true }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('cell', { name: 'calechip', exact: true }))
      .not.toBeInTheDocument()
  })

  it('filters by join policy', async () => {
    const screen = await renderApps()

    await userEvent.click(screen.getByRole('button', { name: /Join policy/ }))
    await userEvent.click(screen.getByRole('option', { name: /Closed/ }))
    await userEvent.keyboard('{Escape}')

    await expect
      .element(screen.getByRole('cell', { name: 'admin', exact: true }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('cell', { name: 'spacem', exact: true }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('cell', { name: 'stoktok', exact: true }))
      .not.toBeInTheDocument()
  })

  it('keeps the app active when disabling is cancelled', async () => {
    const screen = await renderApps()

    await userEvent.click(
      screen.getByRole('button', { name: 'Open actions for stoktok' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: /Disable/ }))

    const dialog = screen.getByRole('alertdialog')
    await expect
      .element(dialog.getByRole('heading', { name: 'Disable app stoktok?' }))
      .toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await expect.element(dialog).not.toBeInTheDocument()
    const row = screen.getByRole('row').filter({ hasText: 'Stoktok' })
    await expect.element(row.getByText('Active')).toBeInTheDocument()
  })

  it('disables the app after confirmation', async () => {
    const screen = await renderApps()

    await userEvent.click(
      screen.getByRole('button', { name: 'Open actions for stoktok' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: /Disable/ }))
    await userEvent.click(
      screen.getByRole('alertdialog').getByRole('button', { name: 'Disable' })
    )

    const row = screen.getByRole('row').filter({ hasText: 'Stoktok' })
    await expect.element(row.getByText('Disabled')).toBeInTheDocument()
  })

  it('opens the detail sheet and adds a permission to the default role', async () => {
    const screen = await renderApps()

    await userEvent.click(screen.getByRole('button', { name: 'View ricotdin' }))
    const sheet = screen.getByRole('dialog')
    await expect
      .element(sheet.getByText('ricotdin:member', { exact: true }))
      .toBeInTheDocument()

    await userEvent.click(sheet.getByRole('tab', { name: 'Permissions' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Add permission' }))
    await userEvent.fill(
      sheet.getByRole('textbox', { name: 'Resource' }),
      'Bad'
    )
    await userEvent.click(
      sheet.getByRole('button', { name: 'Save permission' })
    )
    await expect
      .element(sheet.getByText(/Resource must start with a lowercase letter/))
      .toBeInTheDocument()

    await userEvent.fill(
      sheet.getByRole('textbox', { name: 'Resource' }),
      'comments'
    )
    await userEvent.fill(
      sheet.getByRole('textbox', { name: 'Action' }),
      'write'
    )
    await userEvent.fill(
      sheet.getByRole('textbox', { name: 'Description' }),
      'Write comments'
    )
    await userEvent.click(
      sheet.getByRole('button', { name: 'Save permission' })
    )
    await expect
      .element(
        sheet.getByRole('cell', {
          name: 'ricotdin:comments:write',
          exact: true,
        })
      )
      .toBeInTheDocument()

    // member role had 2 non-admin permissions, now 3
    await userEvent.click(sheet.getByRole('tab', { name: 'Roles' }))
    const memberRow = sheet
      .getByRole('row')
      .filter({ hasText: 'ricotdin:member' })
    await expect
      .element(memberRow.getByRole('cell', { name: '3' }))
      .toBeInTheDocument()
  })

  it('asks for confirmation before making a permission admin only', async () => {
    const screen = await renderApps()

    await userEvent.click(screen.getByRole('button', { name: 'View stoktok' }))
    const sheet = screen.getByRole('dialog')
    await userEvent.click(sheet.getByRole('tab', { name: 'Permissions' }))
    const toggle = sheet.getByRole('switch', {
      name: 'Admin only: stoktok:orders:write',
    })
    await userEvent.click(toggle)

    const confirm = screen.getByRole('alertdialog')
    await expect
      .element(
        confirm.getByRole('heading', {
          name: 'Make stoktok:orders:write admin only?',
        })
      )
      .toBeInTheDocument()
    await userEvent.click(confirm.getByRole('button', { name: 'Cancel' }))
    await expect.element(toggle).not.toBeChecked()

    await userEvent.click(toggle)
    await userEvent.click(
      screen.getByRole('alertdialog').getByRole('button', {
        name: 'Make admin only',
      })
    )
    await expect.element(toggle).toBeChecked()
  })
})
