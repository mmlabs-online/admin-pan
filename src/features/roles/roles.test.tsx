import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { resetAccessStore } from '@/features/apps/data/access-store'
import { RolesContent } from './index'

function renderRoles() {
  return render(<RolesContent search={{}} navigate={vi.fn()} />)
}

const roleCell = (
  screen: Awaited<ReturnType<typeof renderRoles>>,
  key: string
) => screen.getByRole('cell', { name: key, exact: true })

describe('Roles page', () => {
  beforeEach(() => resetAccessStore())

  it('lists roles across apps with counts and badges', async () => {
    const screen = await renderRoles()

    await expect
      .element(screen.getByRole('heading', { name: 'Roles' }))
      .toBeInTheDocument()
    const row = screen.getByRole('row').filter({ hasText: 'admin:super-admin' })
    await expect.element(row.getByText('System')).toBeInTheDocument()
    // super-admin holds all 6 admin permissions and 1 assignment
    await expect
      .element(row.getByRole('cell', { name: '6', exact: true }))
      .toBeInTheDocument()
    await expect
      .element(row.getByRole('cell', { name: '1', exact: true }))
      .toBeInTheDocument()
  })

  it('filters by app', async () => {
    const screen = await renderRoles()

    // The toolbar facet comes before the sortable "App" column header.
    await userEvent.click(
      screen.getByRole('button', { name: 'App', exact: true }).first()
    )
    await userEvent.click(screen.getByRole('option', { name: /^admin/ }))
    await userEvent.keyboard('{Escape}')

    await expect.element(roleCell(screen, 'admin:auditor')).toBeInTheDocument()
    await expect
      .element(roleCell(screen, 'stoktok:member'))
      .not.toBeInTheDocument()
  })

  it('does not offer delete for system roles', async () => {
    const screen = await renderRoles()

    await userEvent.click(
      screen.getByRole('button', { name: 'Open actions for admin:super-admin' })
    )
    await expect
      .element(screen.getByRole('menuitem', { name: /System role/ }))
      .toHaveAttribute('data-disabled')
  })

  it('deletes a role only after confirmation', async () => {
    const screen = await renderRoles()

    const openDelete = async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Open actions for admin:auditor' })
      )
      await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    }

    await openDelete()
    let dialog = screen.getByRole('alertdialog')
    await expect
      .element(
        dialog.getByRole('heading', { name: 'Delete role admin:auditor?' })
      )
      .toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(roleCell(screen, 'admin:auditor')).toBeInTheDocument()

    await openDelete()
    dialog = screen.getByRole('alertdialog')
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }))
    await expect
      .element(roleCell(screen, 'admin:auditor'))
      .not.toBeInTheDocument()
  })

  it('revokes an assignment after confirmation and keeps it on cancel', async () => {
    const screen = await renderRoles()

    await userEvent.click(
      screen.getByRole('button', { name: 'Assignments of calechip:member' })
    )
    const sheet = screen.getByRole('dialog')
    const revokeSaigon = sheet.getByRole('button', {
      name: 'Revoke calechip:member from khanh.bui@example.com (Saigon Books)',
    })

    await userEvent.click(revokeSaigon)
    await expect
      .element(
        screen.getByRole('alertdialog').getByRole('heading', {
          name: 'Revoke calechip:member from khanh.bui@example.com?',
        })
      )
      .toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('alertdialog').getByRole('button', { name: 'Cancel' })
    )
    await expect.element(revokeSaigon).toBeInTheDocument()

    await userEvent.click(revokeSaigon)
    await userEvent.click(
      screen.getByRole('alertdialog').getByRole('button', { name: 'Revoke' })
    )
    await expect.element(revokeSaigon).not.toBeInTheDocument()
    await expect
      .element(sheet.getByRole('cell', { name: 'Acme Coffee', exact: true }))
      .toBeInTheDocument()
  })

  it('validates and creates a role assignment', async () => {
    const screen = await renderRoles()

    await userEvent.click(
      screen.getByRole('button', { name: 'Assignments of stoktok:viewer' })
    )
    const sheet = screen.getByRole('dialog')
    await userEvent.click(sheet.getByRole('button', { name: 'Assign role' }))
    await userEvent.click(
      sheet.getByRole('button', { name: 'Assign', exact: true })
    )
    await expect
      .element(sheet.getByText('Email is required.'))
      .toBeInTheDocument()

    await userEvent.fill(
      sheet.getByRole('textbox', { name: 'User email' }),
      'nobody@example.com'
    )
    await userEvent.click(
      sheet.getByRole('button', { name: 'Assign', exact: true })
    )
    await expect
      .element(sheet.getByText('No user with this email.'))
      .toBeInTheDocument()

    await userEvent.fill(
      sheet.getByRole('textbox', { name: 'User email' }),
      'thao.vo@example.com'
    )
    await userEvent.click(
      sheet.getByRole('button', { name: 'Assign', exact: true })
    )
    await expect
      .element(
        sheet.getByRole('cell', { name: 'thao.vo@example.com', exact: true })
      )
      .toBeInTheDocument()
  })
})
