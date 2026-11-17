import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { ENTITLEMENTS, ORGS, entitlementsPage } from './test-data'
import { entitlementCalls, orgsServer, renderOrgSheet } from './test-fixtures'

const noop = () => {}
const ACME = ORGS[0]
const GLOBEX = ORGS[1]
type Screen = Awaited<ReturnType<typeof renderOrgSheet>>

async function openTab(screen: Screen) {
  await userEvent.click(screen.getByRole('tab', { name: 'Entitlements' }))
}

/** Server whose entitlements list comes from `list()`. */
function server(list: (req: Request) => Response | Promise<Response>) {
  const base = orgsServer(() => json({}))
  return (req: Request) =>
    req.method === 'GET' && new URL(req.url).pathname.endsWith('/entitlements')
      ? list(req)
      : base(req)
}

describe('OrganizationEntitlementsTab', () => {
  it('fetches GET …/entitlements?limit=100&offset=0 only when the Entitlements tab is selected', async () => {
    const { client, seen } = fakeApi(orgsServer(() => json({})))
    const screen = await renderOrgSheet(client)
    await expect
      .element(screen.getByRole('tab', { name: 'Overview' }))
      .toBeVisible()
    expect(entitlementCalls(seen, ACME.id)).toHaveLength(0)
    await openTab(screen)
    await expect.poll(() => entitlementCalls(seen, ACME.id).length).toBe(1)
    expect(new URL(entitlementCalls(seen, ACME.id)[0].url).search).toBe(
      '?limit=100&offset=0'
    )
  })

  it("loading 'Loading entitlements…' / empty 'No products granted yet.' / error + Retry / 403 inline ForbiddenPanel", async () => {
    let c = fakeApi(server(() => new Promise<Response>(noop)))
    let screen = await renderOrgSheet(c.client)
    await openTab(screen)
    await expect
      .element(screen.getByText('Loading entitlements…'))
      .toBeVisible()
    await screen.unmount()

    c = fakeApi(server(() => json(entitlementsPage([]))))
    screen = await renderOrgSheet(c.client)
    await openTab(screen)
    await expect
      .element(screen.getByText('No products granted yet.'))
      .toBeVisible()
    await screen.unmount()

    let fail = true
    c = fakeApi(
      server(() =>
        fail
          ? apiError(500, 'internal_error')
          : json(entitlementsPage(ENTITLEMENTS[ACME.id]))
      )
    )
    screen = await renderOrgSheet(c.client)
    await openTab(screen)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't load entitlements.")
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect.element(screen.getByText('calechip').first()).toBeVisible()
    await screen.unmount()

    c = fakeApi(server(() => apiError(403, 'permission_denied')))
    screen = await renderOrgSheet(c.client)
    await openTab(screen)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
  })

  it('rows: table labelled "Entitlements of {name}", th scope=col; app key mono; plan; limits "seats: 10" or "None"; status text Active / Disabled / Inactive; the Inactive note appears only when a row is enabled but inactive', async () => {
    const { client } = fakeApi(orgsServer(() => json({})))
    let screen = await renderOrgSheet(client)
    await openTab(screen)
    const table = screen.getByRole('table', {
      name: 'Entitlements of Acme Corp',
    })
    await expect.element(table).toBeVisible()
    const heads = (table.element() as HTMLElement).querySelectorAll('th')
    expect(heads.length).toBeGreaterThan(0)
    for (const th of heads) expect(th.getAttribute('scope')).toBe('col')
    await expect.element(table.getByText('seats: 10')).toBeVisible()
    await expect.element(table.getByText('None')).toBeVisible()
    await expect
      .element(table.getByText('Active', { exact: true }))
      .toBeVisible()
    await expect
      .element(table.getByText('Disabled', { exact: true }))
      .toBeVisible()
    expect(table.getByText('calechip').element().className).toContain(
      'font-mono'
    )
    expect(
      (table.element() as HTMLElement).querySelectorAll('time')
    ).toHaveLength(2)
    await expect.element(screen.getByText(/^Inactive:/)).not.toBeInTheDocument()
    await screen.unmount()

    screen = await renderOrgSheet(client, { org: GLOBEX })
    await openTab(screen)
    await expect
      .element(screen.getByText('Inactive', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByText(/^Inactive:/)).toBeVisible()
  })

  it('suspended org shows "This organization is suspended …" hint; Grant stays enabled', async () => {
    const { client } = fakeApi(orgsServer(() => json({})))
    const screen = await renderOrgSheet(client, { org: GLOBEX })
    await openTab(screen)
    await expect
      .element(screen.getByText(/This organization is suspended/))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Grant product' }))
      .toBeEnabled()
  })

  it("granted only admin:entitlements:read: Grant and switches natively disabled with 'Requires admin:entitlements:write', Edit hidden; list still shown", async () => {
    const { client } = fakeApi(orgsServer(() => json({})))
    const screen = await renderOrgSheet(client, {
      granted: ['admin:organizations:read', 'admin:entitlements:read'],
    })
    await openTab(screen)
    await expect.element(screen.getByText('seats: 10')).toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Grant product' }))
      .toBeDisabled()
    await expect
      .element(screen.getByRole('switch', { name: 'calechip enabled' }))
      .toBeDisabled()
    await expect
      .element(screen.getByText('Requires admin:entitlements:write').first())
      .toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Edit / }).elements()
    ).toHaveLength(0)
  })

  it("total 150 with 100 items → 'Showing 100 of 150 entitlements.'", async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      ...ENTITLEMENTS[ACME.id][0],
      id: `9a9a9a9a-9999-4999-8999-${String(i).padStart(12, '0')}`,
      app_key: `app-${i}`,
    }))
    const { client } = fakeApi(server(() => json(entitlementsPage(items, 150))))
    const screen = await renderOrgSheet(client)
    await openTab(screen)
    await expect
      .element(screen.getByText('Showing 100 of 150 entitlements.'))
      .toBeVisible()
  })
})
