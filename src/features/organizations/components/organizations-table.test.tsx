import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { type Organization } from '../data/schema'
import { ORGS, orgsPage } from './test-data'
import { renderOrganizations } from './test-fixtures'

const listCalls = (seen: Request[]) =>
  seen.filter(
    (r) =>
      r.method === 'GET' && new URL(r.url).pathname === '/api/v1/organizations'
  )
const param = (r: Request, k: string) => new URL(r.url).searchParams.get(k)

const settle = () => new Promise((r) => setTimeout(r, 600))
const withParam = (seen: Request[], k: string) =>
  listCalls(seen).filter((r) => param(r, k) !== null)

/** A list endpoint that really filters ORGS by `status` and `q`. */
const filtering = (req: Request) => {
  const q = param(req, 'q')?.toLowerCase()
  const status = param(req, 'status')
  const items: Organization[] = ORGS.filter(
    (o) =>
      (!status || o.status === status) &&
      (!q || o.name.toLowerCase().includes(q) || o.slug.includes(q))
  )
  return json(orgsPage(items))
}

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

  it('search sends trimmed q after the debounce; several keystrokes send one request; URL gets q with page removed', async () => {
    const { client, seen } = fakeApi(filtering)
    const screen = await renderOrganizations(client, { search: { page: 1 } })
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search organizations' }),
      '  glob  '
    )
    await expect
      .poll(() => withParam(seen, 'q').map((r) => param(r, 'q')))
      .toEqual(['glob'])
    await settle()
    expect(withParam(seen, 'q')).toHaveLength(1)
    await expect
      .element(screen.getByTestId('search'))
      .toHaveTextContent('"q":"glob"')
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('1 organizations match these filters, page 1 of 1')
  })

  it('whitespace-only search sends no q and no extra request', async () => {
    const { client, seen } = fakeApi(filtering)
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search organizations' }),
      '   '
    )
    await settle()
    expect(withParam(seen, 'q')).toHaveLength(0)
    expect(listCalls(seen)).toHaveLength(1)
    await expect
      .element(screen.getByTestId('search'))
      .not.toHaveTextContent('"q"')
  })

  it('status filter (keyboard: focus, open, choose Suspended) sends status=suspended; All removes it', async () => {
    const { client, seen } = fakeApi(filtering)
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    const trigger = screen.getByRole('combobox', { name: 'Status' })
    ;(trigger.element() as HTMLElement).focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.click(screen.getByRole('option', { name: 'Suspended' }))
    await expect
      .poll(() => withParam(seen, 'status').map((r) => param(r, 'status')))
      .toEqual(['suspended'])
    await expect
      .element(screen.getByTestId('search'))
      .toHaveTextContent('"status":"suspended"')
    await expect.element(trigger).toHaveTextContent('Suspended')

    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('option', { name: 'All statuses' }))
    await expect
      .element(screen.getByTestId('search'))
      .not.toHaveTextContent('"status"')
    await expect
      .poll(() => param(listCalls(seen).slice(-1)[0], 'status'))
      .toBeNull()
  })

  it('sort headers cycle asc, desc, default; aria-sort follows; Status/Description have no sort button', async () => {
    const { client, seen } = fakeApi(filtering)
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    const th = (name: string) => screen.getByRole('columnheader', { name })
    await expect
      .element(th('Created at'))
      .toHaveAttribute('aria-sort', 'descending')
    await expect.element(th('Name')).toHaveAttribute('aria-sort', 'none')
    for (const name of ['Status', 'Description'])
      await expect.element(th(name)).not.toHaveAttribute('aria-sort')
    await expect
      .element(screen.getByRole('button', { name: 'Status', exact: true }))
      .not.toBeInTheDocument()

    const name = screen.getByRole('button', { name: 'Name', exact: true })
    await userEvent.click(name)
    await expect.element(th('Name')).toHaveAttribute('aria-sort', 'ascending')
    await expect
      .poll(() => param(listCalls(seen).slice(-1)[0], 'sort'))
      .toBe('name')
    await userEvent.click(name)
    await expect.element(th('Name')).toHaveAttribute('aria-sort', 'descending')
    await expect
      .poll(() => param(listCalls(seen).slice(-1)[0], 'sort'))
      .toBe('-name')
    await userEvent.click(name)
    await expect
      .element(th('Created at'))
      .toHaveAttribute('aria-sort', 'descending')
    await expect
      .element(screen.getByTestId('search'))
      .not.toHaveTextContent('"sort"')
    await expect
      .poll(() => param(listCalls(seen).slice(-1)[0], 'sort'))
      .toBeNull()

    await userEvent.click(
      screen.getByRole('button', { name: 'Created at', exact: true })
    )
    await expect
      .poll(() => param(listCalls(seen).slice(-1)[0], 'sort'))
      .toBe('created_at')
    await userEvent.click(
      screen.getByRole('button', { name: 'Slug', exact: true })
    )
    await expect
      .poll(() => param(listCalls(seen).slice(-1)[0], 'sort'))
      .toBe('slug')
  })

  it('URL round-trip: initial search is sent (offset 20) and shown; back/forward updates input and select and does not write the old draft back', async () => {
    const { client, seen } = fakeApi(filtering)
    const screen = await renderOrganizations(client, {
      search: { q: 'o', status: 'active', sort: '-name', page: 3 },
      back: {},
    })
    await expect.poll(() => listCalls(seen).length).toBeGreaterThan(0)
    const first = new URL(listCalls(seen)[0].url).searchParams
    expect(first.get('q')).toBe('o')
    expect(first.get('status')).toBe('active')
    expect(first.get('sort')).toBe('-name')
    expect(first.get('offset')).toBe('20')
    const input = screen.getByRole('searchbox', {
      name: 'Search organizations',
    })
    await expect.element(input).toHaveValue('o')
    await expect
      .element(screen.getByRole('combobox', { name: 'Status' }))
      .toHaveTextContent('Active')

    await userEvent.click(screen.getByRole('button', { name: 'Simulate back' }))
    await expect.element(input).toHaveValue('')
    await expect
      .element(screen.getByRole('combobox', { name: 'Status' }))
      .toHaveTextContent('All statuses')
    const count = listCalls(seen).length
    await settle()
    await expect.element(screen.getByTestId('search')).toHaveTextContent('{}')
    expect(param(listCalls(seen).slice(-1)[0], 'q')).toBeNull()
    expect(listCalls(seen).length).toBeLessThanOrEqual(count + 1)
  })

  it('every control resets the page: start at page 2, change q / status / sort', async () => {
    const { client, seen } = fakeApi(() => json(orgsPage(ORGS, 25)))
    const screen = await renderOrganizations(client, { search: { page: 2 } })
    await expect
      .poll(() => param(listCalls(seen).slice(-1)[0], 'offset'))
      .toBe('10')
    const lastOffset = () => param(listCalls(seen).slice(-1)[0], 'offset')
    const search = screen.getByTestId('search')

    await userEvent.click(
      screen.getByRole('button', { name: 'Name', exact: true })
    )
    await expect.element(search).not.toHaveTextContent('"page"')
    await expect.poll(lastOffset).toBe('0')

    await userEvent.click(
      screen.getByRole('button', { name: 'Go to next page' })
    )
    await expect.element(search).toHaveTextContent('"page":2')
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Active' }))
    await expect.element(search).not.toHaveTextContent('"page"')
    await expect.poll(lastOffset).toBe('0')

    await userEvent.click(
      screen.getByRole('button', { name: 'Go to next page' })
    )
    await expect.element(search).toHaveTextContent('"page":2')
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search organizations' }),
      'x'
    )
    await expect.element(search).toHaveTextContent('"q":"x"')
    await expect.element(search).not.toHaveTextContent('"page"')
    await expect.poll(lastOffset).toBe('0')
  })

  it("filtered empty: 'No organizations match these filters.' and Reset filters clears q/status/sort; unfiltered empty keeps its text", async () => {
    const { client } = fakeApi((req) =>
      param(req, 'status') || param(req, 'q')
        ? json(orgsPage([]))
        : json(orgsPage())
    )
    const screen = await renderOrganizations(client, {
      search: { status: 'suspended', q: 'zzz', sort: 'name' },
    })
    await expect
      .element(
        screen.getByRole('cell', {
          name: 'No organizations match these filters.',
        })
      )
      .toBeVisible()
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('No organizations match these filters.')
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByTestId('search')).toHaveTextContent('{}')
    await expect
      .element(screen.getByRole('button', { name: 'Reset filters' }))
      .not.toBeInTheDocument()
  })

  it('422 shows the fixed alert (no API message echoed), old rows are gone, Reset filters recovers', async () => {
    const { client } = fakeApi((req) =>
      param(req, 'status')
        ? apiError(422, 'validation_error')
        : json(orgsPage())
    )
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Active' }))
    const alert = screen.getByRole('alert')
    await expect
      .element(alert)
      .toHaveTextContent("The search or filters weren't accepted.")
    await expect.element(alert).not.toHaveTextContent('server text')
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
  })

  it('403 after a filter change shows the forbidden panel', async () => {
    const { client } = fakeApi((req) =>
      param(req, 'status')
        ? apiError(403, 'permission_denied', {
            required: 'admin:organizations:read',
          })
        : json(orgsPage())
    )
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .toBeVisible()
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Active' }))
    await expect
      .element(screen.getByText('admin:organizations:read', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByRole('table')).not.toBeInTheDocument()
  })

  it('status line announces the filtered count only once settled; the table is aria-busy while fetching', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const { client } = fakeApi(async (req) => {
      if (param(req, 'status')) await gate
      return json(orgsPage(req.url.includes('status') ? [ORGS[1]] : ORGS))
    })
    const screen = await renderOrganizations(client)
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('3 organizations, page 1 of 1')
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Suspended' }))
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Loading organizations…')
    await expect
      .element(screen.getByRole('table', { name: 'Organizations' }))
      .toHaveAttribute('aria-busy', 'true')
    release()
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('1 organizations match these filters, page 1 of 1')
    await expect
      .element(screen.getByRole('table', { name: 'Organizations' }))
      .toHaveAttribute('aria-busy', 'false')
  })

  it('controls have accessible names and sit in a search landmark', async () => {
    const { client } = fakeApi(() => json(orgsPage()))
    const screen = await renderOrganizations(client)
    const landmark = screen.getByRole('search', {
      name: 'Filter organizations',
    })
    await expect
      .element(
        landmark.getByRole('searchbox', { name: 'Search organizations' })
      )
      .toBeVisible()
    await expect
      .element(landmark.getByRole('combobox', { name: 'Status' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Reset filters' }))
      .not.toBeInTheDocument()
  })
})
