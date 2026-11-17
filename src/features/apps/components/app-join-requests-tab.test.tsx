import { apiError, fakeApi, json, testQueryClient } from '@/test-utils/api'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { appsKeys } from '../api/queries'
import { JOIN_REQUESTS, SELF_USER_ID, joinRequestsPage } from './test-data'
import { appsServer, renderApps } from './test-fixtures'

const noop = () => {}
const path = (r: Request) => new URL(r.url).pathname
const listCalls = (seen: Request[], key: string) =>
  seen.filter(
    (r) => r.method === 'GET' && path(r) === `/api/v1/apps/${key}/join-requests`
  )
type Screen = Awaited<ReturnType<typeof renderApps>>

async function openTab(screen: Screen, key: string) {
  await userEvent.click(screen.getByRole('button', { name: `View ${key}` }))
  const sheet = screen.getByRole('dialog')
  await userEvent.click(sheet.getByRole('tab', { name: 'Join requests' }))
  return sheet
}

/** Server whose join-request list comes from `list()`. */
function server(
  list?: (req: Request) => Response | Promise<Response>,
  write: (req: Request) => Response | Promise<Response> = () => json({})
) {
  const base = appsServer(write)
  return (req: Request) =>
    list && req.method === 'GET' && /\/join-requests$/.test(path(req))
      ? list(req)
      : base(req)
}

describe('AppJoinRequestsTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches GET …/join-requests?status=pending&limit=20&offset=0 only after the tab is selected', async () => {
    const { client, seen } = fakeApi(server())
    const screen = await renderApps(client)
    await userEvent.click(screen.getByRole('button', { name: 'View stoktok' }))
    const sheet = screen.getByRole('dialog')
    await expect
      .element(sheet.getByRole('tab', { name: 'Overview' }))
      .toBeVisible()
    expect(listCalls(seen, 'stoktok')).toHaveLength(0)
    await userEvent.click(sheet.getByRole('tab', { name: 'Join requests' }))
    await expect.poll(() => listCalls(seen, 'stoktok').length).toBe(1)
    expect(new URL(listCalls(seen, 'stoktok')[0].url).search).toBe(
      '?status=pending&limit=20&offset=0'
    )
  })

  it('loading / empty per filter / error + Retry / 403 inline', async () => {
    let c = fakeApi(server(() => new Promise<Response>(noop)))
    let screen = await renderApps(c.client)
    let sheet = await openTab(screen, 'stoktok')
    await expect
      .element(sheet.getByText('Loading join requests…'))
      .toBeVisible()
    await screen.unmount()

    c = fakeApi(server(() => json(joinRequestsPage([]))))
    screen = await renderApps(c.client)
    sheet = await openTab(screen, 'calechip')
    await expect
      .element(sheet.getByText('No pending join requests.'))
      .toBeVisible()
    await userEvent.click(sheet.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Approved' }))
    await expect
      .element(sheet.getByText('No approved join requests.'))
      .toBeVisible()
    await screen.unmount()

    let fail = true
    c = fakeApi(
      server(() =>
        fail
          ? apiError(500, 'internal_error')
          : json(joinRequestsPage(JOIN_REQUESTS))
      )
    )
    screen = await renderApps(c.client)
    sheet = await openTab(screen, 'stoktok')
    await expect
      .element(sheet.getByRole('alert'))
      .toHaveTextContent("Couldn't load join requests.")
    fail = false
    await userEvent.click(sheet.getByRole('button', { name: 'Retry' }))
    await expect.element(sheet.getByText('Ada Lovelace')).toBeVisible()
    await screen.unmount()

    c = fakeApi(server(() => apiError(403, 'permission_denied')))
    screen = await renderApps(c.client)
    sheet = await openTab(screen, 'stoktok')
    await expect
      .element(sheet.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
  })

  it('rows: name over email, email only when no name, <time>, status, badges, (you)', async () => {
    const { client } = fakeApi(server())
    const screen = await renderApps(client, {
      granted: ['admin:apps:read', 'admin:users:read', 'admin:roles:assign'],
      userId: JOIN_REQUESTS[1].user_id,
    })
    const sheet = await openTab(screen, 'stoktok')
    const table = sheet.getByRole('table', { name: 'Join requests of stoktok' })
    await expect.element(table.getByText('Ada Lovelace')).toBeVisible()
    await expect.element(table.getByText('ada@people.test')).toBeVisible()
    await expect
      .element(table.getByText('person2@people.test (you)'))
      .toBeVisible()
    await expect.element(table.getByText('person3@people.test')).toBeVisible()
    await expect.element(table.getByText('Email not verified')).toBeVisible()
    await expect.element(table.getByText('Account disabled')).toBeVisible()
    expect(table.getByText('Pending').elements()).toHaveLength(3)
    expect(table.getByText('1 May 2026').elements()).toHaveLength(3)
    expect(sheet.getByText('1 May 2026').first().element().tagName).toBe('TIME')
  })

  it('a display_name that looks like HTML renders as literal text', async () => {
    const xss = '<img src=x onerror=alert(1)>'
    const { client } = fakeApi(
      server(() =>
        json(joinRequestsPage([{ ...JOIN_REQUESTS[0], display_name: xss }]))
      )
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'stoktok')
    await expect.element(sheet.getByText(xss)).toBeVisible()
    expect(sheet.element().querySelector('img')).toBeNull()
  })

  it('status filter: Approved sends status=approved&offset=0 from page 2; Decided column with (by you); no actions on decided rows', async () => {
    const decided = {
      ...JOIN_REQUESTS[0],
      status: 'approved',
      decided_at: '2026-05-02T10:00:00.000Z',
      decided_by: SELF_USER_ID,
    }
    const { client, seen } = fakeApi(
      server((req) => {
        const q = new URL(req.url).searchParams
        return q.get('status') === 'approved'
          ? json(joinRequestsPage([decided], 1, 20, 0))
          : json(
              joinRequestsPage(JOIN_REQUESTS, 25, 20, Number(q.get('offset')))
            )
      })
    )
    const screen = await renderApps(client, { userId: SELF_USER_ID })
    const sheet = await openTab(screen, 'stoktok')
    await userEvent.click(sheet.getByRole('button', { name: 'Next' }))
    await expect.poll(() => listCalls(seen, 'stoktok').length).toBe(2)
    await userEvent.click(sheet.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Approved' }))
    await expect.element(sheet.getByText(/\(by you\)/)).toBeVisible()
    await expect.element(sheet.getByText(/2 May 2026 \(by you\)/)).toBeVisible()
    const last = new URL(listCalls(seen, 'stoktok').slice(-1)[0].url)
      .searchParams
    expect(last.get('status')).toBe('approved')
    expect(last.get('offset')).toBe('0')
    await expect
      .element(sheet.getByRole('columnheader', { name: 'Decided' }))
      .toBeVisible()
    await expect
      .element(sheet.getByRole('button', { name: /^Approve / }))
      .not.toBeInTheDocument()
    await expect
      .element(sheet.getByRole('button', { name: /^Reject / }))
      .not.toBeInTheDocument()
  })

  it("pager: total 25 -> 'Showing 1–20 of 25', Next sends offset=20, Previous back to 0", async () => {
    const { client, seen } = fakeApi(
      server((req) => {
        const offset = Number(new URL(req.url).searchParams.get('offset'))
        return json(joinRequestsPage(JOIN_REQUESTS, 25, 20, offset))
      })
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'stoktok')
    await expect.element(sheet.getByText('Showing 1–20 of 25')).toBeVisible()
    await userEvent.click(sheet.getByRole('button', { name: 'Next' }))
    await expect.element(sheet.getByText('Showing 21–25 of 25')).toBeVisible()
    expect(
      listCalls(seen, 'stoktok').map((r) =>
        new URL(r.url).searchParams.get('offset')
      )
    ).toContain('20')
    await userEvent.click(sheet.getByRole('button', { name: 'Previous' }))
    await expect.element(sheet.getByText('Showing 1–20 of 25')).toBeVisible()
  })

  it('page clamp: a refetch that returns an empty page 2 steps the tab back to offset 0', async () => {
    let total = 21
    const queryClient = testQueryClient()
    const { client, seen } = fakeApi(
      server((req) => {
        const offset = Number(new URL(req.url).searchParams.get('offset'))
        return json(
          joinRequestsPage(
            offset >= total ? [] : JOIN_REQUESTS,
            total,
            20,
            offset
          )
        )
      })
    )
    const screen = await renderApps(client, { queryClient })
    const sheet = await openTab(screen, 'stoktok')
    await userEvent.click(sheet.getByRole('button', { name: 'Next' }))
    await expect.element(sheet.getByText('Showing 21–21 of 21')).toBeVisible()
    total = 20
    await queryClient.invalidateQueries({
      queryKey: appsKeys.joinRequestsAll('stoktok'),
    })
    await expect.element(sheet.getByText('Ada Lovelace')).toBeVisible()
    await expect
      .poll(() =>
        listCalls(seen, 'stoktok').map((r) =>
          new URL(r.url).searchParams.get('offset')
        )
      )
      .toEqual(['0', '20', '20', '0'])
    expect(sheet.getByText(/Showing 21–/).elements()).toHaveLength(0)
  })

  it('page clamp: an empty page with total 21 at offset 20 does not loop or refetch', async () => {
    const { client, seen } = fakeApi(
      server((req) => {
        const offset = Number(new URL(req.url).searchParams.get('offset'))
        return json(
          joinRequestsPage(offset >= 20 ? [] : JOIN_REQUESTS, 21, 20, offset)
        )
      })
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'stoktok')
    await userEvent.click(sheet.getByRole('button', { name: 'Next' }))
    await expect
      .element(sheet.getByRole('cell', { name: 'No pending join requests.' }))
      .toBeVisible()
    const n = listCalls(seen, 'stoktok').length
    await new Promise((r) => setTimeout(r, 300))
    expect(listCalls(seen, 'stoktok')).toHaveLength(n)
    expect(n).toBe(2)
  })

  it('an empty display_name falls back to the email without a sub-line', async () => {
    const { client } = fakeApi(
      server(() =>
        json(
          joinRequestsPage([
            {
              ...JOIN_REQUESTS[0],
              display_name: '  ',
              email: 'blank@people.test',
            },
          ])
        )
      )
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'stoktok')
    await expect.element(sheet.getByText('blank@people.test')).toBeVisible()
    expect(sheet.getByText('blank@people.test').elements()).toHaveLength(1)
    await expect
      .element(sheet.getByRole('button', { name: 'Approve blank@people.test' }))
      .toBeVisible()
  })

  it('pager buttons use aria-disabled and stay focusable; a disabled click does nothing', async () => {
    const { client, seen } = fakeApi(
      server((req) => {
        const offset = Number(new URL(req.url).searchParams.get('offset'))
        return json(joinRequestsPage(JOIN_REQUESTS, 25, 20, offset))
      })
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'stoktok')
    const prev = sheet.getByRole('button', { name: 'Previous' })
    await expect.element(prev).toHaveAttribute('aria-disabled', 'true')
    expect(prev.element().hasAttribute('disabled')).toBe(false)
    const calls = listCalls(seen, 'stoktok').length
    ;(prev.element() as HTMLElement).click()
    expect(listCalls(seen, 'stoktok')).toHaveLength(calls)
    ;(prev.element() as HTMLElement).focus()
    expect(document.activeElement).toBe(prev.element())
    await userEvent.click(sheet.getByRole('button', { name: 'Next' }))
    await expect.element(sheet.getByText('Showing 21–25 of 25')).toBeVisible()
    const next = sheet.getByRole('button', { name: 'Next' })
    await expect.element(next).toHaveAttribute('aria-disabled', 'true')
    expect(next.element().hasAttribute('disabled')).toBe(false)
    const after = listCalls(seen, 'stoktok').length
    ;(next.element() as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 200))
    expect(listCalls(seen, 'stoktok')).toHaveLength(after)
  })

  it('a polite status announces the result count after the filter changes', async () => {
    const { client } = fakeApi(
      server((req) =>
        new URL(req.url).searchParams.get('status') === 'approved'
          ? json(joinRequestsPage([]))
          : json(joinRequestsPage(JOIN_REQUESTS))
      )
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'stoktok')
    const live = sheet.getByText('3 pending join requests found.')
    await expect.element(live).toBeInTheDocument()
    expect(live.element().getAttribute('role')).toBe('status')
    expect(live.element().className).toContain('sr-only')
    await userEvent.click(sheet.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'Approved' }))
    await expect
      .element(sheet.getByText('0 approved join requests found.'))
      .toBeInTheDocument()
  })

  it('only admin:users:read: rows shown, no Approve/Reject, permission note', async () => {
    const { client } = fakeApi(server())
    const screen = await renderApps(client, {
      granted: ['admin:apps:read', 'admin:users:read'],
    })
    const sheet = await openTab(screen, 'stoktok')
    await expect.element(sheet.getByText('Ada Lovelace')).toBeVisible()
    await expect
      .element(sheet.getByRole('button', { name: /^Approve / }))
      .not.toBeInTheDocument()
    await expect
      .element(
        sheet.getByText(
          'Approving or rejecting requests needs admin:roles:assign.'
        )
      )
      .toBeVisible()
  })

  it('policy notes: open policy and disabled app show notes; none otherwise', async () => {
    const { client } = fakeApi(server())
    let screen = await renderApps(client)
    let sheet = await openTab(screen, 'calechip')
    await expect.element(sheet.getByText(/join policy is Open/)).toBeVisible()
    await expect
      .element(sheet.getByText(/This app is disabled/))
      .not.toBeInTheDocument()
    await screen.unmount()

    screen = await renderApps(client)
    sheet = await openTab(screen, 'stoktok')
    await expect.element(sheet.getByText(/This app is disabled/)).toBeVisible()
    await expect
      .element(sheet.getByText(/join policy is/))
      .not.toBeInTheDocument()
  })

  it('no request URL or query key contains an email', async () => {
    const queryClient = testQueryClient()
    const { client, seen } = fakeApi(server())
    const screen = await renderApps(client, { queryClient })
    const sheet = await openTab(screen, 'stoktok')
    await expect.element(sheet.getByText('Ada Lovelace')).toBeVisible()
    expect(
      seen.some((r) => r.url.includes('@') || r.url.includes('people'))
    ).toBe(false)
    const keys = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey)
    )
    expect(keys).not.toContain('@')
    expect(keys).not.toContain('Ada')
  })
})
