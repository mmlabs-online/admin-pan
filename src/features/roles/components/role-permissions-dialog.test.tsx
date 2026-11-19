import { apiError, fakeApi, json } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { OPERATOR_ID, PERMISSIONS, VIEWER_ID, pageOf, role } from './test-data'
import { renderRoles, rolesServer, writes } from './test-fixtures'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

type Screen = Awaited<ReturnType<typeof renderRoles>>
const path = (r: Request) => new URL(r.url).pathname
const stoktok = { search: { app: 'stoktok' } }
const ok = () =>
  json({
    id: VIEWER_ID,
    key: 'stoktok:viewer',
    name: 'Viewer',
    is_system: false,
    permissions: [],
  })

async function open(screen: Screen, key = 'stoktok:viewer') {
  await userEvent.click(
    screen.getByRole('button', { name: `Actions for ${key}` })
  )
  await userEvent.click(screen.getByRole('menuitem', { name: /Permissions/ }))
  return screen.getByRole('dialog')
}
const box = (dialog: ReturnType<Screen['getByRole']>, key: string) =>
  dialog.getByRole('checkbox', { name: key })
const save = (dialog: ReturnType<Screen['getByRole']>) =>
  dialog.getByRole('button', { name: 'Save' })
// Playwright refuses to click an aria-disabled button; a DOM click still
// reaches the handler, which is what a guard test needs.
const press = (button: ReturnType<Screen['getByRole']>) =>
  (button.element() as HTMLButtonElement).click()
const permCalls = (seen: Request[]) =>
  seen.filter((r) => r.method === 'GET' && path(r).endsWith('/permissions'))
const listCalls = (seen: Request[]) =>
  seen.filter(
    (r) => r.method === 'GET' && path(r).endsWith('/role-definitions')
  )

describe('RolePermissionsDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('Save is aria-disabled until the fresh role detail and every permissions page loaded; seeded from the detail, not the list row', async () => {
    let release: (r: Response) => void = () => {}
    const base = rolesServer(ok)
    const { client, seen } = fakeApi((req) =>
      path(req) === `/api/v1/apps/stoktok/role-definitions/${VIEWER_ID}`
        ? new Promise<Response>((resolve) => (release = resolve))
        : base(req)
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await expect.element(save(dialog)).toHaveAttribute('aria-disabled', 'true')
    await expect.element(dialog.getByText('Loading…')).toBeVisible()
    press(save(dialog))
    expect(writes(seen)).toHaveLength(0)
    // The list row says [orders:read]; the fresh detail says [orders:write].
    release(
      json({
        id: VIEWER_ID,
        app: 'stoktok',
        key: 'stoktok:viewer',
        name: 'Viewer',
        is_system: false,
        is_default: false,
        privileged: false,
        permissions: ['stoktok:orders:write'],
        created_at: '2026-01-05T10:00:00.000Z',
        updated_at: '2026-01-05T10:00:00.000Z',
      })
    )
    await expect.element(save(dialog)).not.toHaveAttribute('aria-disabled')
    await expect.element(box(dialog, 'stoktok:orders:write')).toBeChecked()
    await expect.element(box(dialog, 'stoktok:orders:read')).not.toBeChecked()
  })

  it('with 130 app permissions, Save stays aria-disabled until both pages loaded; a held key from page 2 is kept in the PUT body', async () => {
    const all = Array.from({ length: 130 }, (_, i) => ({
      ...PERMISSIONS.stoktok[0],
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      key: `stoktok:r${i}:read`,
    }))
    let release: (r: Response) => void = () => {}
    const base = rolesServer(ok, {
      permissions: () => all,
      roles: () => [
        role('stoktok', VIEWER_ID, 'viewer', {
          permissions: ['stoktok:r120:read'],
        }),
      ],
    })
    const { client, seen } = fakeApi((req) =>
      path(req).endsWith('/permissions') &&
      new URL(req.url).searchParams.get('offset') === '100'
        ? new Promise<Response>((resolve) => (release = resolve))
        : base(req)
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    // The detail is in (the held key shows) but page 2 is not: no Save yet.
    await expect.element(box(dialog, 'stoktok:r120:read')).toBeChecked()
    await expect.element(save(dialog)).toHaveAttribute('aria-disabled', 'true')
    press(save(dialog))
    expect(writes(seen)).toHaveLength(0)
    release(json(pageOf(all, 100, 100)))
    await expect.element(save(dialog)).not.toHaveAttribute('aria-disabled')
    await userEvent.click(box(dialog, 'stoktok:r0:read'))
    await expect.element(box(dialog, 'stoktok:r120:read')).toBeChecked()
    await userEvent.click(save(dialog))
    await expect.element(dialog).not.toBeInTheDocument()
    const [put] = writes(seen)
    expect(put.method).toBe('PUT')
    expect((await put.json()).permission_keys).toEqual([
      'stoktok:r0:read',
      'stoktok:r120:read',
    ])
  })

  it('no change -> closes with no request', async () => {
    const { client, seen } = fakeApi(rolesServer(ok))
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await expect.element(box(dialog, 'stoktok:orders:read')).toBeChecked()
    await expect.element(save(dialog)).not.toHaveAttribute('aria-disabled')
    await userEvent.click(save(dialog))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen)).toHaveLength(0)
  })

  it('adding only -> PUT sorted keys; toast; refetch', async () => {
    const { client, seen } = fakeApi(rolesServer(ok))
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await expect.element(box(dialog, 'stoktok:orders:read')).toBeChecked()
    await expect.element(save(dialog)).not.toHaveAttribute('aria-disabled')
    const before = listCalls(seen).length
    await userEvent.click(box(dialog, 'stoktok:orders:write'))
    await userEvent.click(save(dialog))
    await expect.element(dialog).not.toBeInTheDocument()
    const [put] = writes(seen)
    expect(path(put)).toBe(
      `/api/v1/apps/stoktok/roles/${VIEWER_ID}/permissions`
    )
    expect(await put.json()).toEqual({
      permission_keys: ['stoktok:orders:read', 'stoktok:orders:write'],
    })
    expect(toast.success).toHaveBeenCalledWith(
      'Permissions of stoktok:viewer saved.'
    )
    await expect.poll(() => listCalls(seen).length).toBeGreaterThan(before)
  })

  it("removing -> confirm phase lists removed keys and 'Everyone holding {key} loses these on their next request'; Back sends nothing; Confirm sends one PUT", async () => {
    const { client, seen } = fakeApi(rolesServer(ok))
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen, 'stoktok:operator')
    await expect.element(box(dialog, 'stoktok:orders:write')).toBeChecked()
    await expect.element(save(dialog)).not.toHaveAttribute('aria-disabled')
    await userEvent.click(box(dialog, 'stoktok:orders:write'))
    await userEvent.click(save(dialog))
    await expect
      .element(dialog.getByText('stoktok:orders:write', { exact: true }))
      .toBeVisible()
    await expect
      .element(
        dialog.getByText(
          'Everyone holding stoktok:operator loses these on their next request.'
        )
      )
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Back' }))
    expect(writes(seen)).toHaveLength(0)
    await expect.element(box(dialog, 'stoktok:orders:read')).toBeVisible()
    await userEvent.click(save(dialog))
    await userEvent.dblClick(
      dialog.getByRole('button', { name: 'Remove and save' })
    )
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen)).toHaveLength(1)
    expect(path(writes(seen)[0])).toContain(OPERATOR_ID)
    expect(await writes(seen)[0].json()).toEqual({
      permission_keys: ['stoktok:orders:read'],
    })
  })

  it("is_admin permissions show 'Admin only — changing it needs admin:*'; admin:* is disabled unless the role is admin:super-admin", async () => {
    const roles = () => [
      role('admin', 'b1000001-0000-4000-8000-000000000001', 'super-admin', {
        permissions: ['admin:*'],
      }),
      role('admin', 'b1000002-0000-4000-8000-000000000002', 'support', {
        permissions: ['admin:apps:read'],
      }),
    ]
    const { client } = fakeApi(rolesServer(ok, { roles }))
    const screen = await renderRoles(client, { search: { app: 'admin' } })
    let dialog = await open(screen, 'admin:support')
    await expect.element(box(dialog, 'admin:apps:read')).toBeChecked()
    await expect.element(box(dialog, 'admin:*')).toBeDisabled()
    await expect
      .element(dialog.getByText(/Only admin:super-admin can hold admin:\*/))
      .toBeVisible()
    await expect
      .element(
        dialog.getByText(/Admin only — changing it needs admin:\*/).first()
      )
      .toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()
    dialog = await open(screen, 'admin:super-admin')
    await expect.element(box(dialog, 'admin:*')).toBeChecked()
    await expect.element(box(dialog, 'admin:*')).toBeEnabled()
    await expect
      .element(dialog.getByText('This role must keep admin:*.'))
      .toBeVisible()
  })

  it('409 role_has_assignments -> revoke-first text; 409 conflict -> fixed lead + server text; 422 unknown_permission names keys and refetches the permission list; 403 admin_wildcard_required inline', async () => {
    let next: Response = apiError(409, 'conflict', [
      { field: 'role_id', reason: 'role_has_assignments' },
    ])
    const { client, seen } = fakeApi(
      rolesServer((req) => (req.method === 'PUT' ? next.clone() : json({})))
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await expect.element(box(dialog, 'stoktok:orders:read')).toBeChecked()
    await expect.element(save(dialog)).not.toHaveAttribute('aria-disabled')
    await userEvent.click(box(dialog, 'stoktok:orders:write'))
    await userEvent.click(save(dialog))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('Revoke its assignments')

    next = apiError(409, 'conflict')
    await userEvent.click(save(dialog))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('The API refused this permission set')
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('server text')

    const before = permCalls(seen).length
    next = apiError(422, 'unprocessable', [
      {
        field: 'permission_keys',
        reason: 'unknown_permission',
        key: 'stoktok:orders:write',
      },
    ])
    await userEvent.click(save(dialog))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent(
        'These permissions no longer exist: stoktok:orders:write.'
      )
    await expect.poll(() => permCalls(seen).length).toBeGreaterThan(before)

    next = apiError(403, 'admin_wildcard_required')
    await userEvent.click(save(dialog))
    await expect
      .element(dialog.getByText('Only super admins can do this'))
      .toBeVisible()
    // The dialog stays in the edit phase with the selection intact.
    await expect.element(dialog).toBeVisible()
  })

  it('a key the role holds but the app list lacks is shown flagged and kept unless unchecked', async () => {
    const { client, seen } = fakeApi(
      rolesServer(ok, {
        roles: () => [
          role('stoktok', VIEWER_ID, 'viewer', {
            permissions: ['stoktok:old:thing'],
          }),
        ],
      })
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await expect.element(box(dialog, 'stoktok:old:thing')).toBeChecked()
    await expect
      .element(dialog.getByText("Not in this app's permission list").first())
      .toBeVisible()
    await userEvent.click(box(dialog, 'stoktok:orders:read'))
    await userEvent.click(save(dialog))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await writes(seen)[0].json()).toEqual({
      permission_keys: ['stoktok:old:thing', 'stoktok:orders:read'],
    })
  })

  it('read-only (no admin:roles:manage): checkboxes disabled, no Save', async () => {
    const { client } = fakeApi(rolesServer(ok))
    const screen = await renderRoles(client, {
      granted: ['admin:apps:read'],
      ...stoktok,
    })
    const dialog = await open(screen)
    await expect.element(box(dialog, 'stoktok:orders:read')).toBeDisabled()
    await expect.element(save(dialog)).not.toBeInTheDocument()
    await expect
      .element(dialog.getByText(/needs admin:roles:manage/))
      .toBeVisible()
  })

  it('more than 200 selected -> Save aria-disabled with the limit message', async () => {
    const many = Array.from({ length: 201 }, (_, i) => `stoktok:x${i}:read`)
    const { client, seen } = fakeApi(
      rolesServer(ok, {
        roles: () => [
          role('stoktok', VIEWER_ID, 'viewer', { permissions: many }),
        ],
      })
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await expect
      .element(
        dialog.getByText('A role can hold at most 200 permissions.').first()
      )
      .toBeVisible()
    await expect.element(save(dialog)).toHaveAttribute('aria-disabled', 'true')
    press(save(dialog))
    expect(writes(seen)).toHaveLength(0)
  })

  it('permission-list error offers Retry and keeps Save disabled until it loads', async () => {
    const base = rolesServer(ok)
    let fail = true
    const { client } = fakeApi((req) =>
      path(req).endsWith('/permissions') && fail
        ? apiError(500, 'internal')
        : base(req)
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent("Couldn't load the app's permission list.")
    await expect.element(save(dialog)).toHaveAttribute('aria-disabled', 'true')
    fail = false
    await userEvent.click(dialog.getByRole('button', { name: 'Retry' }))
    await expect.element(box(dialog, 'stoktok:orders:read')).toBeChecked()
    await expect.element(save(dialog)).not.toHaveAttribute('aria-disabled')
  })

  it('detail 403 shows the inline ForbiddenPanel and no picker', async () => {
    const base = rolesServer(ok)
    const { client } = fakeApi((req) =>
      path(req) === `/api/v1/apps/stoktok/role-definitions/${VIEWER_ID}`
        ? apiError(403, 'permission_denied')
        : base(req)
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await expect
      .element(dialog.getByText("You don't have permission to do this"))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('checkbox').first())
      .not.toBeInTheDocument()
  })

  it('Save with removals focuses the confirm heading; Back focuses Save; send failure focuses the alert', async () => {
    const { client } = fakeApi(
      rolesServer((req) =>
        req.method === 'PUT' ? apiError(500, 'internal') : ok()
      )
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen, 'stoktok:operator')
    await expect.element(box(dialog, 'stoktok:orders:write')).toBeChecked()
    await expect.element(save(dialog)).not.toHaveAttribute('aria-disabled')
    await userEvent.click(box(dialog, 'stoktok:orders:write'))
    await userEvent.click(save(dialog))
    await expect
      .element(
        dialog.getByRole('heading', { name: /Remove these permissions/ })
      )
      .toHaveFocus()
    await userEvent.click(dialog.getByRole('button', { name: 'Back' }))
    await expect.element(save(dialog)).toHaveFocus()
    await userEvent.click(save(dialog))
    await userEvent.click(
      dialog.getByRole('button', { name: 'Remove and save' })
    )
    const alert = dialog.getByRole('alert')
    await expect.element(alert).toBeVisible()
    await vi.waitFor(() =>
      expect(document.activeElement?.contains(alert.element())).toBe(true)
    )
  })

  it('Save is described by its reason while loading', async () => {
    const base = rolesServer(ok)
    const { client } = fakeApi((req) =>
      path(req) === `/api/v1/apps/stoktok/role-definitions/${VIEWER_ID}`
        ? new Promise<Response>(() => {})
        : base(req)
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await expect.element(save(dialog)).toHaveAccessibleDescription(/Loading/)
  })

  it('Save is described by its reason while over the limit', async () => {
    const many = Array.from({ length: 201 }, (_, i) => `stoktok:x${i}:read`)
    const { client } = fakeApi(
      rolesServer(ok, {
        roles: () => [
          role('stoktok', VIEWER_ID, 'viewer', { permissions: many }),
        ],
      })
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await expect
      .element(save(dialog))
      .toHaveAccessibleDescription(/at most 200/)
  })

  it('loading is announced in the status region', async () => {
    const base = rolesServer(ok)
    const { client } = fakeApi((req) =>
      path(req) === `/api/v1/apps/stoktok/role-definitions/${VIEWER_ID}`
        ? new Promise<Response>(() => {})
        : base(req)
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await expect
      .element(dialog.getByRole('status'))
      .toHaveTextContent('Loading permissions…')
  })

  it('no PUT when the role refetch fails during confirm', async () => {
    let failDetail = false
    const base = rolesServer(ok)
    const { client, seen } = fakeApi((req) =>
      failDetail &&
      path(req) === `/api/v1/apps/stoktok/role-definitions/${OPERATOR_ID}`
        ? apiError(500, 'internal')
        : base(req)
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen, 'stoktok:operator')
    await expect.element(box(dialog, 'stoktok:orders:write')).toBeChecked()
    await expect.element(save(dialog)).not.toHaveAttribute('aria-disabled')
    await userEvent.click(box(dialog, 'stoktok:orders:write'))
    await userEvent.click(save(dialog))
    const confirm = dialog.getByRole('button', { name: 'Remove and save' })
    await expect.element(confirm).toBeVisible()
    failDetail = true
    window.dispatchEvent(new Event('visibilitychange'))
    await expect.element(confirm).toHaveAttribute('aria-disabled', 'true')
    await expect.element(confirm).toHaveAccessibleDescription(/load this role/)
    press(confirm)
    await new Promise((r) => setTimeout(r, 100))
    expect(writes(seen)).toHaveLength(0)
    await expect
      .element(dialog.getByText(/This role changed while you were reviewing/))
      .not.toBeInTheDocument()
    await expect
      .element(dialog.getByRole('button', { name: 'Remove and save' }))
      .toBeInTheDocument()
  })

  it('403 on the role refetch during confirm does not say Loading', async () => {
    let deny = false
    const base = rolesServer(ok)
    const { client, seen } = fakeApi((req) =>
      deny &&
      path(req) === `/api/v1/apps/stoktok/role-definitions/${OPERATOR_ID}`
        ? apiError(403, 'forbidden')
        : base(req)
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen, 'stoktok:operator')
    await expect.element(box(dialog, 'stoktok:orders:write')).toBeChecked()
    await expect.element(save(dialog)).not.toHaveAttribute('aria-disabled')
    await userEvent.click(box(dialog, 'stoktok:orders:write'))
    await userEvent.click(save(dialog))
    const confirm = dialog.getByRole('button', { name: 'Remove and save' })
    await expect.element(confirm).toBeVisible()
    deny = true
    window.dispatchEvent(new Event('visibilitychange'))
    await expect.element(confirm).toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(confirm)
      .toHaveAccessibleDescription('You no longer have access to this role.')
    expect(writes(seen)).toHaveLength(0)
  })

  it('role changed during confirm returns to edit with an alert and sends nothing', async () => {
    let held = ['stoktok:orders:read', 'stoktok:orders:write']
    const { client, seen } = fakeApi(
      rolesServer(ok, {
        roles: () => [
          role('stoktok', OPERATOR_ID, 'operator', { permissions: held }),
        ],
      })
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen, 'stoktok:operator')
    await expect.element(box(dialog, 'stoktok:orders:write')).toBeChecked()
    await expect.element(save(dialog)).not.toHaveAttribute('aria-disabled')
    await userEvent.click(box(dialog, 'stoktok:orders:write'))
    await userEvent.click(save(dialog))
    const confirm = dialog.getByRole('button', { name: 'Remove and save' })
    await expect.element(confirm).toBeVisible()
    held = ['stoktok:orders:read']
    const detailCalls = () =>
      seen.filter((r) => path(r).includes('/role-definitions/')).length
    const before = detailCalls()
    window.dispatchEvent(new Event('visibilitychange'))
    await expect.poll(detailCalls).toBeGreaterThan(before)
    await expect.element(confirm).not.toHaveAttribute('aria-disabled')
    press(confirm)
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('This role changed while you were reviewing')
    await expect.element(save(dialog)).toBeVisible()
    expect(writes(seen)).toHaveLength(0)
  })
})
