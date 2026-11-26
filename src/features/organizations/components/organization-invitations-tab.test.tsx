import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { INVITATIONS, ORGS, invitationsPage } from './test-data'
import { invitationCalls, orgsServer, renderOrgSheet } from './test-fixtures'

const noop = () => {}
const ACME = ORGS[0]
type Screen = Awaited<ReturnType<typeof renderOrgSheet>>

async function openTab(screen: Screen) {
  await userEvent.click(screen.getByRole('tab', { name: 'Invitations' }))
}
const search = (req: Request) => new URL(req.url).searchParams

describe('OrganizationInvitationsTab', () => {
  it('fetches GET …/invitations?limit=20&offset=0&status=pending only when the Invitations tab is selected', async () => {
    const { client, seen } = fakeApi(orgsServer(() => json({})))
    const screen = await renderOrgSheet(client)
    await expect
      .element(screen.getByRole('tab', { name: 'Overview' }))
      .toBeVisible()
    expect(invitationCalls(seen, ACME.id)).toHaveLength(0)
    await openTab(screen)
    await expect.poll(() => invitationCalls(seen, ACME.id).length).toBe(1)
    const params = search(invitationCalls(seen, ACME.id)[0])
    expect(params.get('limit')).toBe('20')
    expect(params.get('offset')).toBe('0')
    expect(params.get('status')).toBe('pending')
  })

  it("loading 'Loading invitations…' / empty 'No pending invitations.' / error + Retry / 404 no Retry / 403 inline ForbiddenPanel", async () => {
    let c = fakeApi(
      orgsServer(() => json({}), {
        invitations: () => new Promise<Response>(noop) as never,
      })
    )
    let screen = await renderOrgSheet(c.client)
    await openTab(screen)
    await expect.element(screen.getByText('Loading invitations…')).toBeVisible()
    await screen.unmount()

    c = fakeApi(
      orgsServer(() => json({}), {
        invitations: () => json(invitationsPage([])),
      })
    )
    screen = await renderOrgSheet(c.client)
    await openTab(screen)
    await expect
      .element(screen.getByText('No pending invitations.'))
      .toBeVisible()
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Revoked' }))
    await expect
      .element(screen.getByText('No revoked invitations.'))
      .toBeVisible()
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'All statuses' }))
    await expect.element(screen.getByText('No invitations.')).toBeVisible()
    await screen.unmount()

    let fail = true
    c = fakeApi(
      orgsServer(() => json({}), {
        invitations: () =>
          fail
            ? apiError(500, 'internal_error')
            : json(invitationsPage(INVITATIONS[ACME.id])),
      })
    )
    screen = await renderOrgSheet(c.client)
    await openTab(screen)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't load invitations.")
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect
      .element(screen.getByRole('table', { name: 'Invitations of Acme Corp' }))
      .toBeVisible()
    await screen.unmount()

    c = fakeApi(
      orgsServer(() => json({}), {
        invitations: () => apiError(404, 'not_found'),
      })
    )
    screen = await renderOrgSheet(c.client)
    await openTab(screen)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('This organization no longer exists.')
    await expect
      .element(screen.getByRole('button', { name: 'Retry' }))
      .not.toBeInTheDocument()
    await screen.unmount()

    c = fakeApi(
      orgsServer(() => json({}), {
        invitations: () => apiError(403, 'permission_denied'),
      })
    )
    screen = await renderOrgSheet(c.client)
    await openTab(screen)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
  })

  it("rows: status text Pending / Accepted / Revoked / Expired; table labelled 'Invitations of {name}', th scope=col; accepted/revoked date or 'None'; the note says invitee emails are not shown", async () => {
    const { client } = fakeApi(
      orgsServer(() => json({}), {
        invitations: () => json(invitationsPage(INVITATIONS[ACME.id])),
      })
    )
    const screen = await renderOrgSheet(client)
    await openTab(screen)
    const table = screen.getByRole('table', {
      name: 'Invitations of Acme Corp',
    })
    await expect.element(table).toBeVisible()
    const root = table.element() as HTMLElement
    expect(
      [...root.querySelectorAll('th')].map((th) => th.textContent)
    ).toEqual([
      'Status',
      'App',
      'Role',
      'Created',
      'Expires',
      'Accepted / revoked',
    ])
    for (const th of root.querySelectorAll('th'))
      expect(th.getAttribute('scope')).toBe('col')
    for (const label of ['Pending', 'Accepted', 'Revoked', 'Expired'])
      await expect
        .element(table.getByText(label, { exact: true }).first())
        .toBeVisible()
    await expect
      .element(table.getByRole('cell', { name: /^Accepted [A-Z]/ }))
      .toBeVisible()
    await expect
      .element(table.getByRole('cell', { name: /^Revoked [A-Z]/ }))
      .toBeVisible()
    expect(table.getByText('None').elements()).toHaveLength(2)
    await expect
      .element(screen.getByText(/does not return the invitee/))
      .toBeVisible()
  })

  it("status filter is labelled 'Status'; choosing All statuses sends no status param and resets offset to 0; choosing Expired sends status=expired", async () => {
    const { client, seen } = fakeApi(
      orgsServer(() => json({}), {
        invitations: (req) =>
          json(
            invitationsPage(
              INVITATIONS[ACME.id],
              25,
              20,
              Number(search(req).get('offset'))
            )
          ),
      })
    )
    const screen = await renderOrgSheet(client)
    await openTab(screen)
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await expect
      .poll(() =>
        invitationCalls(seen, ACME.id).map((r) => search(r).get('offset'))
      )
      .toContain('20')
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'All statuses' }))
    await expect
      .poll(() => {
        const last = invitationCalls(seen, ACME.id).slice(-1)[0]
        return [search(last).has('status'), search(last).get('offset')]
      })
      .toEqual([false, '0'])
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Expired' }))
    await expect
      .poll(() =>
        search(invitationCalls(seen, ACME.id).slice(-1)[0]).get('status')
      )
      .toBe('expired')
  })

  it('total 25: Next sends offset=20 with the same status', async () => {
    const { client, seen } = fakeApi(
      orgsServer(() => json({}), {
        invitations: (req) =>
          json(
            invitationsPage(
              INVITATIONS[ACME.id],
              25,
              20,
              Number(search(req).get('offset'))
            )
          ),
      })
    )
    const screen = await renderOrgSheet(client)
    await openTab(screen)
    await expect
      .element(screen.getByText('Showing 1–20 of 25 invitations'))
      .toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await expect
      .poll(() => {
        const last = invitationCalls(seen, ACME.id).slice(-1)[0]
        return [search(last).get('offset'), search(last).get('status')]
      })
      .toEqual(['20', 'pending'])
    await expect
      .element(screen.getByRole('button', { name: 'Next' }))
      .toHaveAttribute('aria-disabled', 'true')
  })
})
