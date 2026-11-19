import { act } from 'react'
import { apiError, fakeApi, json } from '@/test-utils/api'
import { describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { SEARCH_DEBOUNCE_MS } from '@/lib/list-search'
import { type App } from '../data/app-schema'
import { APPS, appsPage } from './test-data'
import { isList, renderApps } from './test-fixtures'

const param = (r: Request, k: string) => new URL(r.url).searchParams.get(k)

/**
 * Runs `step` with only setTimeout/clearTimeout faked, then lets one search
 * debounce elapse. A negative ("nothing is sent") needs a bounded window, and a
 * later real input would restart the debounce, so the window is virtual.
 */
const throughDebounce = async (step: () => Promise<void>) => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    await step()
    // act: flush the commit the debounce triggers before the faked clock ends.
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS))
  } finally {
    vi.useRealTimers()
  }
}
const withParam = (seen: Request[], k: string) =>
  seen.filter(isList).filter((r) => param(r, k) !== null)
const last = (seen: Request[]) => seen.filter(isList).slice(-1)[0]

/** A list endpoint that really filters APPS. */
const filtering = (req: Request) => {
  const q = param(req, 'q')?.toLowerCase()
  const items: App[] = APPS.filter(
    (a) =>
      (!param(req, 'status') || a.status === param(req, 'status')) &&
      (!param(req, 'join_policy') ||
        a.join_policy === param(req, 'join_policy')) &&
      (!param(req, 'org_mode') || a.org_mode === param(req, 'org_mode')) &&
      (!q || a.key.includes(q) || a.name.toLowerCase().includes(q))
  )
  return json(appsPage(items))
}

const choose = async (
  screen: Awaited<ReturnType<typeof renderApps>>,
  select: string,
  option: string
) => {
  await userEvent.click(screen.getByRole('combobox', { name: select }))
  await userEvent.click(screen.getByRole('option', { name: option }))
}

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

  it('each filter sends its own param; All removes it', async () => {
    const { client, seen } = fakeApi(filtering)
    const screen = await renderApps(client)
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .toBeVisible()
    for (const [select, option, key, value] of [
      ['Status', 'Disabled', 'status', 'disabled'],
      ['Join policy', 'Approval', 'join_policy', 'approval'],
      ['Org mode', 'Required', 'org_mode', 'required'],
    ] as const) {
      await choose(screen, select, option)
      await expect.poll(() => param(last(seen), key)).toBe(value)
      await expect
        .element(screen.getByTestId('search'))
        .toHaveTextContent(`"${key}":"${value}"`)
    }
    const url = new URL(last(seen).url).searchParams
    expect(url.get('status')).toBe('disabled')
    expect(url.get('join_policy')).toBe('approval')
    expect(url.get('org_mode')).toBe('required')
    await choose(screen, 'Join policy', 'All policies')
    await expect.poll(() => param(last(seen), 'join_policy')).toBeNull()
    expect(param(last(seen), 'org_mode')).toBe('required')
  })

  it('search sends trimmed q after one debounce; whitespace sends none', async () => {
    const { client, seen } = fakeApi(filtering)
    const screen = await renderApps(client)
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .toBeVisible()
    const box = screen.getByRole('searchbox', { name: 'Search apps' })
    await throughDebounce(() => userEvent.type(box, '   '))
    expect(withParam(seen, 'q')).toHaveLength(0)
    expect(seen.filter(isList)).toHaveLength(1)
    // Sentinel: a real request proves the whitespace one never went out first.
    await userEvent.fill(box, '  stok  ')
    await expect
      .poll(() => withParam(seen, 'q').map((r) => param(r, 'q')))
      .toEqual(['stok'])
    expect(seen.filter(isList)).toHaveLength(2)
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('1 apps match these filters, page 1 of 1')
    // Sentinel for "exactly one request for the term": the next request is the
    // sort click, so any extra search request would show up before it.
    await userEvent.click(
      screen.getByRole('button', { name: 'Name', exact: true })
    )
    await expect.poll(() => param(last(seen), 'sort')).toBe('name')
    expect(withParam(seen, 'q').map((r) => param(r, 'q'))).toEqual([
      'stok',
      'stok',
    ])
    expect(seen.filter(isList)).toHaveLength(3)
  })

  it('sort headers: default Key ascending (aria-sort, no URL sort); Key -> -key -> default; Name; Created; others not sortable', async () => {
    const { client, seen } = fakeApi(filtering)
    const screen = await renderApps(client)
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .toBeVisible()
    const th = (name: string) => screen.getByRole('columnheader', { name })
    await expect.element(th('Key')).toHaveAttribute('aria-sort', 'ascending')
    await expect.element(th('Name')).toHaveAttribute('aria-sort', 'none')
    await expect.element(th('Created')).toHaveAttribute('aria-sort', 'none')
    for (const name of ['Status', 'Join policy', 'Org mode', 'Origins'])
      await expect.element(th(name)).not.toHaveAttribute('aria-sort')
    expect(param(last(seen), 'sort')).toBeNull()

    const key = screen.getByRole('button', { name: 'Key', exact: true })
    await userEvent.click(key)
    await expect.element(th('Key')).toHaveAttribute('aria-sort', 'descending')
    await expect.poll(() => param(last(seen), 'sort')).toBe('-key')
    await userEvent.click(key)
    await expect.element(th('Key')).toHaveAttribute('aria-sort', 'ascending')
    await expect.poll(() => param(last(seen), 'sort')).toBeNull()
    await expect
      .element(screen.getByTestId('search'))
      .not.toHaveTextContent('"sort"')

    await userEvent.click(
      screen.getByRole('button', { name: 'Name', exact: true })
    )
    await expect.poll(() => param(last(seen), 'sort')).toBe('name')
    await userEvent.click(
      screen.getByRole('button', { name: 'Created', exact: true })
    )
    await expect.poll(() => param(last(seen), 'sort')).toBe('created_at')
    await expect
      .element(screen.getByRole('cell', { name: 'Jan 5, 2026' }).first())
      .toBeVisible()
  })

  it('URL round-trip and back/forward; every control resets the page', async () => {
    const { client, seen } = fakeApi(filtering)
    const screen = await renderApps(client, {
      search: {
        q: 'o',
        status: 'active',
        join_policy: 'open',
        org_mode: 'required',
        sort: '-name',
        page: 3,
      },
      back: {},
    })
    await expect.poll(() => seen.filter(isList).length).toBeGreaterThan(0)
    const first = new URL(seen.filter(isList)[0].url).searchParams
    expect(Object.fromEntries(first)).toEqual({
      q: 'o',
      status: 'active',
      join_policy: 'open',
      org_mode: 'required',
      sort: '-name',
      limit: '10',
      offset: '20',
    })
    const input = screen.getByRole('searchbox', { name: 'Search apps' })
    await expect.element(input).toHaveValue('o')
    await expect
      .element(screen.getByRole('combobox', { name: 'Join policy' }))
      .toHaveTextContent('Open')
    await throughDebounce(() =>
      userEvent.click(screen.getByRole('button', { name: 'Simulate back' }))
    )
    await expect.element(input).toHaveValue('')
    await expect
      .element(screen.getByRole('combobox', { name: 'Org mode' }))
      .toHaveTextContent('All modes')
    await expect.element(screen.getByTestId('search')).toHaveTextContent('{}')
    await expect.poll(() => param(last(seen), 'q')).toBeNull()
    // Sentinel: after a full debounce the old draft was not written back.
    const afterBack = seen.filter(isList).length
    await userEvent.click(
      screen.getByRole('button', { name: 'Name', exact: true })
    )
    await expect.poll(() => param(last(seen), 'sort')).toBe('name')
    expect(
      seen
        .filter(isList)
        .slice(afterBack - 1)
        .filter((r) => param(r, 'q') !== null)
    ).toHaveLength(0)
    await expect.element(input).toHaveValue('')
  })

  it('page resets on q / each select / sort', async () => {
    const { client, seen } = fakeApi(() => json(appsPage(APPS, 25)))
    const screen = await renderApps(client, { search: { page: 2 } })
    const search = screen.getByTestId('search')
    await expect.poll(() => param(last(seen), 'offset')).toBe('10')
    const next = () =>
      userEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    const resetsPage = async () => {
      await expect.element(search).not.toHaveTextContent('"page"')
      await expect.poll(() => param(last(seen), 'offset')).toBe('0')
      await next()
      await expect.element(search).toHaveTextContent('"page":2')
    }
    await userEvent.click(
      screen.getByRole('button', { name: 'Name', exact: true })
    )
    await resetsPage()
    await choose(screen, 'Status', 'Active')
    await resetsPage()
    await choose(screen, 'Join policy', 'Open')
    await resetsPage()
    await choose(screen, 'Org mode', 'None')
    await resetsPage()
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search apps' }),
      'x'
    )
    await expect.element(search).toHaveTextContent('"q":"x"')
    await expect.element(search).not.toHaveTextContent('"page"')
    await expect.poll(() => param(last(seen), 'offset')).toBe('0')
  })

  it('filtered empty, Reset filters, 422 fixed alert, 403 after a filter change', async () => {
    const { client } = fakeApi((req) => {
      if (param(req, 'org_mode') === 'required')
        return apiError(422, 'validation_error')
      if (param(req, 'org_mode') === 'none')
        return apiError(403, 'permission_denied', {
          required: 'admin:apps:read',
        })
      return param(req, 'q') ? json(appsPage([])) : json(appsPage())
    })
    const screen = await renderApps(client, { search: { q: 'zzz' } })
    await expect
      .element(
        screen.getByRole('cell', { name: 'No apps match these filters.' })
      )
      .toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .toBeVisible()

    await choose(screen, 'Org mode', 'Required')
    const alert = screen.getByRole('alert')
    await expect
      .element(alert)
      .toHaveTextContent("The search or filters weren't accepted.")
    await expect.element(alert).not.toHaveTextContent('server text')
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .toBeVisible()

    await choose(screen, 'Org mode', 'None')
    await expect
      .element(screen.getByText('admin:apps:read', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByRole('table')).not.toBeInTheDocument()
  })

  it('Reset filters moves focus to the search input', async () => {
    const { client } = fakeApi(() => json(appsPage()))
    const screen = await renderApps(client, {
      search: { q: 'ad', org_mode: 'none' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    await expect.element(screen.getByLabelText('Search apps')).toHaveFocus()
  })

  it('422 marks the search input invalid and links the message', async () => {
    const { client } = fakeApi((req) =>
      param(req, 'org_mode') === 'required'
        ? apiError(422, 'validation_error')
        : json(appsPage())
    )
    const screen = await renderApps(client)
    const input = screen.getByLabelText('Search apps')
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .toBeVisible()
    await expect.element(input).not.toHaveAttribute('aria-invalid')
    await expect.element(input).not.toHaveAttribute('aria-describedby')
    await choose(screen, 'Org mode', 'Required')
    const alert = screen.getByRole('alert')
    await expect
      .element(alert)
      .toHaveTextContent(/Shorten or change the search/)
    // A rejected filter with an empty search does not blame the search box.
    await expect.element(input).not.toHaveAttribute('aria-invalid')
    await userEvent.type(input, 'acme')
    await expect.element(input).toHaveAttribute('aria-invalid', 'true')
    await expect
      .element(input)
      .toHaveAttribute('aria-describedby', alert.element().id)
  })

  it('aria-busy stays false during a background refetch', async () => {
    let calls = 0
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const { client } = fakeApi(async () => {
      calls += 1
      if (calls === 2) await gate
      return json(appsPage())
    })
    const screen = await renderApps(client)
    const table = screen.getByRole('table', { name: 'Apps' })
    await expect
      .element(screen.getByText('Admin console', { exact: true }))
      .toBeVisible()
    await expect.element(table).toHaveAttribute('aria-busy', 'false')
    window.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(calls).toBe(2))
    await expect.element(table).toHaveAttribute('aria-busy', 'false')
    release()
  })

  it('controls have accessible names and sit in a search landmark; no Reset when nothing is set', async () => {
    const { client } = fakeApi(() => json(appsPage()))
    const screen = await renderApps(client)
    const landmark = screen.getByRole('search', { name: 'Filter apps' })
    await expect
      .element(landmark.getByRole('searchbox', { name: 'Search apps' }))
      .toBeVisible()
    for (const name of ['Status', 'Join policy', 'Org mode'])
      await expect
        .element(landmark.getByRole('combobox', { name }))
        .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Reset filters' }))
      .not.toBeInTheDocument()
  })
})
