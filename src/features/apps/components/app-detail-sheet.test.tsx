import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { APPS } from './test-data'
import { appsServer, renderApps } from './test-fixtures'

const path = (r: Request) => new URL(r.url).pathname
const detailCalls = (seen: Request[], key: string) =>
  seen.filter((r) => r.method === 'GET' && path(r) === `/api/v1/apps/${key}`)

async function view(
  screen: Awaited<ReturnType<typeof renderApps>>,
  key: string
) {
  await userEvent.click(screen.getByRole('button', { name: `View ${key}` }))
  return screen.getByRole('dialog')
}

describe('AppDetailSheet', () => {
  it("Overview has a 'Manage roles' link to /roles?app={key}; the stale role-management line is gone", async () => {
    const { client } = fakeApi(appsServer(() => json({})))
    const screen = await renderApps(client)
    const sheet = await view(screen, 'stoktok')
    const link = sheet.getByRole('link', { name: 'Manage roles' })
    await expect.element(link).toBeVisible()
    expect(new URL((link.element() as HTMLAnchorElement).href).search).toBe(
      '?app=stoktok'
    )
    await expect
      .element(sheet.getByText(/arrive with role management/))
      .not.toBeInTheDocument()
  })

  it('fetches GET /apps/{key} when opened; shows the list row while loading; then the fetched values', async () => {
    let release: (r: Response) => void = () => {}
    const { client, seen } = fakeApi((req) =>
      path(req) === '/api/v1/apps/stoktok'
        ? new Promise<Response>((resolve) => (release = resolve))
        : appsServer(() => json({}))(req)
    )
    const screen = await renderApps(client)
    await expect
      .element(screen.getByText('Stoktok', { exact: true }))
      .toBeVisible()
    expect(detailCalls(seen, 'stoktok')).toHaveLength(0)

    const sheet = await view(screen, 'stoktok')
    await expect.element(sheet.getByText('Stoktok').first()).toBeVisible()
    await expect.poll(() => detailCalls(seen, 'stoktok').length).toBe(1)

    release(json({ ...APPS[2], name: 'Stoktok (fresh)' }))
    await expect
      .element(sheet.getByText('Stoktok (fresh)').first())
      .toBeVisible()
  })

  it("Overview: key, name, status, join policy, org mode, default role key or 'None', origins as a plain list (no links), created/updated as <time>; no Members", async () => {
    const { client } = fakeApi(appsServer(() => json({})))
    const screen = await renderApps(client)
    const sheet = await view(screen, 'stoktok')
    await expect.element(sheet.getByText('stoktok:member')).toBeVisible()
    await expect
      .element(sheet.getByText(APPS[2].default_role_id as string))
      .not.toBeInTheDocument()
    await expect
      .element(sheet.getByText('https://stoktok.mmlabs.online'))
      .toBeVisible()
    await expect.element(sheet.getByText('http://localhost:5173')).toBeVisible()
    // The origins are plain text: the only link is 'Manage roles'.
    expect(sheet.getByRole('link').elements()).toHaveLength(1)
    expect(
      (sheet.element() as HTMLElement).querySelectorAll('time')
    ).toHaveLength(2)
    await expect.element(sheet.getByText('Members')).not.toBeInTheDocument()
    await expect
      .element(sheet.getByText('Org owner role'))
      .not.toBeInTheDocument()
    await expect
      .element(sheet.getByText('Approval', { exact: true }))
      .toBeVisible()
    await expect
      .element(sheet.getByText('Disabled', { exact: true }))
      .toBeVisible()
  })

  it('shows the org owner role for org-mode-required apps and "None" without a default role; admin app shows the note', async () => {
    const { client } = fakeApi(appsServer(() => json({})))
    const screen = await renderApps(client)
    const sheet = await view(screen, 'calechip')
    await expect.element(sheet.getByText('Org owner role')).toBeVisible()
    await expect.element(sheet.getByText('calechip:owner')).toBeVisible()
    await expect
      .element(sheet.getByText(APPS[1].org_owner_role_id as string))
      .not.toBeInTheDocument()
    await expect.element(sheet.getByText('Super-admin role')).toBeVisible()
    await expect.element(sheet.getByText('None').first()).toBeVisible()
    await screen.unmount()

    const admin = await renderApps(client)
    const adminSheet = await view(admin, 'admin')
    await expect
      .element(adminSheet.getByText(/need the admin:\* permission/))
      .toBeVisible()
  })

  it("role names: loading -> 'Loading…'; unknown id -> 'Unknown role (id)'; role-definitions 500 -> the id with a note; no request when all three ids are null", async () => {
    const isRoles = (r: Request) => path(r).endsWith('/role-definitions')
    let release: (r: Response) => void = () => {}
    const slow = fakeApi((req) =>
      isRoles(req)
        ? new Promise<Response>((resolve) => (release = resolve))
        : appsServer(() => json({}))(req)
    )
    let screen = await renderApps(slow.client)
    let sheet = await view(screen, 'stoktok')
    await expect.element(sheet.getByText('Loading…')).toBeVisible()
    release(json({ items: [], total: 0, limit: 100, offset: 0 }))
    await expect
      .element(
        sheet.getByText(`Unknown role (${APPS[2].default_role_id as string})`)
      )
      .toBeVisible()
    await screen.unmount()

    const broken = fakeApi((req) =>
      isRoles(req)
        ? apiError(500, 'internal_error')
        : appsServer(() => json({}))(req)
    )
    screen = await renderApps(broken.client)
    sheet = await view(screen, 'stoktok')
    await expect
      .element(sheet.getByText(/role names couldn't be loaded/))
      .toBeVisible()
    await expect
      .element(sheet.getByText(APPS[2].default_role_id as string))
      .toBeVisible()
    await screen.unmount()

    const none = fakeApi(appsServer(() => json({})))
    screen = await renderApps(none.client)
    sheet = await view(screen, 'simap')
    await expect.element(sheet.getByText('Org owner role')).toBeVisible()
    expect(none.seen.filter(isRoles)).toHaveLength(0)
  })

  it("404 -> 'This app no longer exists.'; 403 -> inline ForbiddenPanel; error -> Retry", async () => {
    for (const [res, text] of [
      [apiError(404, 'not_found'), 'This app no longer exists.'],
      [
        apiError(403, 'permission_denied'),
        "You don't have permission to do this",
      ],
    ] as const) {
      const { client } = fakeApi((req) =>
        path(req) === '/api/v1/apps/stoktok'
          ? res.clone()
          : appsServer(() => json({}))(req)
      )
      const screen = await renderApps(client)
      const sheet = await view(screen, 'stoktok')
      await expect.element(sheet.getByRole('alert')).toHaveTextContent(text)
      await screen.unmount()
    }

    let fail = true
    const { client, seen } = fakeApi((req) =>
      path(req) === '/api/v1/apps/stoktok' && fail
        ? apiError(500, 'internal_error')
        : appsServer(() => json({}))(req)
    )
    const screen = await renderApps(client)
    const sheet = await view(screen, 'stoktok')
    await expect
      .element(sheet.getByRole('alert'))
      .toHaveTextContent("Couldn't load this app.")
    fail = false
    await userEvent.click(sheet.getByRole('button', { name: 'Retry' }))
    await expect
      .element(sheet.getByRole('tab', { name: 'Overview' }))
      .toBeVisible()
    expect(detailCalls(seen, 'stoktok')).toHaveLength(2)
  })

  it('tabs: stoktok has Overview, Permissions, Join requests, Credentials (no Roles); admin has no Join requests', async () => {
    const { client } = fakeApi(appsServer(() => json({})))
    const screen = await renderApps(client)
    const sheet = await view(screen, 'stoktok')
    await expect
      .element(sheet.getByRole('tab', { name: 'Overview' }))
      .toBeVisible()
    expect(sheet.getByRole('tab').elements()).toHaveLength(4)
    for (const name of ['Permissions', 'Join requests', 'Credentials'])
      await expect.element(sheet.getByRole('tab', { name })).toBeVisible()
    await expect
      .element(sheet.getByRole('tab', { name: 'Roles' }))
      .not.toBeInTheDocument()
    await screen.unmount()

    const other = await renderApps(client)
    const admin = await view(other, 'admin')
    await expect
      .element(admin.getByRole('tab', { name: 'Credentials' }))
      .toBeVisible()
    expect(admin.getByRole('tab').elements()).toHaveLength(3)
    await expect
      .element(admin.getByRole('tab', { name: 'Join requests' }))
      .not.toBeInTheDocument()
  })

  it('no Join requests tab when admin:users:read is denied', async () => {
    const { client } = fakeApi(appsServer(() => json({})))
    const screen = await renderApps(client, { granted: ['admin:apps:read'] })
    const sheet = await view(screen, 'stoktok')
    await expect
      .element(sheet.getByRole('tab', { name: 'Credentials' }))
      .toBeVisible()
    expect(sheet.getByRole('tab').elements()).toHaveLength(3)
    await expect
      .element(sheet.getByRole('tab', { name: 'Join requests' }))
      .not.toBeInTheDocument()
  })
})
