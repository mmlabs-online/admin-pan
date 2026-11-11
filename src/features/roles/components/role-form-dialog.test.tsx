import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import {
  resetAccessStore,
  useAccessData,
} from '@/features/apps/data/access-store'
import { initialAccessData } from '@/features/apps/data/mock-data'
import { RoleFormDialog } from './role-form-dialog'

const supportRole = initialAccessData.roles.find(
  (r) => r.key === 'admin:support'
)!

function SupportPermissionCount() {
  const { role_permissions } = useAccessData()
  const count = role_permissions.filter(
    (rp) => rp.role_id === supportRole.id
  ).length
  return <p>support permissions: {count}</p>
}

describe('RoleFormDialog', () => {
  beforeEach(() => resetAccessStore())

  it('validates required fields and limits permissions to the chosen app', async () => {
    const screen = await render(<RoleFormDialog open onOpenChange={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Create role' }))
    await expect
      .element(screen.getByText('App is required.'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Key is required.'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Name is required.'))
      .toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox', { name: 'App' }))
    await userEvent.click(
      screen.getByRole('option', { name: 'Ricotdin (ricotdin)' })
    )

    await expect
      .element(screen.getByRole('checkbox', { name: /ricotdin:recipes:read/ }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('checkbox', { name: /stoktok:/ }))
      .not.toBeInTheDocument()
  })

  it('asks for confirmation before removing permissions from a role', async () => {
    const onOpenChange = vi.fn()
    const screen = await render(
      <>
        <RoleFormDialog
          open
          onOpenChange={onOpenChange}
          currentRow={supportRole}
        />
        <SupportPermissionCount />
      </>
    )

    await userEvent.click(
      screen.getByRole('checkbox', { name: /admin:users:write/ })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const confirm = screen.getByRole('alertdialog')
    await expect
      .element(
        confirm.getByRole('heading', {
          name: 'Remove permissions from admin:support?',
        })
      )
      .toBeInTheDocument()
    await expect
      .element(confirm.getByText('admin:users:write'))
      .toBeInTheDocument()

    await userEvent.click(confirm.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    await expect
      .element(screen.getByText('support permissions: 3'))
      .toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await userEvent.click(
      screen
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Remove and save' })
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
    await expect
      .element(screen.getByText('support permissions: 2'))
      .toBeInTheDocument()
  })
})
