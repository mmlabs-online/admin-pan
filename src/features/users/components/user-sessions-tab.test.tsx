import { QueryClientProvider } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { apiError, fakeApi, json, testQueryClient } from '@/test-utils/api'
import { WithPermissions } from '@/test-utils/permissions'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { formatDateTime } from '../data/data'
import { type User, type UserSession } from '../data/schema'
import { UserSessionsTab } from './user-sessions-tab'
import { UsersProvider } from './users-provider'

vi.mock('sonner', async (orig) => ({
  ...(await orig<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const ADA: User = {
  id: '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c01',
  email: 'ada@example.com',
  display_name: 'Ada Lovelace',
  status: 'active',
  email_verified_at: '2026-02-01T10:00:00Z',
  created_at: '2026-01-15T08:30:00Z',
  updated_at: '2026-02-01T10:00:00Z',
}
const IP = '203.0.113.7'
const IP6 = '2001:db8::1'
const UA = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0'

const sess = (n: number, over: Partial<UserSession> = {}): UserSession => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`,
  created_at: `2026-05-${String((n % 27) + 1).padStart(2, '0')}T10:00:00Z`,
  last_used_at: `2026-06-${String((n % 27) + 1).padStart(2, '0')}T11:00:00Z`,
  device_last_seen_at: `2026-07-${String((n % 27) + 1).padStart(2, '0')}T12:00:00Z`,
  ip: IP,
  user_agent: UA,
  ...over,
})
const many = (n: number) => Array.from({ length: n }, (_, i) => sess(i + 1))

const path = (r: Request) => new URL(r.url).pathname
const SESSIONS = `/api/v1/users/${ADA.id}/sessions`
const deletes = (seen: Request[]) => seen.filter((r) => r.method === 'DELETE')
const gets = (seen: Request[]) => seen.filter((r) => r.method === 'GET')
const noContent = () => new Response(null, { status: 204 })
const pageOf = (rows: UserSession[], r: Request) => {
  const q = new URL(r.url).searchParams
  const limit = Number(q.get('limit'))
  const offset = Number(q.get('offset'))
  return json({
    items: rows.slice(offset, offset + limit),
    total: rows.length,
    limit,
    offset,
  })
}

/** In-memory sessions server: GET paginates, DELETEs mutate `rows`. */
function server(
  rows: UserSession[],
  over?: (r: Request) => Response | undefined
) {
  return (r: Request): Response | Promise<Response> => {
    const custom = over?.(r)
    if (custom) return custom
    if (r.method === 'GET') return pageOf(rows, r)
    const id = path(r).split('/sessions/')[1]
    if (id === undefined) rows.length = 0
    else
      rows.splice(
        rows.findIndex((s) => s.id === id),
        1
      )
    return noContent()
  }
}

async function renderTab(
  client: ApiClient,
  opts: { granted?: Parameters<typeof WithPermissions>[0]['granted'] } = {}
) {
  const queryClient = testQueryClient()
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <WithPermissions granted={opts.granted ?? ['admin:*']}>
        <UsersProvider api={client}>
          <UserSessionsTab user={ADA} />
        </UsersProvider>
      </WithPermissions>
    </QueryClientProvider>
  )
  return { screen, queryClient }
}

const heading = () => page.getByRole('heading', { name: 'Active sessions' })
const dialog = () => page.getByRole('alertdialog')
const rowRevoke = (s: UserSession) =>
  page.getByRole('button', {
    name: `Revoke session created ${formatDateTime(s.created_at)}`,
  })
const focused = () => document.activeElement

describe('UserSessionsTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loading status while the list is pending', async () => {
    const { client } = fakeApi(() => new Promise<Response>(() => {}))
    await renderTab(client)
    await expect.element(page.getByText('Loading sessions…')).toBeVisible()
  })

  it("empty: 'No active sessions.' and Revoke all is aria-disabled", async () => {
    const { client, seen } = fakeApi(server([]))
    await renderTab(client)
    await expect.element(page.getByText('No active sessions.')).toBeVisible()
    const all = page.getByRole('button', { name: 'Revoke all' })
    await expect.element(all).toHaveAttribute('aria-disabled', 'true')
    // A real click on an aria-disabled button must do nothing.
    ;(all.element() as HTMLElement).click()
    expect(dialog().query()).toBeNull()
    expect(deletes(seen)).toHaveLength(0)
  })

  it("error: alert 'Couldn't load sessions.' with Retry; Retry refetches", async () => {
    let fail = true
    const { client } = fakeApi(
      server(many(1), () =>
        fail ? apiError(500, 'internal_error') : undefined
      )
    )
    await renderTab(client)
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent("Couldn't load sessions.")
    fail = false
    await userEvent.click(page.getByRole('button', { name: 'Retry' }))
    await expect.element(page.getByRole('table')).toBeVisible()
  })

  it("404: 'This user no longer exists.' and no Retry", async () => {
    const { client } = fakeApi(() => apiError(404, 'not_found'))
    await renderTab(client)
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('This user no longer exists.')
    expect(page.getByRole('button', { name: 'Retry' }).query()).toBeNull()
  })

  it('403 permission_denied: ForbiddenPanel, no table', async () => {
    const { client } = fakeApi(() => apiError(403, 'permission_denied'))
    await renderTab(client)
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
    expect(page.getByRole('table').query()).toBeNull()
  })

  it("403 self_session_change_forbidden (self id unknown): shows 'You can't manage your own sessions'", async () => {
    const { client } = fakeApi(() =>
      apiError(403, 'self_session_change_forbidden')
    )
    await renderTab(client)
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent("You can't manage your own sessions")
  })

  it("list: columns Created, Last sign-in, Browser last seen, First sign-in IP, First sign-in browser; null ip/ua show 'Not recorded'", async () => {
    const rows = [sess(1, { ip: IP6 }), sess(2, { ip: null, user_agent: null })]
    const { client, seen } = fakeApi(server(rows))
    await renderTab(client)
    const table = page.getByRole('table', { name: 'Active sessions' })
    for (const name of [
      'Created',
      'Last sign-in',
      'Browser last seen',
      'First sign-in IP',
      'First sign-in browser',
    ])
      await expect
        .element(table.getByRole('columnheader', { name }))
        .toBeVisible()
    await expect.element(table.getByText(IP6)).toBeVisible()
    await expect.element(table.getByText(UA)).toBeVisible()
    expect(table.getByText('Not recorded').elements()).toHaveLength(2)
    expect(table.getByRole('row').elements()).toHaveLength(3)
    await expect
      .element(table.getByText(formatDateTime(rows[0].device_last_seen_at)))
      .toBeVisible()
    expect(new URL(seen[0].url).search).toBe('?limit=20&offset=0')
  })

  it('user agent with HTML renders as literal text', async () => {
    const xss = '<img src=x onerror=alert(1)>'
    const { client } = fakeApi(server([sess(1, { user_agent: xss })]))
    await renderTab(client)
    await expect.element(page.getByText(xss)).toBeVisible()
    expect(page.getByRole('table').element().querySelector('img')).toBeNull()
  })

  it('user agent with U+202E is sanitized and isolated in <bdi>', async () => {
    const { client } = fakeApi(
      server([sess(1, { user_agent: 'Mozilla\u202Eevil' })])
    )
    await renderTab(client)
    const el = page.getByText('Mozillaevil')
    await expect.element(el).toBeVisible()
    expect(el.element().tagName).toBe('BDI')
    expect(el.element().textContent).not.toContain('\u202E')
  })

  it("revoke one: confirm names email and the session dates and states the 12-hour limit; Cancel sends no DELETE and focus returns to the row's Revoke button", async () => {
    const rows = many(2)
    const { client, seen } = fakeApi(server(rows))
    await renderTab(client)
    await expect.element(rowRevoke(rows[1])).toBeVisible()
    await userEvent.click(rowRevoke(rows[1]))
    await expect.element(dialog()).toBeVisible()
    await expect.element(dialog()).toHaveTextContent('ada@example.com')
    await expect
      .element(dialog())
      .toHaveTextContent(formatDateTime(rows[1].created_at))
    await expect
      .element(dialog())
      .toHaveTextContent(formatDateTime(rows[1].last_used_at))
    await expect.element(dialog()).toHaveTextContent('up to 12 hours')
    await expect.element(dialog()).toHaveTextContent('next admin request')
    await userEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog()).not.toBeInTheDocument()
    expect(deletes(seen)).toHaveLength(0)
    await expect.poll(focused).toBe(rowRevoke(rows[1]).element())
  })

  it("revoke one: Confirm sends one DELETE, refetches, toasts 'Session revoked.', focuses the 'Active sessions' heading", async () => {
    const rows = many(2)
    const first = rows[0]
    const { client, seen } = fakeApi(server(rows))
    await renderTab(client)
    await userEvent.click(rowRevoke(first))
    await userEvent.click(
      dialog().getByRole('button', { name: 'Revoke session' })
    )
    await expect.element(dialog()).not.toBeInTheDocument()
    expect(deletes(seen)).toHaveLength(1)
    expect(path(deletes(seen)[0])).toBe(`${SESSIONS}/${first.id}`)
    expect(toast.success).toHaveBeenCalledWith('Session revoked.')
    await expect.element(rowRevoke(first)).not.toBeInTheDocument()
    expect(gets(seen)).toHaveLength(2)
    await expect.poll(focused).toBe(heading().element())
  })

  it('revoke one: two synchronous clicks on Confirm send one DELETE', async () => {
    let release: (r: Response) => void = () => {}
    const rows = many(1)
    const { client, seen } = fakeApi(
      server(rows, (r) =>
        r.method === 'DELETE'
          ? (new Promise<Response>((res) => (release = res)) as never)
          : undefined
      )
    )
    await renderTab(client)
    await userEvent.click(rowRevoke(rows[0]))
    const confirm = dialog().getByRole('button', { name: 'Revoke session' })
    await expect.element(confirm).toBeVisible()
    const el = (await confirm.element()) as HTMLElement
    el.click()
    el.click()
    await expect.poll(() => deletes(seen).length).toBe(1)
    await new Promise((r) => setTimeout(r, 100))
    expect(deletes(seen)).toHaveLength(1)
    release(noContent())
    await expect.element(dialog()).not.toBeInTheDocument()
  })

  it("revoke one: pending -> confirm shows 'Revoking…', Escape does not close", async () => {
    const rows = many(1)
    const { client } = fakeApi(
      server(
        rows,
        (r) =>
          (r.method === 'DELETE'
            ? new Promise<Response>(() => {})
            : undefined) as never
      )
    )
    await renderTab(client)
    await userEvent.click(rowRevoke(rows[0]))
    await userEvent.click(
      dialog().getByRole('button', { name: 'Revoke session' })
    )
    await expect
      .element(dialog().getByRole('button', { name: 'Revoking…' }))
      .toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog()).toBeVisible()
  })

  it("revoke one: 404 closes the dialog, shows 'This session is no longer active…' in a status region, refetches the list, focuses the heading", async () => {
    const rows = many(2)
    const { client, seen } = fakeApi(
      server(rows, (r) => {
        if (r.method !== 'DELETE') return undefined
        rows.splice(0, 1)
        return apiError(404, 'not_found')
      })
    )
    await renderTab(client)
    await userEvent.click(rowRevoke(rows[0]))
    await userEvent.click(
      dialog().getByRole('button', { name: 'Revoke session' })
    )
    await expect.element(dialog()).not.toBeInTheDocument()
    await expect
      .element(page.getByRole('status').getByText(/no longer active/))
      .toBeVisible()
    await expect.poll(() => gets(seen).length).toBe(2)
    await expect.poll(focused).toBe(heading().element())
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('revoke one: 403 permission_denied and 403 self_session_change_forbidden show inline in the dialog', async () => {
    const rows = many(1)
    let code = 'permission_denied'
    const { client } = fakeApi(
      server(rows, (r) =>
        r.method === 'DELETE' ? apiError(403, code) : undefined
      )
    )
    await renderTab(client)
    await userEvent.click(rowRevoke(rows[0]))
    await userEvent.click(
      dialog().getByRole('button', { name: 'Revoke session' })
    )
    await expect
      .element(dialog().getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
    code = 'self_session_change_forbidden'
    await userEvent.click(
      dialog().getByRole('button', { name: 'Revoke session' })
    )
    await expect
      .element(dialog().getByRole('alert'))
      .toHaveTextContent("You can't manage your own sessions")
  })

  it('revoke one: 500 shows the unknown-outcome copy and refetches the list', async () => {
    const rows = many(1)
    const { client, seen } = fakeApi(
      server(rows, (r) =>
        r.method === 'DELETE' ? apiError(500, 'internal_error') : undefined
      )
    )
    await renderTab(client)
    await userEvent.click(rowRevoke(rows[0]))
    await userEvent.click(
      dialog().getByRole('button', { name: 'Revoke session' })
    )
    await expect
      .element(dialog().getByRole('alert'))
      .toHaveTextContent("We couldn't confirm the revoke.")
    await expect.poll(() => gets(seen).length).toBe(2)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('revoke all: confirm names the email, says every browser and the 12-hour limit; Cancel sends no DELETE and focus returns to Revoke all; Confirm sends one DELETE …/sessions, returns to offset 0, focuses the heading', async () => {
    const rows = many(25)
    const { client, seen } = fakeApi(server(rows))
    await renderTab(client)
    const all = page.getByRole('button', { name: 'Revoke all' })
    await expect.element(rowRevoke(rows[0])).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Next' }))
    await expect.element(page.getByText('Showing 21–25 of 25')).toBeVisible()
    await userEvent.click(all)
    await expect.element(dialog()).toHaveTextContent('ada@example.com')
    await expect.element(dialog()).toHaveTextContent('every browser')
    await expect.element(dialog()).toHaveTextContent('up to 12 hours')
    await expect.element(dialog()).toHaveTextContent('next admin request')
    await userEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog()).not.toBeInTheDocument()
    expect(deletes(seen)).toHaveLength(0)
    await expect.poll(focused).toBe(all.element())
    await userEvent.click(all)
    await userEvent.click(
      dialog().getByRole('button', { name: 'Revoke all sessions' })
    )
    await expect.element(dialog()).not.toBeInTheDocument()
    expect(deletes(seen)).toHaveLength(1)
    expect(path(deletes(seen)[0])).toBe(SESSIONS)
    expect(toast.success).toHaveBeenCalledWith('All sessions revoked.')
    await expect.element(page.getByText('No active sessions.')).toBeVisible()
    await expect.poll(focused).toBe(heading().element())
    expect(
      new URL(gets(seen)[gets(seen).length - 1].url).searchParams.get('offset')
    ).toBe('0')
  })

  it("pager: total 25 shows 'Showing 1–20 of 25'; Next keeps the table and pager mounted with focus on Next while page 2 loads, row Revoke buttons aria-disabled during the placeholder", async () => {
    const rows = many(25)
    let release: (() => void) | null = null
    const { client } = fakeApi((r) => {
      if (new URL(r.url).searchParams.get('offset') === '20')
        return new Promise<Response>((res) => {
          release = () => res(pageOf(rows, r))
        })
      return pageOf(rows, r)
    })
    await renderTab(client)
    await expect.element(page.getByText('Showing 1–20 of 25')).toBeVisible()
    const next = page.getByRole('button', { name: 'Next' })
    await userEvent.click(next)
    await expect.poll(() => release).not.toBeNull()
    expect(page.getByRole('table').query()).not.toBeNull()
    expect(page.getByText('Showing 21–25 of 25').query()).not.toBeNull()
    expect(focused()).toBe(next.element())
    await expect
      .element(rowRevoke(rows[0]))
      .toHaveAttribute('aria-disabled', 'true')
    release!()
    await expect.element(page.getByText('Showing 21–25 of 25')).toBeVisible()
    await expect
      .element(rowRevoke(rows[20]))
      .not.toHaveAttribute('aria-disabled', 'true')
  })

  it('page clamp: revoking the only row on page 2 (total 21 -> 20) requests offset 0', async () => {
    const rows = many(21)
    const { client, seen } = fakeApi(server(rows))
    await renderTab(client)
    await userEvent.click(page.getByRole('button', { name: 'Next' }))
    await expect.element(rowRevoke(rows[20])).toBeVisible()
    await userEvent.click(rowRevoke(rows[20]))
    await userEvent.click(
      dialog().getByRole('button', { name: 'Revoke session' })
    )
    await expect.element(rowRevoke(rows[0])).toBeVisible()
    expect(
      gets(seen).map((r) => new URL(r.url).searchParams.get('offset'))
    ).toEqual(['0', '20', '20', '0'])
  })

  it('page clamp: empty page with total 21 at offset 20 shows the empty row and makes no further request', async () => {
    const rows = many(21)
    const { client, seen } = fakeApi((r) =>
      new URL(r.url).searchParams.get('offset') === '20'
        ? json({ items: [], total: 21, limit: 20, offset: 20 })
        : pageOf(rows, r)
    )
    await renderTab(client)
    await userEvent.click(page.getByRole('button', { name: 'Next' }))
    await expect.element(page.getByText('No active sessions.')).toBeVisible()
    const count = seen.length
    await new Promise((r) => setTimeout(r, 300))
    expect(seen).toHaveLength(count)
  })

  it('no IP, user agent or session id in query keys, request URLs, toasts or status regions', async () => {
    const rows = many(2)
    const ids = rows.map((r) => r.id)
    const { client, seen } = fakeApi(server(rows))
    const { queryClient } = await renderTab(client)
    await expect.element(page.getByText(IP).first()).toBeVisible()
    await userEvent.click(rowRevoke(rows[0]))
    await userEvent.click(
      dialog().getByRole('button', { name: 'Revoke session' })
    )
    await expect.element(dialog()).not.toBeInTheDocument()
    const keys = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey)
    )
    const urls = seen.map((r) => r.url).join('\n')
    const live = [...document.querySelectorAll('[role=status], [aria-live]')]
      .map((e) => e.textContent)
      .join('\n')
    const toasts = JSON.stringify(vi.mocked(toast.success).mock.calls)
    for (const secret of [IP, 'Mozilla', 'Firefox']) {
      for (const where of [keys, urls, live, toasts])
        expect(where).not.toContain(secret)
    }
    for (const id of ids)
      for (const where of [keys, live, toasts]) expect(where).not.toContain(id)
    expect(urls).not.toContain(ids[1])
  })

  it("unmount mid-request: 'Session revoked.' still fires exactly once", async () => {
    let release: (r: Response) => void = () => {}
    const rows = many(2)
    const inner = server(rows)
    const { client, seen } = fakeApi((r) =>
      r.method === 'DELETE'
        ? new Promise<Response>(
            (res) => (release = () => res(inner(r) as Response))
          )
        : inner(r)
    )
    const { screen } = await renderTab(client)
    await userEvent.click(rowRevoke(rows[0]))
    await userEvent.click(
      dialog().getByRole('button', { name: 'Revoke session' })
    )
    await expect.poll(() => deletes(seen)).toHaveLength(1)
    await screen.unmount()
    release(noContent())
    await expect
      .poll(() => vi.mocked(toast.success))
      .toHaveBeenCalledWith('Session revoked.')
    expect(toast.success).toHaveBeenCalledTimes(1)
  })
})
