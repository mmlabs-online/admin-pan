import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { MEMBERS, ORGS, membersPage } from './test-data'
import { memberCalls, orgsServer, renderOrgSheet } from './test-fixtures'

const noop = () => {}
const ACME = ORGS[0]
type Screen = Awaited<ReturnType<typeof renderOrgSheet>>

async function openTab(screen: Screen) {
  await userEvent.click(screen.getByRole('tab', { name: 'Members' }))
}

describe('OrganizationMembersTab', () => {
  it('fetches GET …/members?limit=20&offset=0 only when the Members tab is selected', async () => {
    const { client, seen } = fakeApi(orgsServer(() => json({})))
    const screen = await renderOrgSheet(client)
    await expect
      .element(screen.getByRole('tab', { name: 'Overview' }))
      .toBeVisible()
    expect(memberCalls(seen, ACME.id)).toHaveLength(0)
    await openTab(screen)
    await expect.poll(() => memberCalls(seen, ACME.id).length).toBe(1)
    expect(new URL(memberCalls(seen, ACME.id)[0].url).search).toBe(
      '?limit=20&offset=0'
    )
  })

  it("loading 'Loading role assignments…' / empty 'No one holds a role in this organization.' / error + Retry recovers to rows / 404 'This organization no longer exists.' without Retry / 403 inline ForbiddenPanel", async () => {
    let c = fakeApi(
      orgsServer(() => json({}), {
        members: () => new Promise<Response>(noop) as never,
      })
    )
    let screen = await renderOrgSheet(c.client)
    await openTab(screen)
    await expect
      .element(screen.getByText('Loading role assignments…'))
      .toBeVisible()
    await screen.unmount()

    c = fakeApi(
      orgsServer(() => json({}), { members: () => json(membersPage([])) })
    )
    screen = await renderOrgSheet(c.client)
    await openTab(screen)
    await expect
      .element(screen.getByText('No one holds a role in this organization.'))
      .toBeVisible()
    await screen.unmount()

    let fail = true
    c = fakeApi(
      orgsServer(() => json({}), {
        members: () =>
          fail
            ? apiError(500, 'internal_error')
            : json(membersPage(MEMBERS[ACME.id])),
      })
    )
    screen = await renderOrgSheet(c.client)
    await openTab(screen)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't load role assignments.")
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect
      .element(screen.getByText('ada@example.com').first())
      .toBeVisible()
    await screen.unmount()

    c = fakeApi(
      orgsServer(() => json({}), {
        members: () => apiError(404, 'not_found'),
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
        members: () => apiError(403, 'permission_denied'),
      })
    )
    screen = await renderOrgSheet(c.client)
    await openTab(screen)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
  })

  it("rows: table labelled 'Role assignments in {name}', th scope=col; display name or 'No display name'; email; Disabled user badge; role name + key; Granted <time>; 'Never' when no expiry; 'Expired' for active=false; the same user on two rows", async () => {
    const { client } = fakeApi(orgsServer(() => json({})))
    const screen = await renderOrgSheet(client)
    await openTab(screen)
    const table = screen.getByRole('table', {
      name: 'Role assignments in Acme Corp',
    })
    await expect.element(table).toBeVisible()
    const root = table.element() as HTMLElement
    expect(
      [...root.querySelectorAll('th')].map((th) => th.textContent)
    ).toEqual(['User', 'App', 'Role', 'Granted', 'Expires', 'Status'])
    for (const th of root.querySelectorAll('th'))
      expect(th.getAttribute('scope')).toBe('col')
    expect(table.getByText('ada@example.com').elements()).toHaveLength(2)
    expect(table.getByText('Ada Lovelace').elements()).toHaveLength(2)
    await expect.element(table.getByText('No display name')).toBeVisible()
    await expect.element(table.getByText('grace@example.com')).toBeVisible()
    await expect.element(table.getByText('Disabled')).toBeVisible()
    await expect
      .element(table.getByText('Administrator', { exact: true }))
      .toBeVisible()
    await expect
      .element(table.getByText('Viewer', { exact: true }))
      .toBeVisible()
    expect(
      table.getByText('viewer', { exact: true }).element().className
    ).toContain('font-mono')
    expect(root.querySelectorAll('time')[0].getAttribute('datetime')).toBe(
      MEMBERS[ACME.id][0].created_at
    )
    expect(table.getByText('Never').elements()).toHaveLength(2)
    expect(table.getByText('Not expired').elements()).toHaveLength(2)
    await expect
      .element(table.getByText('Expired', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByText(/not people/)).toBeVisible()
  })

  it("total 45: 'Showing 1–20 of 45 role assignments'; Previous aria-disabled; Next sends offset=20; on the last page Next is aria-disabled", async () => {
    const { client, seen } = fakeApi(
      orgsServer(() => json({}), {
        members: (req) => {
          const offset = Number(new URL(req.url).searchParams.get('offset'))
          return json(membersPage(MEMBERS[ACME.id], 45, 20, offset))
        },
      })
    )
    const screen = await renderOrgSheet(client)
    await openTab(screen)
    await expect
      .element(screen.getByText('Showing 1–20 of 45 role assignments'))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Previous' }))
      .toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await expect
      .poll(() =>
        memberCalls(seen, ACME.id).map((r) =>
          new URL(r.url).searchParams.get('offset')
        )
      )
      .toContain('20')
    await expect
      .element(screen.getByText('Showing 21–40 of 45 role assignments'))
      .toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await expect
      .element(screen.getByText('Showing 41–45 of 45 role assignments'))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Next' }))
      .toHaveAttribute('aria-disabled', 'true')
  })
})
