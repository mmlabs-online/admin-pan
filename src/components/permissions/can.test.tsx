import { WithPermissions } from '@/test-utils/permissions'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { unknownPermissionSource } from '@/lib/permissions/source'
import { PermissionProvider } from '@/context/permission-provider'
import { Can } from './can'

const Control = () => <button>Do it</button>

describe('Can', () => {
  it('with no provider (production default) every control renders', async () => {
    const screen = await render(
      <Can action='organizations.create'>
        <Control />
      </Can>
    )
    await expect
      .element(screen.getByRole('button', { name: 'Do it' }))
      .toBeInTheDocument()
  })

  it('granted renders the control', async () => {
    const screen = await render(
      <WithPermissions granted={['admin:organizations:write']}>
        <Can action='organizations.create'>
          <Control />
        </Can>
      </WithPermissions>
    )
    await expect
      .element(screen.getByRole('button', { name: 'Do it' }))
      .toBeInTheDocument()
  })

  it('denied hides it', async () => {
    const screen = await render(
      <WithPermissions granted={[]}>
        <Can action='organizations.create' fallback={<p>Nope</p>}>
          <Control />
        </Can>
      </WithPermissions>
    )
    await expect
      .element(screen.getByRole('button', { name: 'Do it' }))
      .not.toBeInTheDocument()
    await expect.element(screen.getByText('Nope')).toBeInTheDocument()
  })

  it('unknown renders it', async () => {
    const screen = await render(
      <PermissionProvider source={unknownPermissionSource}>
        <Can action='organizations.create'>
          <Control />
        </Can>
      </PermissionProvider>
    )
    await expect
      .element(screen.getByRole('button', { name: 'Do it' }))
      .toBeInTheDocument()
  })

  it('denied in disable mode renders a disabled control described by a visible reason naming the permission', async () => {
    const screen = await render(
      <WithPermissions granted={[]}>
        <Can action='organizations.create' disable>
          {({ disabled, describedBy }) => (
            <button disabled={disabled} aria-describedby={describedBy}>
              Do it
            </button>
          )}
        </Can>
      </WithPermissions>
    )
    const button = screen.getByRole('button', { name: 'Do it' })
    await expect.element(button).toBeDisabled()
    await expect
      .element(button)
      .toHaveAccessibleDescription('Requires admin:organizations:write')
    await expect
      .element(screen.getByText('Requires admin:organizations:write'))
      .toBeVisible()
  })

  it('disable mode leaves the control enabled when granted or unknown', async () => {
    const screen = await render(
      <Can action='organizations.create' disable>
        {({ disabled, describedBy }) => (
          <button disabled={disabled} aria-describedby={describedBy}>
            Do it
          </button>
        )}
      </Can>
    )
    await expect
      .element(screen.getByRole('button', { name: 'Do it' }))
      .toBeEnabled()
  })

  it('an array of actions hides only when all are denied', async () => {
    const both = ['users.view', 'users.setStatus'] as const
    const some = await render(
      <WithPermissions granted={['admin:users:read']}>
        <Can action={both}>
          <Control />
        </Can>
      </WithPermissions>
    )
    await expect
      .element(some.getByRole('button', { name: 'Do it' }))
      .toBeInTheDocument()
    await some.unmount()

    const none = await render(
      <WithPermissions granted={[]}>
        <Can action={both}>
          <Control />
        </Can>
      </WithPermissions>
    )
    await expect
      .element(none.getByRole('button', { name: 'Do it' }))
      .not.toBeInTheDocument()
  })
})
