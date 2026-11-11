import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { resetAccessStore, useAccessData } from '../data/access-store'
import { AppFormDialog } from './app-form-dialog'

function AppKeys() {
  const { apps } = useAccessData()
  return (
    <output aria-label='app keys'>{apps.map((a) => a.key).join(',')}</output>
  )
}

describe('AppFormDialog', () => {
  beforeEach(() => resetAccessStore())

  it('validates key, name and origins', async () => {
    const screen = await render(<AppFormDialog open onOpenChange={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))
    await expect
      .element(screen.getByText('Key is required.'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Name is required.'))
      .toBeInTheDocument()

    await userEvent.fill(screen.getByRole('textbox', { name: 'Key' }), 'MyApp')
    await expect
      .element(screen.getByText(/Key must start with a lowercase letter/))
      .toBeInTheDocument()

    await userEvent.fill(
      screen.getByRole('textbox', { name: 'Key' }),
      'stoktok'
    )
    await expect
      .element(screen.getByText('This key is already used.'))
      .toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add origin' }))
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'Origin 1' }),
      'http://insecure.example.com'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))
    await expect
      .element(screen.getByText(/Enter an https:\/\/ origin without a path/))
      .toBeInTheDocument()
  })

  it('registers a new app', async () => {
    const onOpenChange = vi.fn()
    const screen = await render(
      <>
        <AppFormDialog open onOpenChange={onOpenChange} />
        <AppKeys />
      </>
    )

    await userEvent.fill(screen.getByRole('textbox', { name: 'Key' }), 'newapp')
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'Name' }),
      'New app'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add origin' }))
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'Origin 1' }),
      'https://newapp.mmlabs.online'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    // The dialog marks the rest of the page aria-hidden, so query by text.
    await expect.element(screen.getByText(/,newapp$/)).toBeInTheDocument()
  })

  it('keeps the key read-only when editing', async () => {
    const screen = await render(
      <AppFormDialog
        open
        onOpenChange={vi.fn()}
        currentRow={{
          id: '6a0c1e2f-9a63-4f7e-9a51-1b2c3d4e5f60',
          key: 'demo',
          name: 'Demo',
          status: 'active',
          join_policy: 'open',
          org_mode: 'none',
          default_role_id: null,
          origins: ['https://demo.mmlabs.online'],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        }}
      />
    )

    await expect
      .element(screen.getByRole('heading', { name: 'Edit app demo' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('textbox', { name: 'Key' }))
      .toBeDisabled()
    await expect
      .element(screen.getByRole('textbox', { name: 'Origin 1' }))
      .toHaveValue('https://demo.mmlabs.online')
  })
})
