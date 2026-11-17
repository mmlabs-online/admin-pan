import { apiError, fakeApi, json } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { PERMISSIONS, permissionsPage } from './test-data'
import { appsServer, renderApps, writes } from './test-fixtures'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

const noop = () => {}
const path = (r: Request) => new URL(r.url).pathname
const permCalls = (seen: Request[], key: string) =>
  seen.filter(
    (r) => r.method === 'GET' && path(r) === `/api/v1/apps/${key}/permissions`
  )
type Screen = Awaited<ReturnType<typeof renderApps>>

async function openTab(screen: Screen, key: string) {
  await userEvent.click(screen.getByRole('button', { name: `View ${key}` }))
  const sheet = screen.getByRole('dialog')
  await userEvent.click(sheet.getByRole('tab', { name: 'Permissions' }))
  return sheet
}

/** Server whose permissions list for `key` comes from `list()`. */
function server(
  write: (req: Request) => Response | Promise<Response>,
  list: (req: Request) => Response | Promise<Response> = () => json({})
) {
  const base = appsServer(write)
  return (req: Request) =>
    req.method === 'GET' && /\/permissions$/.test(path(req))
      ? list(req)
      : base(req)
}

describe('AppPermissionsTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches permissions only when the tab is opened', async () => {
    const { client, seen } = fakeApi(appsServer(() => json({})))
    const screen = await renderApps(client)
    await userEvent.click(screen.getByRole('button', { name: 'View stoktok' }))
    const sheet = screen.getByRole('dialog')
    await expect
      .element(sheet.getByRole('tab', { name: 'Overview' }))
      .toBeVisible()
    expect(permCalls(seen, 'stoktok')).toHaveLength(0)
    await userEvent.click(sheet.getByRole('tab', { name: 'Permissions' }))
    await expect.poll(() => permCalls(seen, 'stoktok').length).toBe(1)
    expect(new URL(permCalls(seen, 'stoktok')[0].url).search).toBe(
      '?limit=50&offset=0'
    )
  })

  it('loading / empty "No permissions yet." / error + Retry / 403 inline', async () => {
    let c = fakeApi(
      server(
        () => json({}),
        () => new Promise<Response>(noop)
      )
    )
    let screen = await renderApps(c.client)
    let sheet = await openTab(screen, 'stoktok')
    await expect.element(sheet.getByText('Loading permissions…')).toBeVisible()
    await screen.unmount()

    c = fakeApi(
      server(
        () => json({}),
        () => json(permissionsPage([]))
      )
    )
    screen = await renderApps(c.client)
    sheet = await openTab(screen, 'calechip')
    await expect.element(sheet.getByText('No permissions yet.')).toBeVisible()
    await screen.unmount()

    let fail = true
    c = fakeApi(
      server(
        () => json({}),
        () =>
          fail
            ? apiError(500, 'internal_error')
            : json(permissionsPage(PERMISSIONS.stoktok))
      )
    )
    screen = await renderApps(c.client)
    sheet = await openTab(screen, 'stoktok')
    await expect
      .element(sheet.getByRole('alert'))
      .toHaveTextContent("Couldn't load permissions.")
    fail = false
    await userEvent.click(sheet.getByRole('button', { name: 'Retry' }))
    await expect.element(sheet.getByText('stoktok:orders:read')).toBeVisible()
    await screen.unmount()

    c = fakeApi(
      server(
        () => json({}),
        () => apiError(403, 'permission_denied')
      )
    )
    screen = await renderApps(c.client)
    sheet = await openTab(screen, 'stoktok')
    await expect
      .element(sheet.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
  })

  it("rows show key, description or 'No description', scope label, admin-only switch with name 'Admin only: {key}'", async () => {
    const { client } = fakeApi(
      server(
        () => json({}),
        () => json(permissionsPage(PERMISSIONS.stoktok))
      )
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'stoktok')
    const table = sheet.getByRole('table', { name: 'Permissions of stoktok' })
    await expect.element(table.getByText('stoktok:orders:read')).toBeVisible()
    await expect.element(table.getByText('View orders')).toBeVisible()
    await expect.element(table.getByText('No description')).toBeVisible()
    await expect.element(table.getByText('Org', { exact: true })).toBeVisible()
    await expect
      .element(table.getByRole('columnheader', { name: 'Scope' }))
      .toBeVisible()
    await expect
      .element(
        table.getByRole('switch', { name: 'Admin only: stoktok:orders:read' })
      )
      .not.toBeChecked()
    await expect
      .element(
        table.getByRole('switch', { name: 'Admin only: stoktok:orders:write' })
      )
      .toBeChecked()
  })

  it("more than 50: 'Showing 1–50 of 120'; Next sends offset=50; Previous goes back", async () => {
    const { client, seen } = fakeApi(
      server(
        () => json({}),
        (req) => {
          const offset = Number(new URL(req.url).searchParams.get('offset'))
          return json(permissionsPage(PERMISSIONS.stoktok, 120, 50, offset))
        }
      )
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'stoktok')
    await expect.element(sheet.getByText('Showing 1–50 of 120')).toBeVisible()
    await expect
      .element(sheet.getByRole('button', { name: 'Previous' }))
      .toBeDisabled()
    await userEvent.click(sheet.getByRole('button', { name: 'Next' }))
    await expect.element(sheet.getByText('Showing 51–100 of 120')).toBeVisible()
    expect(
      permCalls(seen, 'stoktok').map((r) =>
        new URL(r.url).searchParams.get('offset')
      )
    ).toContain('50')
    await userEvent.click(sheet.getByRole('button', { name: 'Previous' }))
    await expect.element(sheet.getByText('Showing 1–50 of 120')).toBeVisible()
  })

  it("add: dialog builds '{app}:{resource}:{action}', sends POST {key, description, is_admin}; '' description omitted; closes, toasts, refetches; focus returns to Add permission", async () => {
    const { client, seen } = fakeApi(
      server(
        () => json(PERMISSIONS.stoktok[0], 201),
        () => json(permissionsPage(PERMISSIONS.stoktok))
      )
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'stoktok')
    const add = sheet.getByRole('button', { name: 'Add permission' })
    await userEvent.click(add)
    const dialog = screen.getByRole('dialog', { name: 'Add permission' })
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Resource' }),
      'invoices'
    )
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Action' }),
      'read'
    )
    await expect
      .element(dialog.getByText('stoktok:invoices:read'))
      .toBeVisible()
    await userEvent.click(
      dialog.getByRole('button', { name: 'Add permission' })
    )
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await writes(seen, 'POST')[0].json()).toEqual({
      key: 'stoktok:invoices:read',
      is_admin: false,
    })
    expect(toast.success).toHaveBeenCalledWith(
      'Permission stoktok:invoices:read added.'
    )
    await expect.poll(() => permCalls(seen, 'stoktok').length).toBe(2)
    await expect.element(add).toHaveFocus()

    await userEvent.click(add)
    const again = screen.getByRole('dialog', { name: 'Add permission' })
    await userEvent.fill(again.getByRole('textbox', { name: 'Resource' }), 'a')
    await userEvent.fill(again.getByRole('textbox', { name: 'Action' }), 'b')
    await userEvent.fill(
      again.getByRole('textbox', { name: 'Description (optional)' }),
      'Why'
    )
    await userEvent.click(again.getByRole('checkbox', { name: 'Admin only' }))
    await userEvent.click(again.getByRole('button', { name: 'Add permission' }))
    await expect.element(again).not.toBeInTheDocument()
    expect(await writes(seen, 'POST')[1].json()).toEqual({
      key: 'stoktok:a:b',
      is_admin: true,
      description: 'Why',
    })
  })

  it('add: 409 -> Action field error; 403 admin_wildcard_required inline; pending aria-disabled; double click one POST', async () => {
    let res: () => Response | Promise<Response> = () =>
      apiError(409, 'conflict')
    const { client, seen } = fakeApi(
      server(
        () => res(),
        () => json(permissionsPage(PERMISSIONS.stoktok))
      )
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'stoktok')
    await userEvent.click(sheet.getByRole('button', { name: 'Add permission' }))
    const dialog = screen.getByRole('dialog', { name: 'Add permission' })
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Resource' }),
      'orders'
    )
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Action' }),
      'read'
    )
    const submit = dialog.getByRole('button', { name: 'Add permission' })
    await userEvent.click(submit)
    await expect
      .element(dialog.getByText('A permission with this key already exists.'))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('textbox', { name: 'Action' }))
      .toHaveFocus()

    res = () => apiError(403, 'admin_wildcard_required')
    await userEvent.click(submit)
    await expect
      .element(
        dialog.getByRole('alert').filter({ hasText: 'Only super admins' })
      )
      .toBeVisible()

    let release: (r: Response) => void = noop
    res = () => new Promise<Response>((resolve) => (release = resolve))
    const before = writes(seen, 'POST').length
    const button = submit.element() as HTMLElement
    button.click()
    button.click()
    const busy = dialog.getByRole('button', { name: 'Adding…' })
    await expect.element(busy).toHaveAttribute('aria-disabled', 'true')
    expect(writes(seen, 'POST')).toHaveLength(before + 1)
    release(json(PERMISSIONS.stoktok[0], 201))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen, 'POST')).toHaveLength(before + 1)
  })

  it('admin app: is_admin checked and disabled with the reason; note shown', async () => {
    const { client } = fakeApi(
      server(
        () => json({}),
        () => json(permissionsPage(PERMISSIONS.admin))
      )
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'admin')
    await expect
      .element(
        sheet.getByText(
          /Admin app permissions are always admin only; changing them needs/
        )
      )
      .toBeVisible()
    await userEvent.click(sheet.getByRole('button', { name: 'Add permission' }))
    const dialog = screen.getByRole('dialog', { name: 'Add permission' })
    const box = dialog.getByRole('checkbox', { name: 'Admin only' })
    await expect.element(box).toBeChecked()
    await expect.element(box).toBeDisabled()
    await expect
      .element(
        dialog.getByText(
          /Admin app permissions are always admin only\. Adding one needs/
        )
      )
      .toBeVisible()
  })

  it('toggle opens a confirm naming the key; cancel sends nothing; confirm sends PATCH {is_admin:true}; the switch flips only after the refetch; focus returns to the switch', async () => {
    let release: (r: Response) => void = noop
    let isAdmin = false
    const { client, seen } = fakeApi(
      server(
        () => new Promise<Response>((resolve) => (release = resolve)),
        () =>
          json(
            permissionsPage([
              { ...PERMISSIONS.stoktok[0], is_admin: isAdmin },
              PERMISSIONS.stoktok[1],
            ])
          )
      )
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'stoktok')
    await expect.element(sheet).toBeVisible()
    // includeHidden: the open confirm dialog hides the sheet from the a11y tree.
    const sw = screen.getByRole('switch', {
      name: 'Admin only: stoktok:orders:read',
      includeHidden: true,
    })
    await userEvent.click(sw)
    let dialog = screen.getByRole('alertdialog')
    await expect
      .element(dialog.getByText('Make stoktok:orders:read admin only?'))
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen, 'PATCH')).toHaveLength(0)

    await userEvent.click(sw)
    dialog = screen.getByRole('alertdialog')
    await userEvent.click(
      dialog.getByRole('button', { name: 'Make admin only' })
    )
    await expect
      .element(dialog.getByRole('button', { name: 'Saving…' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect.element(sw).not.toBeChecked()
    expect(new URL(writes(seen, 'PATCH')[0].url).pathname).toBe(
      `/api/v1/apps/stoktok/permissions/${PERMISSIONS.stoktok[0].id}`
    )
    expect(await writes(seen, 'PATCH')[0].json()).toEqual({ is_admin: true })

    isAdmin = true
    release(json({ ...PERMISSIONS.stoktok[0], is_admin: true }))
    await expect.element(dialog).not.toBeInTheDocument()
    await expect.element(sw).toBeChecked()
    expect(toast.success).toHaveBeenCalledWith(
      'stoktok:orders:read is now admin only.'
    )
    await expect.element(sw).toHaveFocus()
  })

  it('toggle: 409 conflict (default role holds it) and 409 role_has_assignments shown inline; dialog stays open', async () => {
    for (const [res, text] of [
      [apiError(409, 'conflict'), 'default role or org owner role'],
      [
        apiError(409, 'role_has_assignments', [
          { field: 'is_admin', reason: 'role_has_assignments' },
        ]),
        'Revoke them first',
      ],
    ] as const) {
      const { client } = fakeApi(
        server(
          () => res.clone(),
          () => json(permissionsPage(PERMISSIONS.stoktok))
        )
      )
      const screen = await renderApps(client)
      const sheet = await openTab(screen, 'stoktok')
      await userEvent.click(
        sheet.getByRole('switch', { name: 'Admin only: stoktok:orders:read' })
      )
      const dialog = screen.getByRole('alertdialog')
      await userEvent.click(
        dialog.getByRole('button', { name: 'Make admin only' })
      )
      await expect.element(dialog.getByRole('alert')).toHaveTextContent(text)
      await expect.element(dialog).toBeVisible()
      await screen.unmount()
    }
  })

  it("'{app}:*' and admin-app permissions: switch checked and disabled with 'Always admin only'", async () => {
    const wildcard = {
      ...PERMISSIONS.stoktok[0],
      id: '7a7a7a7a-7777-4777-8777-777777777777',
      key: 'stoktok:*',
      is_admin: true,
    }
    let c = fakeApi(
      server(
        () => json({}),
        () => json(permissionsPage([wildcard, PERMISSIONS.stoktok[0]]))
      )
    )
    let screen = await renderApps(c.client)
    let sheet = await openTab(screen, 'stoktok')
    const locked = sheet.getByRole('switch', { name: 'Admin only: stoktok:*' })
    await expect.element(locked).toBeChecked()
    await expect.element(locked).toBeDisabled()
    await expect
      .element(locked)
      .toHaveAccessibleDescription('Always admin only')
    await expect
      .element(
        sheet.getByRole('switch', { name: 'Admin only: stoktok:orders:read' })
      )
      .toBeEnabled()
    await screen.unmount()

    c = fakeApi(
      server(
        () => json({}),
        () => json(permissionsPage(PERMISSIONS.admin))
      )
    )
    screen = await renderApps(c.client)
    sheet = await openTab(screen, 'admin')
    for (const p of PERMISSIONS.admin) {
      const sw = sheet.getByRole('switch', { name: `Admin only: ${p.key}` })
      await expect.element(sw).toBeChecked()
      await expect.element(sw).toBeDisabled()
    }
  })

  it('read-only (no admin:roles:manage): Add permission disabled with reason; switches disabled', async () => {
    const { client } = fakeApi(
      server(
        () => json({}),
        () => json(permissionsPage(PERMISSIONS.stoktok))
      )
    )
    const screen = await renderApps(client, { granted: ['admin:apps:read'] })
    const sheet = await openTab(screen, 'stoktok')
    await expect
      .element(sheet.getByRole('button', { name: 'Add permission' }))
      .toBeDisabled()
    await expect
      .element(sheet.getByText('Requires admin:roles:manage').first())
      .toBeVisible()
    await expect
      .element(
        sheet.getByRole('switch', { name: 'Admin only: stoktok:orders:read' })
      )
      .toBeDisabled()
  })
})
