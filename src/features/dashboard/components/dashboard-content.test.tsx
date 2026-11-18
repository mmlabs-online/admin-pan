import { QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { type ApiClient } from '@/api'
import { apiError, fakeApi, json, testQueryClient } from '@/test-utils/api'
import { WithPermissions } from '@/test-utils/permissions'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { type AdminPermission } from '@/lib/permissions/registry'
import { type DashboardStats } from '../api/queries'
import { DashboardContent } from './dashboard-content'
import { STATS, withStats, zeroStats } from './test-data'

const mount = async (
  client: ApiClient,
  granted: AdminPermission[] = ['admin:stats:read', 'admin:audit:read']
) => {
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/',
        component: () => <DashboardContent api={client} />,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/audit-log',
        component: () => null,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <WithPermissions granted={granted}>
        <RouterProvider router={router} />
      </WithPermissions>
    </QueryClientProvider>
  )
}

const ok = (s: DashboardStats = STATS) => fakeApi(() => json(s))
const rowsOf = (caption: string) =>
  Array.from(
    Array.from(document.querySelectorAll('table'))
      .find((t) =>
        t.querySelector('caption')?.textContent?.startsWith(caption)
      )!
      .querySelectorAll('tbody tr')
  ).map((r) => r.textContent)

describe('DashboardContent states', () => {
  it('pending: role=status "Loading dashboard…", region aria-busy, no KPI numbers', async () => {
    const { client } = fakeApi(() => new Promise<Response>(() => {}))
    const screen = await mount(client)
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Loading dashboard…')
    await expect
      .element(screen.getByRole('region', { name: 'Dashboard statistics' }))
      .toHaveAttribute('aria-busy', 'true')
    expect(document.body.textContent).not.toContain('1,284')
  })

  it('success: one GET; KPI values and sub-lines; Updated time; no trend, Activity tab or recent activity', async () => {
    const { client, seen } = ok()
    const screen = await mount(client)
    await expect.element(screen.getByText('1,284')).toBeVisible()
    expect(seen).toHaveLength(1)
    expect(new URL(seen[0].url).pathname).toBe('/api/v1/stats/dashboard')
    for (const t of [
      '1,200 active · 84 disabled',
      '4 suspended · 61 total',
      '8 active · 1 disabled',
      '19 failed',
      '342',
      '57',
    ])
      await expect
        .element(screen.getByText(t, { exact: true }).first())
        .toBeVisible()
    const time = document.querySelector('time')!
    expect(time.getAttribute('datetime')).toBe(STATS.generated_at)
    expect(document.body.textContent).toContain('Updated')
    expect(document.body.textContent).not.toContain('vs last month')
    expect(document.body.textContent).not.toContain('Recent admin activity')
    expect(
      document.querySelector('[role=tab]') ??
        document.querySelector('[role=tablist]')
    ).toBeNull()
  })

  it('sign-ups: table caption names the fixture time zone; 12 rows; last is partial; card names the partial month', async () => {
    const { client } = ok()
    const screen = await mount(client)
    await expect.element(screen.getByText('1,284')).toBeVisible()
    await userEvent.click(screen.getByText('Show data as table').first())
    const table = screen.getByRole('table', {
      name: 'New accounts per month (Etc/UTC); the last month is partial',
    })
    await expect.element(table).toBeVisible()
    const heads = Array.from(
      table.element().querySelectorAll('th[scope=col]')
    ).map((h) => h.textContent)
    expect(heads).toEqual(['Month', 'New accounts'])
    const rows = rowsOf('New accounts per month')
    expect(rows).toHaveLength(12)
    expect(rows[11]).toBe('Nov 2026 (partial)177')
    expect(rows[0]).toBe('Dec 2025100')
    expect(document.body.textContent).toContain(
      'Nov 2026 is partial (month so far).'
    )
  })

  it('members per app: a row per entry including admin; caption says admin and disabled apps are included', async () => {
    const { client } = ok()
    const screen = await mount(client)
    await expect.element(screen.getByText('1,284')).toBeVisible()
    await userEvent.click(screen.getByText('Show data as table').nth(1))
    await expect
      .element(
        screen.getByRole('table', {
          name: /Includes the admin app and disabled apps\./,
        })
      )
      .toBeVisible()
    expect(rowsOf('Distinct active users')).toEqual([
      'Adminadmin5',
      'Stoktokstoktok21',
      'Legacy applegacy3',
    ])
  })

  it('attention: counts from the API; failed sign-ins is a link with audit:read; unverified and suspended are never links', async () => {
    const { client } = ok()
    const screen = await mount(client)
    const link = screen.getByRole('link', {
      name: /Failed sign-ins \(last 24 h\)/,
    })
    await expect.element(link).toBeVisible()
    await expect.element(link).toHaveTextContent('19')
    const href = link.element().getAttribute('href')!
    expect(href).toContain('/audit-log')
    expect(href).toContain('action=auth.login_failed')
    expect(screen.getByRole('link').elements()).toHaveLength(1)
    await expect
      .element(
        screen.getByText(
          'Users with unverified email (includes disabled users)'
        )
      )
      .toBeVisible()
    await expect.element(screen.getByText('37', { exact: true })).toBeVisible()
    await expect
      .element(screen.getByText('Suspended organizations'))
      .toBeVisible()
  })

  it('attention: with only admin:stats:read the failed sign-ins row is plain text with the count', async () => {
    const { client } = ok()
    const screen = await mount(client, ['admin:stats:read'])
    await expect.element(screen.getByText('1,284')).toBeVisible()
    await expect
      .element(screen.getByText('Failed sign-ins (last 24 h)'))
      .toBeVisible()
    expect(screen.getByRole('link').elements()).toHaveLength(0)
    await expect
      .element(screen.getByText('19', { exact: true }).first())
      .toBeVisible()
  })

  it('zero-filled document: KPIs and attention show 0, tables show zero counts', async () => {
    const { client } = ok(zeroStats())
    const screen = await mount(client)
    await expect
      .element(screen.getByText('Users', { exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByText('0 active · 0 disabled').first())
      .toBeVisible()
    const big = Array.from(document.querySelectorAll('.text-2xl')).map(
      (e) => e.textContent
    )
    expect(big).toEqual(['0', '0', '0', '0'])
    const list = document.querySelector('ul.divide-y')!
    expect(
      Array.from(list.querySelectorAll('li')).map((l) => l.textContent)
    ).toEqual([
      'Users with unverified email (includes disabled users)0',
      'Suspended organizations0',
      'Failed sign-ins (last 24 h)0, open in the audit log',
    ])
    expect(rowsOf('New accounts per month')).toHaveLength(12)
    expect(rowsOf('Distinct active users')[0]).toBe('Adminadmin0')
  })

  it('empty members_per_app and by_month show their empty copy', async () => {
    const { client } = ok(
      withStats({
        members_per_app: [],
        sign_ups: { time_zone: 'Etc/UTC', by_month: [] },
      })
    )
    const screen = await mount(client)
    await expect.element(screen.getByText('No apps yet.')).toBeVisible()
    await expect.element(screen.getByText('No sign-up data.')).toBeVisible()
    expect(document.body.textContent).not.toContain('is partial (month so far)')
  })

  it('403: ForbiddenPanel names admin:stats:read; Try again sends a second GET; no KPIs', async () => {
    const { client, seen } = fakeApi(() =>
      apiError(403, 'permission_denied', { required: 'admin:stats:read' })
    )
    const screen = await mount(client)
    await expect
      .element(screen.getByText('admin:stats:read', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByText(/Required permission:/)).toBeVisible()
    expect(document.body.textContent).not.toContain('Active organizations')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await vi.waitFor(() => expect(seen).toHaveLength(2))
  })

  it('500: alert with Retry; Retry sends a second GET and then shows the KPIs', async () => {
    let fail = true
    const { client, seen } = fakeApi(() =>
      fail ? apiError(500, 'internal_error') : json(STATS)
    )
    const screen = await mount(client)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't load the dashboard.")
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect.element(screen.getByText('1,284')).toBeVisible()
    expect(seen).toHaveLength(2)
  })

  it('a refetch error after success hides the stale numbers', async () => {
    let fail = false
    const { client } = fakeApi(() =>
      fail ? apiError(500, 'internal_error') : json(STATS)
    )
    const screen = await mount(client)
    await expect.element(screen.getByText('1,284')).toBeVisible()
    fail = true
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't load the dashboard.")
    await expect.element(screen.getByText('1,284')).not.toBeInTheDocument()
  })

  it('Refresh: one more GET; aria-disabled with "Refreshing…" announced; a second click sends no extra request', async () => {
    let hang = false
    const { client, seen } = fakeApi(() =>
      hang ? new Promise<Response>(() => {}) : json(STATS)
    )
    const screen = await mount(client)
    await expect.element(screen.getByText('1,284')).toBeVisible()
    hang = true
    const button = screen.getByRole('button', { name: 'Refresh' })
    await userEvent.click(button)
    await expect
      .element(screen.getByRole('button', { name: 'Refreshing…' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Refreshing…')
    // Playwright refuses to click an aria-disabled button; a DOM click is what a
    // keyboard or assistive-tech activation would send.
    const busy = screen.getByRole('button', { name: 'Refreshing…' })
    await expect.element(busy).toBeInTheDocument()
    ;(busy.element() as HTMLElement).click()
    expect(seen).toHaveLength(2)
  })
})
