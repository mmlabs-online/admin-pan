import { apiError, fakeApi, json, testQueryClient } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { setUnauthorizedHandler } from '@/api/auth-hooks'
import { mePermissionsKeys } from '@/lib/permissions/me-permissions'
import { usersKeys } from '@/features/users/api/queries'
import { appsKeys } from '../api/queries'
import { JOIN_REQUESTS, joinRequestsPage } from './test-data'
import { appsServer, renderApps, writes } from './test-fixtures'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

const noop = () => {}
const path = (r: Request) => new URL(r.url).pathname
const ADA = JOIN_REQUESTS[0]
const listCalls = (seen: Request[]) =>
  seen.filter(
    (r) =>
      r.method === 'GET' && path(r) === '/api/v1/apps/stoktok/join-requests'
  )
type Screen = Awaited<ReturnType<typeof renderApps>>

async function openTab(screen: Screen) {
  await userEvent.click(screen.getByRole('button', { name: 'View stoktok' }))
  const sheet = screen.getByRole('dialog')
  await userEvent.click(sheet.getByRole('tab', { name: 'Join requests' }))
  return sheet
}

/** Pending list `current()` (read per request); writes go to `write`. */
function server(
  write: (req: Request) => Response | Promise<Response>,
  current: () => typeof JOIN_REQUESTS = () => JOIN_REQUESTS,
  hold?: () => Promise<void> | undefined
) {
  const base = appsServer(write)
  return async (req: Request) => {
    if (req.method === 'GET' && /\/join-requests$/.test(path(req))) {
      await hold?.()
      return json(joinRequestsPage(current()))
    }
    return base(req)
  }
}

async function openDialog(
  sheet: Awaited<ReturnType<typeof openTab>>,
  screen: Screen,
  which: 'Approve' | 'Reject'
) {
  await userEvent.click(
    sheet.getByRole('button', { name: `${which} Ada Lovelace` })
  )
  return screen.getByRole('alertdialog')
}

describe('AppJoinRequestDecisionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setUnauthorizedHandler(noop)
  })

  it('approve: names requester, email, app and key, "the app\'s default role", no role id or "will be granted"', async () => {
    const { client } = fakeApi(server(() => json(ADA)))
    const screen = await renderApps(client)
    const sheet = await openTab(screen)
    const dialog = await openDialog(sheet, screen, 'Approve')
    await expect.element(dialog).toHaveTextContent('Approve join request?')
    await expect.element(dialog).toHaveTextContent('Ada Lovelace')
    await expect.element(dialog).toHaveTextContent('ada@people.test')
    await expect.element(dialog).toHaveTextContent('Stoktok (stoktok)')
    await expect.element(dialog).toHaveTextContent("the app's default role")
    const text = dialog.element().textContent ?? ''
    expect(text).not.toContain('will be granted')
    expect(text).not.toContain('4d4d4d4d')
  })

  it('reject: names requester and app, vague cooldown without digits, destructive confirm', async () => {
    const { client } = fakeApi(server(() => json(ADA)))
    const screen = await renderApps(client)
    const sheet = await openTab(screen)
    const dialog = await openDialog(sheet, screen, 'Reject')
    await expect.element(dialog).toHaveTextContent('Reject join request?')
    await expect.element(dialog).toHaveTextContent('Ada Lovelace')
    await expect.element(dialog).toHaveTextContent('Stoktok (stoktok)')
    await expect
      .element(dialog)
      .toHaveTextContent("can't request to join this app again for a while")
    const confirm = dialog.getByRole('button', { name: 'Reject' })
    await expect.element(confirm).toBeVisible()
    expect(confirm.element().className).toContain('destructive')
    const copy = (dialog.element().textContent ?? '').replace(
      /Stoktok \(stoktok\)/,
      ''
    )
    expect(copy).not.toMatch(/\d/)
  })

  it('Cancel and Escape send no POST; focus returns to the row button that opened the dialog', async () => {
    const { client, seen } = fakeApi(server(() => json(ADA)))
    const screen = await renderApps(client)
    const sheet = await openTab(screen)
    const reject = sheet.getByRole('button', { name: 'Reject Ada Lovelace' })
    await userEvent.click(reject)
    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    await expect.element(reject).toHaveFocus()

    const approve = sheet.getByRole('button', { name: 'Approve Ada Lovelace' })
    await userEvent.click(approve)
    await expect.element(screen.getByRole('alertdialog')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect
      .element(screen.getByRole('alertdialog'))
      .not.toBeInTheDocument()
    await expect.element(approve).toHaveFocus()
    expect(writes(seen, 'POST')).toHaveLength(0)
  })

  for (const decision of ['Approve', 'Reject'] as const) {
    it(`${decision}: one POST, no body, even on double click; pending state; row stays until the refetch; toast; focus on the heading`, async () => {
      let current = JOIN_REQUESTS
      let release: () => void = noop
      let hold = false
      const { client, seen } = fakeApi(
        server(
          () => json(ADA),
          () => current,
          () => (hold ? new Promise<void>((r) => (release = r)) : undefined)
        )
      )
      const screen = await renderApps(client)
      const sheet = await openTab(screen)
      const dialog = await openDialog(sheet, screen, decision)
      hold = true
      current = JOIN_REQUESTS.slice(1)
      const confirm = dialog.getByRole('button', { name: decision })
      const button = confirm.element() as HTMLElement
      button.click()
      button.click()
      await expect.element(dialog).not.toBeInTheDocument()
      const posts = writes(seen, 'POST')
      expect(posts).toHaveLength(1)
      expect(path(posts[0])).toBe(
        `/api/v1/apps/stoktok/join-requests/${ADA.id}/${decision.toLowerCase()}`
      )
      expect(posts[0].body).toBeNull()
      expect(toast.success).toHaveBeenCalledWith(
        `Join request ${decision === 'Approve' ? 'approved' : 'rejected'}.`
      )
      // Not optimistic: the row is still listed until the refetch resolves.
      await expect.element(sheet.getByText('Ada Lovelace')).toBeVisible()
      await expect
        .element(sheet.getByRole('heading', { name: 'Join requests' }))
        .toHaveFocus()
      await expect.poll(() => release).not.toBe(noop)
      release()
      await expect
        .element(sheet.getByText('Ada Lovelace'))
        .not.toBeInTheDocument()
    })
  }

  it('pending: confirm reads "Approving…" and both buttons are aria-disabled; Escape is ignored', async () => {
    const { client } = fakeApi(server(() => new Promise<Response>(noop)))
    const screen = await renderApps(client)
    const sheet = await openTab(screen)
    const dialog = await openDialog(sheet, screen, 'Approve')
    await userEvent.click(dialog.getByRole('button', { name: 'Approve' }))
    await expect
      .element(dialog.getByRole('button', { name: 'Approving…' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(dialog.getByRole('button', { name: 'Cancel' }))
      .toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).toBeVisible()
  })

  it('invalidations: approve -> join requests + the user; reject -> join requests only; never me/permissions', async () => {
    for (const decision of ['Approve', 'Reject'] as const) {
      const queryClient = testQueryClient()
      const spy = vi.spyOn(queryClient, 'invalidateQueries')
      const { client } = fakeApi(server(() => json(ADA)))
      const screen = await renderApps(client, { queryClient })
      const sheet = await openTab(screen)
      const dialog = await openDialog(sheet, screen, decision)
      await userEvent.click(dialog.getByRole('button', { name: decision }))
      await expect.element(dialog).not.toBeInTheDocument()
      const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
      expect(keys).toContainEqual(appsKeys.joinRequestsAll('stoktok'))
      if (decision === 'Approve')
        expect(keys).toContainEqual(usersKeys.detail(ADA.user_id))
      else expect(keys).not.toContainEqual(usersKeys.detail(ADA.user_id))
      expect(keys).not.toContainEqual(mePermissionsKeys.all)
      await screen.unmount()
    }
  })

  it('403 -> inline ForbiddenPanel, dialog stays open', async () => {
    const { client } = fakeApi(server(() => apiError(403, 'permission_denied')))
    const screen = await renderApps(client)
    const sheet = await openTab(screen)
    const dialog = await openDialog(sheet, screen, 'Approve')
    await userEvent.click(dialog.getByRole('button', { name: 'Approve' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
  })

  it('404 -> "This join request no longer exists." and the list is refetched', async () => {
    const { client, seen } = fakeApi(server(() => apiError(404, 'not_found')))
    const screen = await renderApps(client)
    const sheet = await openTab(screen)
    const dialog = await openDialog(sheet, screen, 'Reject')
    const before = listCalls(seen).length
    await userEvent.click(dialog.getByRole('button', { name: 'Reject' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('This join request no longer exists.')
    await expect.poll(() => listCalls(seen).length).toBeGreaterThan(before)
  })

  const cases: [string, string, boolean][] = [
    ['not_pending', 'Someone already decided this request.', false],
    ['app_disabled', 'This app is disabled. Enable it', true],
    ['join_policy_changed', 'no longer requires approval', true],
    [
      'user_disabled',
      "account is disabled, so the request can't be approved",
      false,
    ],
    ['email_unverified', "hasn't verified their email", false],
    [
      'default_role_unusable',
      "default role is missing or can't be granted",
      true,
    ],
    ['something_new', 'The API refused this decision.', false],
  ]
  for (const [reason, copy, refetchesApp] of cases) {
    it(`409 ${reason} -> fixed copy, no server text, list refetched${refetchesApp ? ', app refetched' : ''}`, async () => {
      const { client, seen } = fakeApi(
        server(() =>
          apiError(409, 'conflict', [{ field: 'request_id', reason }])
        )
      )
      const screen = await renderApps(client)
      const sheet = await openTab(screen)
      const dialog = await openDialog(sheet, screen, 'Approve')
      const lists = listCalls(seen).length
      const apps = seen.filter(
        (r) => r.method === 'GET' && path(r) === '/api/v1/apps/stoktok'
      ).length
      await userEvent.click(dialog.getByRole('button', { name: 'Approve' }))
      const alert = dialog.getByRole('alert')
      await expect.element(alert).toHaveTextContent(copy)
      expect(alert.element().textContent).not.toContain('server text')
      await expect.poll(() => listCalls(seen).length).toBeGreaterThan(lists)
      if (refetchesApp)
        await expect
          .poll(
            () =>
              seen.filter(
                (r) => r.method === 'GET' && path(r) === '/api/v1/apps/stoktok'
              ).length
          )
          .toBeGreaterThan(apps)
    })
  }

  it('409 email_unverified is not an auth-gate event and not a ForbiddenPanel', async () => {
    const gate = vi.fn()
    setUnauthorizedHandler(gate)
    const { client } = fakeApi(
      server(() =>
        apiError(409, 'conflict', [
          { field: 'request_id', reason: 'email_unverified' },
        ])
      )
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen)
    const dialog = await openDialog(sheet, screen, 'Approve')
    await userEvent.click(dialog.getByRole('button', { name: 'Approve' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent("This user hasn't verified their email")
    expect(dialog.element().textContent).not.toContain("don't have permission")
    expect(gate).not.toHaveBeenCalled()
  })

  it('network failure -> unknown-outcome copy and the list is refetched', async () => {
    const { client, seen } = fakeApi(
      server(() => {
        throw new TypeError('Failed to fetch')
      })
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen)
    const dialog = await openDialog(sheet, screen, 'Approve')
    const before = listCalls(seen).length
    await userEvent.click(dialog.getByRole('button', { name: 'Approve' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent("We couldn't confirm the decision.")
    await expect.poll(() => listCalls(seen).length).toBeGreaterThan(before)
  })

  it('after a 409 not_pending whose refetch drops the row, closing the dialog focuses the heading', async () => {
    let current = JOIN_REQUESTS
    const { client } = fakeApi(
      server(
        () =>
          apiError(409, 'conflict', [
            { field: 'request_id', reason: 'not_pending' },
          ]),
        () => current
      )
    )
    const screen = await renderApps(client)
    const sheet = await openTab(screen)
    const dialog = await openDialog(sheet, screen, 'Approve')
    current = JOIN_REQUESTS.slice(1)
    await userEvent.click(dialog.getByRole('button', { name: 'Approve' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('Someone already decided')
    await expect
      .element(sheet.getByText('Ada Lovelace'))
      .not.toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect
      .element(sheet.getByRole('heading', { name: 'Join requests' }))
      .toHaveFocus()
  })
})
