import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { APPS, appsPage } from './test-data'
import { isList, renderApps } from './test-fixtures'

const param = (r: Request, k: string) => new URL(r.url).searchParams.get(k)

describe('AppsTable', () => {
  it("loading: a never-resolving fetch shows 'Loading apps…' and aria-busy", async () => {
    const { client } = fakeApi(() => new Promise<Response>(() => {}))
    const screen = await renderApps(client)
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Loading apps…')
    await expect
      .element(screen.getByRole('table', { name: 'Apps' }))
      .toHaveAttribute('aria-busy', 'true')
  })

  it('sends limit/offset only and renders rows (key, name, status badge text, join policy, org mode, origin count)', async () => {
    const { client, seen } = fakeApi(() => json(appsPage()))
    const screen = await renderApps(client)
    const table = screen.getByRole('table', { name: 'Apps' })
    await expect
      .element(table.getByText('Admin console', { exact: true }))
      .toBeVisible()
    await expect
      .element(table.getByText('stoktok', { exact: true }))
      .toBeVisible()
    await expect
      .element(table.getByText('Disabled', { exact: true }))
      .toBeVisible()
    await expect
      .element(table.getByText('Approval', { exact: true }))
      .toBeVisible()
    await expect
      .element(table.getByText('Required', { exact: true }))
      .toBeVisible()
    // header row + 3 data rows
    expect(table.getByRole('row').elements()).toHaveLength(APPS.length + 1)
    const stoktok = table.getByRole('row').filter({ hasText: 'stoktok' })
    await expect
      .element(stoktok.getByRole('cell').nth(5))
      .toHaveTextContent('2')

    const calls = seen.filter(isList)
    expect([...new URL(calls[0].url).searchParams.keys()].sort()).toEqual([
      'limit',
      'offset',
    ])
    expect(param(calls[0], 'limit')).toBe('10')
    expect(param(calls[0], 'offset')).toBe('0')
  })

  it("empty: 'No apps registered yet.'", async () => {
    const { client } = fakeApi(() => json(appsPage([])))
    const screen = await renderApps(client)
    await expect
      .element(screen.getByRole('cell', { name: 'No apps registered yet.' }))
      .toBeVisible()
  })

  it('error shows an alert and Retry refetches', async () => {
    let fail = true
    const { client, seen } = fakeApi(() =>
      fail ? apiError(500, 'internal_error') : json(appsPage())
    )
    const screen = await renderApps(client)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't load apps.")
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .toBeVisible()
    expect(seen.filter(isList)).toHaveLength(2)
  })

  it('403 shows the page ForbiddenPanel and no table', async () => {
    const { client } = fakeApi(() =>
      apiError(403, 'permission_denied', { required: 'admin:apps:read' })
    )
    const screen = await renderApps(client)
    await expect
      .element(screen.getByText('admin:apps:read', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByRole('table')).not.toBeInTheDocument()
  })

  it('403 on refetch replaces stale rows with the ForbiddenPanel', async () => {
    let forbid = false
    const { client } = fakeApi(() =>
      forbid ? apiError(403, 'permission_denied') : json(appsPage(APPS, 25))
    )
    const screen = await renderApps(client)
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .toBeVisible()
    forbid = true
    await userEvent.click(
      screen.getByRole('button', { name: 'Go to next page' })
    )
    await expect
      .element(screen.getByText("You don't have permission to do this"))
      .toBeVisible()
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .not.toBeInTheDocument()
  })

  it('next page sends offset=10 and writes page=2 to the URL', async () => {
    const { client, seen } = fakeApi(() => json(appsPage(APPS, 25)))
    const screen = await renderApps(client)
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Go to next page' })
    )
    await expect
      .element(screen.getByTestId('search'))
      .toHaveTextContent('"page":2')
    await expect
      .poll(() => seen.filter(isList).map((r) => param(r, 'offset')))
      .toContain('10')
  })

  it('clamps to page 1 (page leaves the URL) when the page comes back empty', async () => {
    const { client } = fakeApi((req) =>
      param(req, 'offset') === '20'
        ? json(appsPage([], 3, 10, 20))
        : json(appsPage())
    )
    const screen = await renderApps(client, { search: { page: 3 } })
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByTestId('search')).toHaveTextContent('{}')
  })

  it('no search box, facets or sort buttons', async () => {
    const { client } = fakeApi(() => json(appsPage()))
    const screen = await renderApps(client)
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByRole('textbox')).not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Join policy' }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('columnheader').getByRole('button'))
      .not.toBeInTheDocument()
  })

  it('no Members column', async () => {
    const { client } = fakeApi(() => json(appsPage()))
    const screen = await renderApps(client)
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('columnheader', { name: 'Members' }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('columnheader', { name: 'Origins' }))
      .toBeVisible()
  })

  it("live region announces '{total} apps, page 1 of n'", async () => {
    const { client } = fakeApi(() => json(appsPage(APPS, 25)))
    const screen = await renderApps(client)
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('25 apps, page 1 of 3')
  })

  it('read-only (admin:apps:read): Register app disabled with "Requires admin:apps:write", no row menu, View present; write: menu with Edit and Disable/Enable', async () => {
    const { client } = fakeApi(() => json(appsPage()))
    const readOnly = await renderApps(client, {
      granted: ['admin:apps:read'],
    })
    await expect
      .element(readOnly.getByRole('button', { name: 'Register app' }))
      .toBeDisabled()
    await expect
      .element(readOnly.getByText('Requires admin:apps:write'))
      .toBeVisible()
    await expect
      .element(readOnly.getByRole('button', { name: 'View stoktok' }))
      .toBeVisible()
    await expect
      .element(readOnly.getByRole('button', { name: /^Actions for/ }))
      .not.toBeInTheDocument()
    await readOnly.unmount()

    const writer = await renderApps(client, {
      granted: ['admin:apps:write'],
    })
    await expect
      .element(writer.getByRole('button', { name: 'Register app' }))
      .toBeEnabled()
    await userEvent.click(
      writer.getByRole('button', { name: 'Actions for calechip' })
    )
    await expect
      .element(writer.getByRole('menuitem', { name: 'Edit' }))
      .toBeVisible()
    await expect
      .element(writer.getByRole('menuitem', { name: 'Disable' }))
      .toBeVisible()
  })

  it('the Disable menu item has no text-red-500 class', async () => {
    const { client } = fakeApi(() => json(appsPage()))
    const screen = await renderApps(client)
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for calechip' })
    )
    const item = screen.getByRole('menuitem', { name: 'Disable' })
    await expect.element(item).toBeVisible()
    expect((item.element() as HTMLElement).className).not.toMatch(
      /text-red-500/
    )
  })
})
