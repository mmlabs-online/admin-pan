import { apiError, fakeApi, json } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { CREDENTIALS, credentialsPage } from './test-data'
import { appsServer, renderApps, writes } from './test-fixtures'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

const noop = () => {}
const path = (r: Request) => new URL(r.url).pathname
const credCalls = (seen: Request[], key: string) =>
  seen.filter(
    (r) => r.method === 'GET' && path(r) === `/api/v1/apps/${key}/credentials`
  )
type Screen = Awaited<ReturnType<typeof renderApps>>

async function openTab(screen: Screen, key: string) {
  await userEvent.click(screen.getByRole('button', { name: `View ${key}` }))
  const sheet = screen.getByRole('dialog')
  await userEvent.click(sheet.getByRole('tab', { name: 'Credentials' }))
  return sheet
}

/** Server whose credentials list comes from `list()`. */
function server(
  write: (req: Request) => Response | Promise<Response>,
  list?: (req: Request) => Response | Promise<Response>
) {
  const base = appsServer(write)
  return (req: Request) =>
    list && req.method === 'GET' && /\/credentials$/.test(path(req))
      ? list(req)
      : base(req)
}

describe('AppCredentialsTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches GET …/credentials?limit=20&offset=0 only when the Credentials tab is opened', async () => {
    const { client, seen } = fakeApi(appsServer(() => json({})))
    const screen = await renderApps(client)
    await userEvent.click(screen.getByRole('button', { name: 'View stoktok' }))
    const sheet = screen.getByRole('dialog')
    await expect
      .element(sheet.getByRole('tab', { name: 'Overview' }))
      .toBeVisible()
    expect(credCalls(seen, 'stoktok')).toHaveLength(0)
    await userEvent.click(sheet.getByRole('tab', { name: 'Credentials' }))
    await expect.poll(() => credCalls(seen, 'stoktok').length).toBe(1)
    expect(new URL(credCalls(seen, 'stoktok')[0].url).search).toBe(
      '?limit=20&offset=0'
    )
  })

  it('loading / empty "No credentials yet." / error + Retry / 403 inline', async () => {
    let c = fakeApi(
      server(
        () => json({}),
        () => new Promise<Response>(noop)
      )
    )
    let screen = await renderApps(c.client)
    let sheet = await openTab(screen, 'stoktok')
    await expect.element(sheet.getByText('Loading credentials…')).toBeVisible()
    await screen.unmount()

    c = fakeApi(
      server(
        () => json({}),
        () => json(credentialsPage([]))
      )
    )
    screen = await renderApps(c.client)
    sheet = await openTab(screen, 'calechip')
    await expect.element(sheet.getByText('No credentials yet.')).toBeVisible()
    await screen.unmount()

    let fail = true
    c = fakeApi(
      server(
        () => json({}),
        () =>
          fail
            ? apiError(500, 'internal_error')
            : json(credentialsPage(CREDENTIALS.stoktok))
      )
    )
    screen = await renderApps(c.client)
    sheet = await openTab(screen, 'stoktok')
    await expect
      .element(sheet.getByRole('alert'))
      .toHaveTextContent("Couldn't load credentials.")
    fail = false
    await userEvent.click(sheet.getByRole('button', { name: 'Retry' }))
    await expect.element(sheet.getByText('aaaa000000000001')).toBeVisible()
    await screen.unmount()

    c = fakeApi(
      server(
        () => json({}),
        () => apiError(403, 'permission_denied')
      )
    )
    screen = await renderApps(c.client)
    sheet = await openTab(screen, 'stoktok')
    await expect
      .element(sheet.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
  })

  it("rows: key id (mono), Active / 'Revoked <date>' as text, Created, Last used or 'Never'; revoked rows have no Revoke", async () => {
    const { client } = fakeApi(server(() => json({})))
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'stoktok')
    const table = sheet.getByRole('table', { name: 'Credentials of stoktok' })
    await expect.element(table.getByText('aaaa000000000001')).toBeVisible()
    expect(table.getByText('aaaa000000000001').element().className).toContain(
      'font-mono'
    )
    await expect
      .element(table.getByText('Active', { exact: true }))
      .toBeVisible()
    await expect
      .element(table.getByText(/^Revoked/))
      .toHaveTextContent('Revoked Mar 20, 2026')
    await expect.element(table.getByText('Apr 1, 2026')).toBeVisible()
    await expect.element(table.getByText('Never')).toBeVisible()
    await expect
      .element(table.getByRole('columnheader', { name: 'Last used' }))
      .toBeVisible()
    await expect
      .element(sheet.getByRole('button', { name: 'Revoke aaaa000000000001' }))
      .toBeVisible()
    await expect
      .element(sheet.getByRole('button', { name: 'Revoke aaaa000000000003' }))
      .not.toBeInTheDocument()
    await screen.unmount()

    const other = await renderApps(client)
    const calechip = await openTab(other, 'calechip')
    await expect.element(calechip.getByText('Never')).toBeVisible()
  })

  it("pager: total 25 -> 'Showing 1–20 of 25', Next sends offset=20, Previous back to 0", async () => {
    const { client, seen } = fakeApi(
      server(
        () => json({}),
        (req) => {
          const offset = Number(new URL(req.url).searchParams.get('offset'))
          return json(credentialsPage(CREDENTIALS.stoktok, 25, 20, offset))
        }
      )
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'stoktok')
    await expect.element(sheet.getByText('Showing 1–20 of 25')).toBeVisible()
    await expect
      .element(sheet.getByRole('button', { name: 'Previous' }))
      .toBeDisabled()
    await userEvent.click(sheet.getByRole('button', { name: 'Next' }))
    await expect.element(sheet.getByText('Showing 21–25 of 25')).toBeVisible()
    expect(
      credCalls(seen, 'stoktok').map((r) =>
        new URL(r.url).searchParams.get('offset')
      )
    ).toContain('20')
    await userEvent.click(sheet.getByRole('button', { name: 'Previous' }))
    await expect.element(sheet.getByText('Showing 1–20 of 25')).toBeVisible()
  })

  it("admin app: no Issue button, note 'The admin app has no credentials.'; disabled app: Issue natively disabled with 'Enable this app to issue credentials.' linked by aria-describedby; Revoke still shown", async () => {
    const { client } = fakeApi(server(() => json({})))
    let screen = await renderApps(client)
    let sheet = await openTab(screen, 'admin')
    await expect
      .element(sheet.getByText('The admin app has no credentials.'))
      .toBeVisible()
    await expect
      .element(sheet.getByRole('button', { name: 'Issue credential' }))
      .not.toBeInTheDocument()
    await screen.unmount()

    screen = await renderApps(client)
    sheet = await openTab(screen, 'stoktok')
    const issue = sheet.getByRole('button', { name: 'Issue credential' })
    await expect.element(issue).toBeDisabled()
    const note = sheet.getByText('Enable this app to issue credentials.')
    await expect.element(note).toBeVisible()
    expect(issue.element().getAttribute('aria-describedby')).toContain(
      note.element().id
    )
    await expect
      .element(sheet.getByRole('button', { name: 'Revoke aaaa000000000001' }))
      .toBeVisible()
  })

  it("granted only admin:apps:read: Issue disabled with 'Requires admin:apps:write', Revoke hidden; list still shown", async () => {
    const { client } = fakeApi(server(() => json({})))
    const screen = await renderApps(client, { granted: ['admin:apps:read'] })
    const sheet = await openTab(screen, 'calechip')
    await expect.element(sheet.getByText('aaaa000000000002')).toBeVisible()
    await expect
      .element(sheet.getByRole('button', { name: 'Issue credential' }))
      .toBeDisabled()
    await expect
      .element(sheet.getByText('Requires admin:apps:write'))
      .toBeVisible()
    await expect
      .element(sheet.getByRole('button', { name: 'Revoke aaaa000000000002' }))
      .not.toBeInTheDocument()
  })

  it("revoke: confirm names key id and app; Cancel sends nothing and focus returns to that row's Revoke button", async () => {
    const { client, seen } = fakeApi(server(() => json({})))
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'calechip')
    const revoke = sheet.getByRole('button', {
      name: 'Revoke aaaa000000000002',
    })
    await userEvent.click(revoke)
    const dialog = screen.getByRole('alertdialog')
    await expect.element(dialog).toHaveTextContent('aaaa000000000002')
    await expect.element(dialog).toHaveTextContent('Calechip (calechip)')
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen, 'DELETE')).toHaveLength(0)
    await expect.element(revoke).toHaveFocus()
  })

  it("revoke: confirm sends DELETE …/credentials/{id} (row id, not key_id); row stays Active until the refetch resolves; then 'Revoked'; toast names key id; focus on the heading; double click -> one DELETE", async () => {
    const row = CREDENTIALS.calechip[0]
    let current = [row]
    let releaseList: () => void = noop
    let hold = false
    const { client, seen } = fakeApi(
      server(
        () => new Response(null, { status: 204 }),
        async () => {
          if (hold) await new Promise<void>((r) => (releaseList = r))
          return json(credentialsPage(current))
        }
      )
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'calechip')
    await userEvent.click(
      sheet.getByRole('button', { name: 'Revoke aaaa000000000002' })
    )
    const dialog = screen.getByRole('alertdialog')
    hold = true
    current = [
      { ...row, active: false, revoked_at: '2026-03-25T10:00:00.000Z' },
    ]
    const confirm = dialog.getByRole('button', { name: 'Revoke' })
    const button = confirm.element() as HTMLElement
    button.click()
    button.click()
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen, 'DELETE')).toHaveLength(1)
    expect(path(writes(seen, 'DELETE')[0])).toBe(
      `/api/v1/apps/calechip/credentials/${row.id}`
    )
    expect(toast.success).toHaveBeenCalledWith(
      'Credential aaaa000000000002 revoked.'
    )
    // Not optimistic: still Active while the refetch is pending.
    await expect
      .element(sheet.getByText('Active', { exact: true }))
      .toBeVisible()
    await expect
      .element(sheet.getByRole('heading', { name: 'API credentials' }))
      .toHaveFocus()
    await expect.poll(() => releaseList).not.toBe(noop)
    releaseList()
    await expect.element(sheet.getByText(/^Revoked/)).toBeVisible()
    await expect
      .element(sheet.getByRole('button', { name: 'Revoke aaaa000000000002' }))
      .not.toBeInTheDocument()
  })

  it("revoke errors inline, dialog stays open: 403 -> ForbiddenPanel; 404 -> 'This credential no longer exists.' and the list is refetched", async () => {
    let res: () => Response = () => apiError(403, 'permission_denied')
    const { client, seen } = fakeApi(server(() => res()))
    const screen = await renderApps(client)
    const sheet = await openTab(screen, 'calechip')
    await userEvent.click(
      sheet.getByRole('button', { name: 'Revoke aaaa000000000002' })
    )
    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(dialog.getByRole('button', { name: 'Revoke' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")

    const before = credCalls(seen, 'calechip').length
    res = () => apiError(404, 'not_found')
    await userEvent.click(dialog.getByRole('button', { name: 'Revoke' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('This credential no longer exists.')
    await expect
      .poll(() => credCalls(seen, 'calechip').length)
      .toBeGreaterThan(before)
  })
})
