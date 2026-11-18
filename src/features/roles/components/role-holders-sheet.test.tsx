import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { apiError, fakeApi, testQueryClient } from '@/test-utils/api'
import { WithPermissions } from '@/test-utils/permissions'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { ADMIN_PERMISSIONS } from '@/lib/permissions/registry'
import {
  ADA,
  ANNA,
  assignmentsServer,
  holder,
  writes,
} from '@/features/users/components/assignment-test-data'
import { assignmentEffect } from '@/features/users/data/assignments'
import { formatDateTimeZone } from '@/features/users/data/data'
import { rolesKeys } from '../api/queries'
import { RoleHoldersSheet } from './role-holders-sheet'
import { RolesProvider } from './roles-provider'
import { APPS, ROLES, VIEWER_ID } from './test-data'

vi.mock('sonner', async (orig) => ({
  ...(await orig<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

const stoktok = APPS.find((a) => a.key === 'stoktok')!
const viewer = ROLES.stoktok.find((r) => r.id === VIEWER_ID)!
const HOLDERS = `/api/v1/apps/stoktok/role-definitions/${VIEWER_ID}/assignments`
const path = (r: Request) => new URL(r.url).pathname
const holderGets = (seen: Request[]) =>
  seen.filter((r) => r.method === 'GET' && path(r) === HOLDERS)

async function renderSheet(
  client: ApiClient,
  opts: {
    granted?: Parameters<typeof WithPermissions>[0]['granted']
    queryClient?: QueryClient
  } = {}
) {
  const returnFocus = vi.fn()
  const screen = await render(
    <QueryClientProvider client={opts.queryClient ?? testQueryClient()}>
      <WithPermissions granted={opts.granted ?? ADMIN_PERMISSIONS}>
        <RolesProvider app={stoktok} api={client}>
          <RoleHoldersSheet
            app={stoktok}
            role={viewer}
            open
            onOpenChange={() => {}}
            returnFocus={returnFocus}
          />
        </RolesProvider>
      </WithPermissions>
    </QueryClientProvider>
  )
  return { screen, returnFocus }
}

const many = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    holder({ id: `e0000000-0000-4000-8000-${String(i).padStart(12, '0')}` })
  )

describe('RoleHoldersSheet', () => {
  it('title and description say the count is of assignments; GET …/assignments?limit=20&offset=0', async () => {
    const { client, seen } = fakeApi(assignmentsServer({ holders: [holder()] }))
    const { screen } = await renderSheet(client)
    await expect
      .element(
        screen.getByRole('heading', {
          name: 'Assignments of Viewer (stoktok:viewer)',
        })
      )
      .toBeVisible()
    await expect
      .element(screen.getByText(/the count is of assignments, not people/))
      .toBeVisible()
    await expect.element(screen.getByText('ada@example.com')).toBeVisible()
    expect(new URL(holderGets(seen)[0].url).search).toBe('?limit=20&offset=0')
  })

  it('loading shows a status', async () => {
    const { client } = fakeApi(() => new Promise<Response>(() => {}))
    const { screen } = await renderSheet(client)
    await expect.element(screen.getByText('Loading assignments…')).toBeVisible()
  })

  it('empty shows "No one holds this role."', async () => {
    const { client } = fakeApi(assignmentsServer())
    const { screen } = await renderSheet(client)
    await expect
      .element(screen.getByText('No one holds this role.'))
      .toBeVisible()
  })

  it('error shows an alert with Retry that refetches', async () => {
    let fail = true
    const base = assignmentsServer({ holders: [holder()] })
    const { client, seen } = fakeApi((req) =>
      fail && path(req) === HOLDERS
        ? apiError(500, 'internal_error')
        : base(req)
    )
    const { screen } = await renderSheet(client)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't load assignments.")
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect.element(screen.getByText('ada@example.com')).toBeVisible()
    expect(holderGets(seen)).toHaveLength(2)
  })

  it('403 shows an inline panel', async () => {
    const { client } = fakeApi(() => apiError(403, 'permission_denied'))
    const { screen } = await renderSheet(client)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
  })

  it('404 says the role or app no longer exists, has no Retry and refreshes the roles list', async () => {
    const queryClient = testQueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { client } = fakeApi(() => apiError(404, 'not_found'))
    const { screen } = await renderSheet(client, { queryClient })
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('This role or app no longer exists.')
    await expect
      .element(screen.getByRole('button', { name: 'Retry' }))
      .not.toBeInTheDocument()
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: rolesKeys.all('stoktok'),
    })
  })

  it('rows show name and email in bdi, the user status, scope, expiry with zone and Not expired / Expired', async () => {
    const expires = '2030-01-01T00:00:00Z'
    const { client } = fakeApi(
      assignmentsServer({
        holders: [
          holder({ display_name: '<b>x</b>' }),
          holder({
            id: 'e0000002-0000-4000-8000-000000000002',
            user_id: ANNA.id,
            email: ANNA.email,
            display_name: null,
            user_status: 'disabled',
            org_id: 'c0000001-0000-4000-8000-000000000001',
            expires_at: expires,
            active: false,
          }),
        ],
      })
    )
    const { screen } = await renderSheet(client)
    const table = screen.getByRole('table', {
      name: 'Assignments of Viewer (stoktok:viewer)',
    })
    const name = table.getByText('<b>x</b>')
    await expect.element(name).toBeVisible()
    expect((await name.element()).tagName).toBe('BDI')
    expect((await table.getByText('ada@example.com').element()).tagName).toBe(
      'BDI'
    )
    await expect.element(table.getByText('Disabled')).toBeVisible()
    await expect.element(table.getByText('No display name')).toBeVisible()
    await expect.element(table.getByText('App-wide')).toBeVisible()
    await expect
      .element(
        table.getByText('Organization c0000001-0000-4000-8000-000000000001')
      )
      .toBeVisible()
    await expect
      .element(table.getByText(formatDateTimeZone(expires)))
      .toBeVisible()
    await expect.element(table.getByText('Not expired')).toBeVisible()
    await expect
      .element(table.getByText('Expired', { exact: true }))
      .toBeVisible()
    await expect.element(table.getByText('Inactive')).not.toBeInTheDocument()
    expect(ADA.email).toBe('ada@example.com')
  })

  it("the count line says '{total} assignments'; pager is 20 per page; Next sends offset=20; an empty page clamps back", async () => {
    const rows = many(21)
    const { client, seen } = fakeApi(assignmentsServer({ holders: rows }))
    const { screen } = await renderSheet(client)
    await expect
      .element(screen.getByText('Showing 1–20 of 21 assignments'))
      .toBeVisible()
    await expect
      .element(
        screen.getByRole('status').filter({ hasText: /^21 assignments$/ })
      )
      .toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await expect
      .element(screen.getByText('Showing 21–21 of 21 assignments'))
      .toBeVisible()
    expect(new URL(holderGets(seen)[1].url).search).toBe('?limit=20&offset=20')
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await expect
      .element(screen.getByText('Showing 1–20 of 21 assignments'))
      .toBeVisible()
    // The list shrinks before page 2 loads: the empty page clamps back.
    rows.length = 5
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await expect
      .element(screen.getByText('ada@example.com').first())
      .toBeVisible()
    await expect
      .poll(() => {
        const gets = holderGets(seen)
        return new URL(gets[gets.length - 1].url).search
      })
      .toBe('?limit=20&offset=0')
  })

  it('has no Revoke control', async () => {
    const { client } = fakeApi(assignmentsServer({ holders: [holder()] }))
    const { screen } = await renderSheet(client)
    await expect.element(screen.getByText('ada@example.com')).toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: /revoke/i }))
      .not.toBeInTheDocument()
  })

  it('Assign is hidden without admin:roles:assign', async () => {
    const { client } = fakeApi(assignmentsServer({ holders: [holder()] }))
    const { screen } = await renderSheet(client, {
      granted: ['admin:users:read'],
    })
    await expect.element(screen.getByText('ada@example.com')).toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Assign' }))
      .not.toBeInTheDocument()
  })

  it('Assign opens the dialog with the role fixed; success refetches the holders, shows the effect notice and focuses the heading', async () => {
    const { client, seen } = fakeApi(assignmentsServer({ holders: [] }))
    const { screen } = await renderSheet(client)
    await expect
      .element(screen.getByText('No one holds this role.'))
      .toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }))
    const dialog = screen.getByRole('dialog', { name: /Assign Viewer/ })
    await userEvent.fill(dialog.getByLabelText('Find a user by email'), 'ada')
    await userEvent.keyboard('{Enter}')
    await userEvent.click(
      dialog.getByRole('button', { name: 'Choose ada@example.com' })
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Grant role' }))
    await expect
      .element(
        screen
          .getByRole('status')
          .filter({ hasText: 'Granted stoktok:viewer in stoktok.' })
      )
      .toHaveTextContent(assignmentEffect('stoktok'))
    expect(writes(seen, 'POST')).toHaveLength(1)
    expect(holderGets(seen).length).toBeGreaterThanOrEqual(2)
    expect(toast.success).toHaveBeenCalledWith(
      'Role stoktok:viewer granted in stoktok.'
    )
    await expect
      .element(
        screen.getByRole('heading', {
          name: 'Assignments of Viewer (stoktok:viewer)',
        })
      )
      .toHaveFocus()
  })

  it('no email in any query key', async () => {
    const queryClient = testQueryClient()
    const { client } = fakeApi(assignmentsServer({ holders: [holder()] }))
    const { screen } = await renderSheet(client, { queryClient })
    await expect.element(screen.getByText('ada@example.com')).toBeVisible()
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => JSON.stringify(q.queryKey))
    expect(keys.length).toBeGreaterThan(0)
    for (const k of keys) expect(k).not.toContain('@')
  })
})
