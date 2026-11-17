import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { ORGS, orgsPage } from './test-data'
import { renderOrganizations } from './test-fixtures'

const listCalls = (seen: Request[]) =>
  seen.filter(
    (r) =>
      r.method === 'GET' && new URL(r.url).pathname === '/api/v1/organizations'
  )
const param = (r: Request, k: string) => new URL(r.url).searchParams.get(k)

describe('OrganizationsTable', () => {
  it("loading: a never-resolving fetch shows 'Loading organizations…' and aria-busy", async () => {
    const { client } = fakeApi(() => new Promise<Response>(() => {}))
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Loading organizations…')
    await expect
      .element(screen.getByRole('table', { name: 'Organizations' }))
      .toHaveAttribute('aria-busy', 'true')
  })

  it("sends limit/offset only and renders rows from the API (name, slug, status badge, 'No description', created date)", async () => {
    const { client, seen } = fakeApi(() => json(orgsPage()))
    const screen = await renderOrganizations(client)
    const table = screen.getByRole('table', { name: 'Organizations' })
    await expect
      .element(table.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    await expect.element(table.getByText('acme', { exact: true })).toBeVisible()
    await expect.element(table.getByText('Suspended')).toBeVisible()
    await expect.element(table.getByText('No description')).toBeInTheDocument()
    await expect.element(table.getByText('Jan 5, 2026')).toBeVisible()
    // header row + 3 data rows
    expect(table.getByRole('row').elements()).toHaveLength(ORGS.length + 1)

    const url = new URL(listCalls(seen)[0].url)
    expect([...url.searchParams.keys()].sort()).toEqual(['limit', 'offset'])
    expect(param(listCalls(seen)[0], 'limit')).toBe('10')
    expect(param(listCalls(seen)[0], 'offset')).toBe('0')
  })

  it("empty: 'No organizations yet.'", async () => {
    const { client } = fakeApi(() => json(orgsPage([])))
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByRole('cell', { name: 'No organizations yet.' }))
      .toBeVisible()
  })

  it('error shows an alert and Retry refetches', async () => {
    let fail = true
    const { client, seen } = fakeApi(() =>
      fail ? apiError(500, 'internal_error') : json(orgsPage())
    )
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't load organizations.")
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    expect(listCalls(seen)).toHaveLength(2)
  })

  it('403 shows the ForbiddenPanel and no table', async () => {
    const { client } = fakeApi(() =>
      apiError(403, 'permission_denied', {
        required: 'admin:organizations:read',
      })
    )
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByText('admin:organizations:read', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByRole('table')).not.toBeInTheDocument()
  })

  it('403 on refetch replaces stale rows with the ForbiddenPanel', async () => {
    let forbid = false
    const { client } = fakeApi(() =>
      forbid ? apiError(403, 'permission_denied') : json(orgsPage(ORGS, 25))
    )
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    forbid = true
    await userEvent.click(
      screen.getByRole('button', { name: 'Go to next page' })
    )
    await expect
      .element(screen.getByText("You don't have permission to do this"))
      .toBeVisible()
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .not.toBeInTheDocument()
  })

  it('next page sends offset=10 and writes page=2 to the URL', async () => {
    const { client, seen } = fakeApi(() => json(orgsPage(ORGS, 25)))
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Go to next page' })
    )
    await expect
      .element(screen.getByTestId('search'))
      .toHaveTextContent('"page":2')
    await expect
      .poll(() => listCalls(seen).map((r) => param(r, 'offset')))
      .toContain('10')
  })

  it('clamps to the last page when the current page comes back empty', async () => {
    const { client } = fakeApi((req) =>
      param(req, 'offset') === '20'
        ? json(orgsPage([], 3, 10, 20))
        : json(orgsPage())
    )
    const screen = await renderOrganizations(client, { search: { page: 3 } })
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByTestId('search'))
      .not.toHaveTextContent('"page":3')
  })

  it('no search box, status facet or sort buttons', async () => {
    const { client } = fakeApi(() => json(orgsPage()))
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByRole('textbox')).not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Status' }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('columnheader').getByRole('button'))
      .not.toBeInTheDocument()
  })

  it("live region announces '{total} organizations, page 1 of n'", async () => {
    const { client } = fakeApi(() => json(orgsPage(ORGS, 25)))
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('25 organizations, page 1 of 3')
  })

  it('read-only: New organization disabled with "Requires admin:organizations:write", no row menu; write: both available', async () => {
    const { client } = fakeApi(() => json(orgsPage()))
    const readOnly = await renderOrganizations(client, {
      granted: ['admin:organizations:read'],
    })
    await expect
      .element(readOnly.getByRole('button', { name: 'New organization' }))
      .toBeDisabled()
    await expect
      .element(readOnly.getByText('Requires admin:organizations:write'))
      .toBeVisible()
    await expect
      .element(readOnly.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    await expect
      .element(readOnly.getByRole('button', { name: /^Actions for/ }))
      .not.toBeInTheDocument()
    await readOnly.unmount()

    const writer = await renderOrganizations(client, {
      granted: ['admin:organizations:write'],
    })
    await expect
      .element(writer.getByRole('button', { name: 'New organization' }))
      .toBeEnabled()
    await expect
      .element(writer.getByRole('button', { name: 'Actions for Acme Corp' }))
      .toBeInTheDocument()
  })
})
