import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { OPERATOR_ID, ROLES, VIEWER_ID, pageOf, role } from './test-data'
import { renderRoles, rolesServer } from './test-fixtures'

const path = (r: Request) => new URL(r.url).pathname
const urls = (seen: Request[]) =>
  seen.map((r) => path(r) + new URL(r.url).search)
const noWrite = () => json({})
type Screen = Awaited<ReturnType<typeof renderRoles>>

const search = (screen: Screen) =>
  JSON.parse(
    screen.getByTestId('search').element().textContent ?? '{}'
  ) as Record<string, unknown>

describe('RolesTable', () => {
  it('defaults to the first non-admin app (calechip); fetches GET /apps?limit=100&offset=0 then its role-definitions', async () => {
    const { client, seen } = fakeApi(rolesServer(noWrite))
    const screen = await renderRoles(client)
    await expect
      .element(screen.getByRole('table', { name: 'Roles of Calechip' }))
      .toBeVisible()
    await expect.element(screen.getByText('calechip:member')).toBeVisible()
    expect(urls(seen).slice(0, 2)).toEqual([
      '/api/v1/apps?limit=100&offset=0',
      '/api/v1/apps/calechip/role-definitions?limit=10&offset=0',
    ])
    expect(search(screen)).toEqual({})
  })

  it('?app=stoktok selects stoktok; picking another app writes app to the URL and resets page', async () => {
    const { client } = fakeApi(rolesServer(noWrite))
    const screen = await renderRoles(client, {
      search: { app: 'stoktok', page: 3 },
    })
    await expect.element(screen.getByText('stoktok:viewer')).toBeVisible()
    await userEvent.click(screen.getByRole('combobox', { name: 'App' }))
    await userEvent.click(screen.getByRole('option', { name: /Calechip/ }))
    await expect.element(screen.getByText('calechip:member')).toBeVisible()
    expect(search(screen).app).toBe('calechip')
    expect(search(screen).page).toBeUndefined()
  })

  it("picker lists every app with a 'disabled' marker; admin selectable; has an accessible name", async () => {
    const { client } = fakeApi(rolesServer(noWrite))
    const screen = await renderRoles(client)
    await expect.element(screen.getByText('calechip:member')).toBeVisible()
    await userEvent.click(screen.getByRole('combobox', { name: 'App' }))
    expect(screen.getByRole('option').elements()).toHaveLength(4)
    await expect
      .element(
        screen.getByRole('option', { name: 'Legacy (legacy) — disabled' })
      )
      .toBeVisible()
    await userEvent.click(screen.getByRole('option', { name: /Admin console/ }))
    await expect.element(screen.getByText('admin:super-admin')).toBeVisible()
  })

  it("loading: a never-resolving fetch shows 'Loading roles…' and aria-busy", async () => {
    const base = rolesServer(noWrite)
    const { client } = fakeApi((req) =>
      path(req).endsWith('/role-definitions')
        ? new Promise<Response>(() => {})
        : base(req)
    )
    const screen = await renderRoles(client)
    await expect
      .element(screen.getByRole('table', { name: 'Roles of Calechip' }))
      .toHaveAttribute('aria-busy', 'true')
    await expect
      .element(screen.getByRole('status').filter({ hasText: 'Loading roles…' }))
      .toBeInTheDocument()
  })

  it('rows: key, name, System/Default/Org owner badges (text), permission count, Privileged text', async () => {
    const { client } = fakeApi(rolesServer(noWrite))
    const screen = await renderRoles(client)
    const table = screen.getByRole('table', { name: 'Roles of Calechip' })
    const member = table.getByRole('row').filter({ hasText: 'calechip:member' })
    await expect.element(member.getByText('Default')).toBeVisible()
    await expect.element(member.getByText('1 permissions')).toBeVisible()
    const owner = table.getByRole('row').filter({ hasText: 'calechip:owner' })
    await expect.element(owner.getByText('System')).toBeVisible()
    await expect.element(owner.getByText('Org owner')).toBeVisible()
    await userEvent.click(screen.getByRole('combobox', { name: 'App' }))
    await userEvent.click(screen.getByRole('option', { name: /Stoktok/ }))
    const operator = screen
      .getByRole('table', { name: 'Roles of Stoktok' })
      .getByRole('row')
      .filter({ hasText: 'stoktok:operator' })
    await expect.element(operator.getByText('Yes')).toBeVisible()
    await expect.element(operator.getByText('2 permissions')).toBeVisible()
  })

  it("empty: 'No roles in Legacy yet.'", async () => {
    const { client } = fakeApi(rolesServer(noWrite))
    const screen = await renderRoles(client, { search: { app: 'legacy' } })
    await expect
      .element(screen.getByRole('cell', { name: 'No roles in Legacy yet.' }))
      .toBeVisible()
    await expect
      .element(screen.getByText('This app is disabled.', { exact: false }))
      .toBeVisible()
  })

  it('error shows an alert and Retry refetches', async () => {
    let fail = true
    const base = rolesServer(noWrite)
    const { client, seen } = fakeApi((req) =>
      fail && path(req).endsWith('/role-definitions')
        ? apiError(500, 'internal_error')
        : base(req)
    )
    const screen = await renderRoles(client)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't load roles.")
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect.element(screen.getByText('calechip:member')).toBeVisible()
    expect(
      seen.filter((r) => path(r).endsWith('/role-definitions'))
    ).toHaveLength(2)
  })

  it('403 shows the page ForbiddenPanel and no table', async () => {
    const base = rolesServer(noWrite)
    const { client } = fakeApi((req) =>
      path(req).endsWith('/role-definitions')
        ? apiError(403, 'permission_denied', { required: 'admin:apps:read' })
        : base(req)
    )
    const screen = await renderRoles(client)
    await expect
      .element(screen.getByText('admin:apps:read', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByRole('table')).not.toBeInTheDocument()
  })

  it("404 on the roles of the app shows 'This app no longer exists.'", async () => {
    const base = rolesServer(noWrite)
    const { client } = fakeApi((req) =>
      path(req).endsWith('/role-definitions')
        ? apiError(404, 'not_found')
        : base(req)
    )
    const screen = await renderRoles(client)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('This app no longer exists.')
  })

  it('apps list 403 shows the page ForbiddenPanel; apps list error offers Retry; no apps shows a message', async () => {
    let screen = await renderRoles(
      fakeApi(() => apiError(403, 'permission_denied')).client
    )
    await expect
      .element(screen.getByText("You don't have permission to do this"))
      .toBeVisible()
    await screen.unmount()
    let fail = true
    const { client } = fakeApi((req) =>
      fail
        ? apiError(500, 'internal_error')
        : rolesServer(noWrite, { apps: () => [] })(req)
    )
    screen = await renderRoles(client)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't load apps.")
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect
      .element(screen.getByText('No apps registered yet.'))
      .toBeVisible()
  })

  it('an unknown ?app= shows the app-gone message; the picker stays', async () => {
    const { client } = fakeApi(rolesServer(noWrite))
    const screen = await renderRoles(client, { search: { app: 'nope' } })
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('This app no longer exists.')
    await expect
      .element(screen.getByRole('combobox', { name: 'App' }))
      .toBeVisible()
  })

  it('total 25, pageSize 10: Next sends offset=10 and writes page=2; clamps to page 1 when a page comes back empty', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      role(
        'calechip',
        `d0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        `r${i}`
      )
    )
    const { client, seen } = fakeApi(
      rolesServer(noWrite, { roles: () => many })
    )
    const screen = await renderRoles(client)
    await expect.element(screen.getByText('calechip:r0')).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Go to next page' })
    )
    await expect.element(screen.getByText('calechip:r10')).toBeVisible()
    expect(search(screen).page).toBe(2)
    expect(
      urls(seen).some((u) => u.endsWith('role-definitions?limit=10&offset=10'))
    ).toBe(true)
  })

  it('clamps to page 1 (page leaves the URL) when the requested page comes back empty', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      role(
        'calechip',
        `d0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        `r${i}`
      )
    )
    const clamped = fakeApi((req) =>
      path(req).endsWith('/role-definitions') &&
      new URL(req.url).searchParams.get('offset') === '50'
        ? json(pageOf([], 10, 50, 25))
        : rolesServer(noWrite, { roles: () => many })(req)
    )
    const s2 = await renderRoles(clamped.client, { search: { page: 6 } })
    await expect.element(s2.getByText('calechip:r0')).toBeVisible()
    await expect.poll(() => search(s2).page).toBeUndefined()
    expect(urls(clamped.seen).some((u) => u.includes('offset=50'))).toBe(true)
  })

  it("app switch shows loading, not the previous app's rows", async () => {
    const base = rolesServer(noWrite)
    const { client } = fakeApi((req) =>
      path(req) === '/api/v1/apps/stoktok/role-definitions'
        ? new Promise<Response>(() => {})
        : base(req)
    )
    const screen = await renderRoles(client)
    await expect.element(screen.getByText('calechip:member')).toBeVisible()
    await userEvent.click(screen.getByRole('combobox', { name: 'App' }))
    await userEvent.click(screen.getByRole('option', { name: /Stoktok/ }))
    await expect
      .element(screen.getByRole('table', { name: 'Roles of Stoktok' }))
      .toHaveAttribute('aria-busy', 'true')
    await expect
      .element(screen.getByText('calechip:member'))
      .not.toBeInTheDocument()
  })

  it('admin app selected: admin:* note shown; New role and row actions stay enabled', async () => {
    const { client } = fakeApi(rolesServer(noWrite))
    const screen = await renderRoles(client, { search: { app: 'admin' } })
    await expect.element(screen.getByText('admin:super-admin')).toBeVisible()
    await expect
      .element(screen.getByText(/need the admin:\* permission/))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'New role' }))
      .toBeEnabled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for admin:super-admin' })
    )
    await expect
      .element(screen.getByRole('menuitem', { name: 'Rename' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('menuitem', { name: /Permissions/ }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('menuitem', { name: /Set as default/ }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(screen.getByText('The admin app has no default role'))
      .toBeVisible()
  })

  it("read-only (admin:apps:read only): New role disabled with 'Requires admin:roles:manage'; menu has only 'Permissions'", async () => {
    const { client } = fakeApi(rolesServer(noWrite))
    const screen = await renderRoles(client, { granted: ['admin:apps:read'] })
    await expect.element(screen.getByText('calechip:member')).toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'New role' }))
      .toBeDisabled()
    await expect
      .element(screen.getByText('Requires admin:roles:manage'))
      .toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for calechip:owner' })
    )
    expect(screen.getByRole('menuitem').elements()).toHaveLength(1)
    await expect
      .element(screen.getByRole('menuitem', { name: /Permissions/ }))
      .toBeVisible()
  })

  it('Set as default is absent without admin:apps:write', async () => {
    const { client } = fakeApi(rolesServer(noWrite))
    const screen = await renderRoles(client, {
      granted: ['admin:apps:read', 'admin:roles:manage'],
      search: { app: 'stoktok' },
    })
    await expect.element(screen.getByText('stoktok:viewer')).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for stoktok:viewer' })
    )
    await expect
      .element(screen.getByRole('menuitem', { name: 'Rename' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('menuitem', { name: /Set as default/ }))
      .not.toBeInTheDocument()
  })

  it('Delete is disabled with a visible reason for system, default and org owner roles; Set as default is hidden on the default row', async () => {
    const { client } = fakeApi(rolesServer(noWrite))
    const screen = await renderRoles(client)
    await expect.element(screen.getByText('calechip:member')).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for calechip:member' })
    )
    await expect
      .element(screen.getByRole('menuitem', { name: /Delete/ }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(screen.getByText('Default role: choose another default first'))
      .toBeVisible()
    await expect
      .element(screen.getByRole('menuitem', { name: /Set as default/ }))
      .not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for calechip:owner' })
    )
    await expect
      .element(screen.getByText("System roles can't be deleted"))
      .toBeVisible()
  })

  it('Delete is disabled with the org owner reason when the owner role is not a system role', async () => {
    const { client } = fakeApi(
      rolesServer(noWrite, {
        roles: (k) =>
          k === 'calechip'
            ? ROLES.calechip.map((r) => ({ ...r, is_system: false }))
            : [],
      })
    )
    const screen = await renderRoles(client)
    await userEvent.click(
      await screen.getByRole('button', { name: 'Actions for calechip:owner' })
    )
    await expect.element(screen.getByText('Org owner role')).toBeVisible()
  })

  it("row actions use the row's API id in the path; the trigger is labelled 'Actions for {key}'", async () => {
    const { client, seen } = fakeApi(
      rolesServer(() => new Response(null, { status: 204 }))
    )
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    await expect.element(screen.getByText('stoktok:operator')).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for stoktok:operator' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    await userEvent.click(
      screen.getByRole('alertdialog').getByRole('button', { name: 'Delete' })
    )
    await expect
      .poll(() => seen.filter((r) => r.method === 'DELETE').map(path))
      .toEqual([`/api/v1/apps/stoktok/roles/${OPERATOR_ID}`])
  })

  it('the Assignments item is shown with admin:users:read, hidden when denied; it opens the holders sheet', async () => {
    const base = rolesServer(noWrite)
    const { client, seen } = fakeApi((req) =>
      path(req).endsWith('/assignments') ? json(pageOf([])) : base(req)
    )
    const screen = await renderRoles(client, {
      search: { app: 'stoktok' },
      granted: ['admin:apps:read', 'admin:users:read'],
    })
    await expect.element(screen.getByText('stoktok:viewer')).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for stoktok:viewer' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: /Assignments/ }))
    await expect
      .element(
        screen.getByRole('heading', {
          name: 'Assignments of Viewer (stoktok:viewer)',
        })
      )
      .toBeVisible()
    await expect
      .element(screen.getByText('No one holds this role.'))
      .toBeVisible()
    expect(
      seen.filter((r) => path(r).endsWith('/assignments')).map(path)
    ).toEqual([
      `/api/v1/apps/stoktok/role-definitions/${VIEWER_ID}/assignments`,
    ])
    await userEvent.keyboard('{Escape}')
    await expect
      .element(
        screen.getByRole('button', { name: 'Actions for stoktok:viewer' })
      )
      .toHaveFocus()

    await screen.unmount()
    const denied = await renderRoles(client, {
      search: { app: 'stoktok' },
      granted: ['admin:apps:read'],
    })
    await userEvent.click(
      denied.getByRole('button', { name: 'Actions for stoktok:viewer' })
    )
    await expect
      .element(denied.getByRole('menuitem', { name: /Permissions/ }))
      .toBeVisible()
    await expect
      .element(denied.getByRole('menuitem', { name: /Assignments/ }))
      .not.toBeInTheDocument()
  })

  it('disabled Delete is keyboard reachable, aria-disabled, carries its reason, and Enter opens nothing', async () => {
    const { client } = fakeApi(rolesServer(noWrite))
    const screen = await renderRoles(client)
    await expect.element(screen.getByText('calechip:member')).toBeVisible()
    screen
      .getByRole('button', { name: 'Actions for calechip:member' })
      .element()
      .focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{End}')
    const del = screen.getByRole('menuitem', { name: /Delete/ })
    await expect.element(del).toHaveFocus()
    await expect.element(del).toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(del)
      .toHaveAccessibleName(/Default role: choose another default first/)
    await userEvent.keyboard('{Enter}')
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    await expect.element(del).toBeVisible()
  })

  it('Set as default on the admin app is keyboard reachable, aria-disabled, carries its reason, and Enter opens nothing', async () => {
    const { client } = fakeApi(rolesServer(noWrite))
    const screen = await renderRoles(client, { search: { app: 'admin' } })
    await expect.element(screen.getByText('admin:super-admin')).toBeVisible()
    screen
      .getByRole('button', { name: 'Actions for admin:super-admin' })
      .element()
      .focus()
    await userEvent.keyboard('{Enter}')
    for (let i = 0; i < 3; i++) await userEvent.keyboard('{ArrowDown}')
    const item = screen.getByRole('menuitem', { name: /Set as default/ })
    await expect.element(item).toHaveFocus()
    await expect.element(item).toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(item)
      .toHaveAccessibleName(/The admin app has no default role/)
    await userEvent.keyboard('{Enter}')
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    await expect.element(item).toBeVisible()
  })

  it('focus returns to the row actions of a key with quotes and backslashes', async () => {
    const odd = 'x"]b\\'
    const { client } = fakeApi(
      rolesServer(noWrite, {
        roles: () => [role('stoktok', VIEWER_ID, odd)],
      })
    )
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const name = `Actions for stoktok:${odd}`
    await userEvent.click(screen.getByRole('button', { name }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    await expect.element(screen.getByRole('dialog')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(screen.getByRole('button', { name })).toHaveFocus()
  })

  it('apps loading status is the same node before and after load', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const base = rolesServer(noWrite)
    const { client } = fakeApi(async (req) => {
      if (path(req) === '/api/v1/apps') await gate
      return base(req)
    })
    const screen = await renderRoles(client)
    const status = screen.getByRole('status')
    await expect.element(status).toHaveTextContent('Loading apps…')
    const node = status.element()
    release()
    await expect
      .element(screen.getByRole('table', { name: 'Roles of Calechip' }))
      .toBeVisible()
    expect(node.isConnected).toBe(true)
  })
})
