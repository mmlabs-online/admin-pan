import { apiError, fakeApi, json } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { APPS } from './test-data'
import { appsServer, isList, renderApps, writes } from './test-fixtures'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

const noop = () => {}

async function open(
  screen: Awaited<ReturnType<typeof renderApps>>,
  key: string,
  action: RegExp
) {
  await userEvent.click(
    screen.getByRole('button', { name: `Actions for ${key}` })
  )
  await userEvent.click(screen.getByRole('menuitem', { name: action }))
  return screen.getByRole('alertdialog')
}

describe('AppStatusDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it("disable: names the app and key, sends PATCH {status:'disabled'} only after confirm; cancel sends nothing", async () => {
    const { client, seen } = fakeApi(
      appsServer(() => json({ ...APPS[1], status: 'disabled' }))
    )
    const screen = await renderApps(client)
    let dialog = await open(screen, 'calechip', /Disable/)
    await expect
      .element(dialog.getByText('Calechip', { exact: true }))
      .toBeVisible()
    await expect.element(dialog.getByText(/calechip\)/)).toBeVisible()
    await expect
      .element(dialog.getByText(/Tokens already issued keep working/))
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen, 'PATCH')).toHaveLength(0)

    dialog = await open(screen, 'calechip', /Disable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(new URL(writes(seen, 'PATCH')[0].url).pathname).toBe(
      '/api/v1/apps/calechip'
    )
    expect(await writes(seen, 'PATCH')[0].json()).toEqual({
      status: 'disabled',
    })
    expect(toast.success).toHaveBeenCalledWith('App calechip disabled.')
    await expect.poll(() => seen.filter(isList).length).toBe(2)
  })

  it("enable: offered for disabled apps; sends PATCH {status:'active'}", async () => {
    const { client, seen } = fakeApi(
      appsServer(() => json({ ...APPS[2], status: 'active' }))
    )
    const screen = await renderApps(client)
    const dialog = await open(screen, 'stoktok', /Enable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Enable' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await writes(seen, 'PATCH')[0].json()).toEqual({ status: 'active' })
    expect(toast.success).toHaveBeenCalledWith('App stoktok enabled.')
  })

  it('pending: dialog open, buttons aria-disabled, "Disabling…"; the badge changes only after the refetch; a double click sends one PATCH', async () => {
    let release: (r: Response) => void = noop
    let status: 'active' | 'disabled' = 'active'
    const { client, seen } = fakeApi(
      appsServer(
        () => new Promise<Response>((resolve) => (release = resolve)),
        () => [APPS[0], { ...APPS[1], status }, APPS[2]]
      )
    )
    const screen = await renderApps(client)
    // Not scoped to the table: the open dialog hides it from the a11y tree.
    const disabledBadges = () =>
      screen.getByText('Disabled', { exact: true }).elements().length
    await expect
      .element(screen.getByText('Disabled', { exact: true }))
      .toBeVisible()
    const dialog = await open(screen, 'calechip', /Disable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))

    const busy = dialog.getByRole('button', { name: 'Disabling…' })
    await expect.element(busy).toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(dialog.getByRole('button', { name: 'Cancel' }))
      .toHaveAttribute('aria-disabled', 'true')
    ;(busy.element() as HTMLElement).click()
    ;(busy.element() as HTMLElement).click()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).toBeVisible()
    expect(disabledBadges()).toBe(1)

    status = 'disabled'
    release(json({ ...APPS[1], status }))
    await expect.element(dialog).not.toBeInTheDocument()
    await expect.poll(disabledBadges).toBe(2)
    expect(writes(seen, 'PATCH')).toHaveLength(1)
  })

  it('403 / 404 / 409 shown inline and linked via aria-describedby; dialog stays open', async () => {
    for (const [res, text] of [
      [
        apiError(403, 'permission_denied'),
        "You don't have permission to do this",
      ],
      [apiError(404, 'not_found'), 'This app no longer exists.'],
      [apiError(409, 'conflict'), 'changed by someone else'],
    ] as const) {
      const { client } = fakeApi(appsServer(() => res.clone()))
      const screen = await renderApps(client)
      const dialog = await open(screen, 'calechip', /Disable/)
      await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
      const alert = dialog.getByRole('alert')
      await expect.element(alert).toHaveTextContent(text)
      await expect.element(dialog).toBeVisible()
      const describedBy = dialog
        .getByRole('button', { name: 'Disable' })
        .element()
        .getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      expect(
        document
          .getElementById(describedBy as string)
          ?.contains(alert.element())
      ).toBe(true)
      await screen.unmount()
    }
  })

  it('admin app: note shown; 409 shows the admin-app rule inline', async () => {
    const { client } = fakeApi(appsServer(() => apiError(409, 'conflict')))
    const screen = await renderApps(client)
    const dialog = await open(screen, 'admin', /Disable/)
    await expect
      .element(dialog.getByText(/need the admin:\* permission/))
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('The admin app must stay active.')
  })

  it("after success focus returns to the row's actions button (not body)", async () => {
    const { client } = fakeApi(
      appsServer(() => json({ ...APPS[1], status: 'disabled' }))
    )
    const screen = await renderApps(client)
    const dialog = await open(screen, 'calechip', /Disable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Actions for calechip' }))
      .toHaveFocus()
  })

  it('re-opening within 500 ms of Cancel keeps the dialog and its row; confirm still PATCHes and toasts', async () => {
    const { client, seen } = fakeApi(
      appsServer(() => json({ ...APPS[1], status: 'disabled' }))
    )
    const screen = await renderApps(client)
    let dialog = await open(screen, 'calechip', /Disable/)
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    dialog = await open(screen, 'calechip', /Disable/)
    // Outlast the stale 500 ms row-clear timer from the Cancel (BUG-002).
    await new Promise((r) => setTimeout(r, 600))
    await expect.element(dialog).toBeVisible()
    await expect
      .element(dialog.getByText('Calechip', { exact: true }))
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
    await expect.poll(() => writes(seen, 'PATCH')).toHaveLength(1)
    expect(new URL(writes(seen, 'PATCH')[0].url).pathname).toBe(
      '/api/v1/apps/calechip'
    )
    await expect
      .poll(() => vi.mocked(toast.success))
      .toHaveBeenCalledWith('App calechip disabled.')
  })
})
