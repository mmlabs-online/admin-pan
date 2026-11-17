import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { ORGS } from './test-data'
import {
  entitlementCalls,
  orgsServer,
  renderOrganizations,
  renderOrgSheet,
} from './test-fixtures'

const path = (r: Request) => new URL(r.url).pathname
const detailCalls = (seen: Request[], id: string) =>
  seen.filter(
    (r) => r.method === 'GET' && path(r) === `/api/v1/organizations/${id}`
  )
const ACME = ORGS[0]

describe('OrganizationDetailSheet', () => {
  it('View opens the sheet: title name + slug; Overview shows slug, status text, description or "No description", created; GET /organizations/{id} is sent; tabs are Overview and Entitlements', async () => {
    const { client, seen } = fakeApi(orgsServer(() => json({})))
    const screen = await renderOrganizations(client)
    await userEvent.click(
      screen.getByRole('button', { name: `View ${ACME.name}` })
    )
    const sheet = screen.getByRole('dialog')
    await expect.element(sheet.getByText('(acme)')).toBeVisible()
    await expect.poll(() => detailCalls(seen, ACME.id).length).toBe(1)
    await expect.element(sheet.getByText('Rockets and anvils')).toBeVisible()
    await expect.element(sheet.getByText('Active')).toBeVisible()
    expect(
      (sheet.element() as HTMLElement).querySelectorAll('time')
    ).toHaveLength(1)
    expect(sheet.getByRole('tab').elements()).toHaveLength(2)
    await expect
      .element(sheet.getByRole('tab', { name: 'Entitlements' }))
      .toBeVisible()
    await screen.unmount()

    const globex = await renderOrgSheet(client, { org: ORGS[1] })
    await expect.element(globex.getByText('No description')).toBeVisible()
    await expect.element(globex.getByText('Suspended')).toBeVisible()
  })

  it("detail 404 -> 'This organization no longer exists.' (no Retry); 500 -> error + Retry; 403 -> inline ForbiddenPanel", async () => {
    const detail = (res: () => Response) =>
      fakeApi((req) =>
        path(req) === `/api/v1/organizations/${ACME.id}`
          ? res()
          : orgsServer(() => json({}))(req)
      )
    const notFound = detail(() => apiError(404, 'not_found'))
    let screen = await renderOrgSheet(notFound.client)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('This organization no longer exists.')
    await expect
      .element(screen.getByRole('button', { name: 'Retry' }))
      .not.toBeInTheDocument()
    await screen.unmount()

    const denied = detail(() => apiError(403, 'permission_denied'))
    screen = await renderOrgSheet(denied.client)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
    await screen.unmount()

    let fail = true
    const flaky = detail(() =>
      fail ? apiError(500, 'internal_error') : json(ACME)
    )
    screen = await renderOrgSheet(flaky.client)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't load this organization.")
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect
      .element(screen.getByRole('tab', { name: 'Overview' }))
      .toBeVisible()
    expect(detailCalls(flaky.seen, ACME.id)).toHaveLength(2)
  })

  it('without admin:entitlements:read the Entitlements tab is not rendered and no entitlements request is sent', async () => {
    const { client, seen } = fakeApi(orgsServer(() => json({})))
    const screen = await renderOrgSheet(client, {
      granted: ['admin:organizations:read'],
    })
    await expect
      .element(screen.getByRole('tab', { name: 'Overview' }))
      .toBeVisible()
    expect(
      screen.getByRole('tab', { name: 'Entitlements' }).elements()
    ).toHaveLength(0)
    expect(entitlementCalls(seen, ACME.id)).toHaveLength(0)
  })

  it("closing the sheet returns focus to that row's View button (not body)", async () => {
    const { client } = fakeApi(orgsServer(() => json({})))
    const screen = await renderOrganizations(client)
    const view = screen.getByRole('button', { name: `View ${ORGS[1].name}` })
    await userEvent.click(view)
    await expect.element(screen.getByRole('dialog')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    await expect.element(view).toHaveFocus()
  })
})
