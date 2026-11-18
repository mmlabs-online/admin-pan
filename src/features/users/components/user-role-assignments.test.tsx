import { QueryClientProvider } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { apiError, fakeApi, testQueryClient } from '@/test-utils/api'
import { WithPermissions } from '@/test-utils/permissions'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { ADMIN_PERMISSIONS } from '@/lib/permissions/registry'
import { SUPER_ADMIN_ID } from '@/features/roles/components/test-data'
import { assignmentEffect, type Assignment } from '../data/assignments'
import { formatDateTimeZone } from '../data/data'
import {
  ADA,
  assignment,
  assignmentsServer,
  writes,
} from './assignment-test-data'
import { UserRoleAssignments } from './user-role-assignments'
import { UsersProvider } from './users-provider'

vi.mock('sonner', async (orig) => ({
  ...(await orig<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

const ORG = '7d1f0c52-9a3b-4e6f-8c21-5b4a3d2e1f00'
const A2 = 'e0000002-0000-4000-8000-000000000002'
const ASSIGNMENTS = `/api/v1/users/${ADA.id}/role-assignments`
const path = (r: Request) => new URL(r.url).pathname
const gets = (seen: Request[]) =>
  seen.filter((r) => r.method === 'GET' && path(r) === ASSIGNMENTS)

function renderAssignments(
  client: ApiClient,
  opts: {
    granted?: Parameters<typeof WithPermissions>[0]['granted'] | null
    selfId?: string
  } = {}
) {
  const tree = (
    <UsersProvider api={client}>
      <UserRoleAssignments user={ADA} open />
    </UsersProvider>
  )
  const granted = opts.granted === undefined ? ADMIN_PERMISSIONS : opts.granted
  return render(
    <QueryClientProvider client={testQueryClient()}>
      {granted === null ? (
        tree
      ) : (
        <WithPermissions granted={granted} userId={opts.selfId}>
          {tree}
        </WithPermissions>
      )}
    </QueryClientProvider>
  )
}

const many = (n: number): Assignment[] =>
  Array.from({ length: n }, (_, i) =>
    assignment({ id: `e0000000-0000-4000-8000-${String(i).padStart(12, '0')}` })
  )

describe('UserRoleAssignments states', () => {
  it('loading shows a status', async () => {
    const { client } = fakeApi(() => new Promise<Response>(() => {}))
    const screen = await renderAssignments(client)
    await expect
      .element(screen.getByText('Loading role assignments…'))
      .toBeVisible()
  })

  it('rows: App-wide and org scope, expiry with zone, Not expired / Expired', async () => {
    const expires = '2030-01-01T00:00:00Z'
    const { client } = fakeApi(
      assignmentsServer({
        assignments: [
          assignment(),
          assignment({
            id: A2,
            app: 'admin',
            role_key: 'admin:viewer',
            org_id: ORG,
            expires_at: expires,
            active: false,
          }),
        ],
      })
    )
    const screen = await renderAssignments(client)
    const table = screen.getByRole('table', { name: 'Apps & roles' })
    await expect.element(table.getByText('stoktok:viewer')).toBeVisible()
    await expect.element(table.getByText('App-wide')).toBeVisible()
    await expect.element(table.getByText('Never')).toBeVisible()
    await expect.element(table.getByText(ORG)).toBeVisible()
    await expect
      .element(table.getByText(formatDateTimeZone(expires)))
      .toBeVisible()
    await expect
      .element(table.getByText('Expired', { exact: true }))
      .toBeVisible()
    await expect.element(table.getByText('Not expired')).toBeVisible()
    await expect.element(table.getByText('Inactive')).not.toBeInTheDocument()
  })

  it('empty, error with Retry, and 403 inline panel', async () => {
    const empty = fakeApi(assignmentsServer())
    const a = await renderAssignments(empty.client)
    await expect.element(a.getByText('No role assignments.')).toBeVisible()
    await a.unmount()

    const failing = fakeApi(() => apiError(500, 'internal_error'))
    const b = await renderAssignments(failing.client)
    await expect
      .element(b.getByRole('alert'))
      .toHaveTextContent("Couldn't load role assignments.")
    await expect.element(b.getByRole('button', { name: 'Retry' })).toBeVisible()
    await b.unmount()

    const denied = fakeApi(() => apiError(403, 'permission_denied'))
    const c = await renderAssignments(denied.client)
    await expect
      .element(c.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
  })

  it('total 45: pager "Showing 1–20 of 45"; Next sends offset=20', async () => {
    const { client, seen } = fakeApi(
      assignmentsServer({ assignments: many(45) })
    )
    const screen = await renderAssignments(client)
    await expect.element(screen.getByText('Showing 1–20 of 45')).toBeVisible()
    expect(new URL(gets(seen)[0].url).search).toBe('?limit=20&offset=0')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await expect.element(screen.getByText('Showing 21–40 of 45')).toBeVisible()
    expect(new URL(gets(seen)[1].url).search).toBe('?limit=20&offset=20')
  })

  it('an empty page after the last row is revoked clamps back to a page that exists', async () => {
    const rows = many(21)
    const { client, seen } = fakeApi(assignmentsServer({ assignments: rows }))
    const screen = await renderAssignments(client)
    await expect.element(screen.getByText('Showing 1–20 of 21')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await expect
      .element(screen.getByRole('button', { name: /^Revoke / }))
      .toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: /^Revoke / }))
    await userEvent.click(screen.getByRole('button', { name: 'Revoke role' }))
    await expect
      .element(screen.getByText(/^Revoked stoktok:viewer in stoktok/))
      .toBeVisible()
    // The page 2 refetch is empty (total 20): it steps back to offset 0.
    await expect
      .poll(() => new URL(gets(seen)[gets(seen).length - 1].url).search)
      .toBe('?limit=20&offset=0')
    await expect
      .element(screen.getByRole('button', { name: /^Revoke / }).first())
      .toBeVisible()
    expect(writes(seen, 'DELETE')).toHaveLength(1)
  })
})

describe('permissions', () => {
  it('Assign role under roles.assign; hidden when denied; Revoke column hidden when denied', async () => {
    const { client } = fakeApi(
      assignmentsServer({ assignments: [assignment()] })
    )
    const all = await renderAssignments(client)
    await expect
      .element(all.getByRole('button', { name: 'Assign role' }))
      .toBeVisible()
    await expect
      .element(all.getByRole('columnheader', { name: 'Actions' }))
      .toBeInTheDocument()
    await all.unmount()

    const readOnly = await renderAssignments(client, {
      granted: ['admin:users:read'],
    })
    await expect.element(readOnly.getByText('stoktok:viewer')).toBeVisible()
    await expect
      .element(readOnly.getByRole('button', { name: 'Assign role' }))
      .not.toBeInTheDocument()
    await expect
      .element(readOnly.getByRole('columnheader', { name: 'Actions' }))
      .not.toBeInTheDocument()
    await expect
      .element(readOnly.getByRole('button', { name: /^Revoke / }))
      .not.toBeInTheDocument()
  })

  it('Revoke is labelled "Revoke {role_key} in {app}" and disabled while another page shows as placeholder', async () => {
    let release: (r: Response) => void = () => {}
    const base = assignmentsServer({ assignments: many(25) })
    const { client } = fakeApi((req) =>
      new URL(req.url).searchParams.get('offset') === '20'
        ? new Promise<Response>((resolve) => (release = resolve))
        : base(req)
    )
    const screen = await renderAssignments(client)
    const revoke = screen.getByRole('button', {
      name: 'Revoke stoktok:viewer in stoktok',
    })
    await expect.element(revoke.first()).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await expect
      .element(revoke.first())
      .toHaveAttribute('aria-disabled', 'true')
    release(
      base(
        new Request(`https://api.test${ASSIGNMENTS}?limit=20&offset=20`)
      ) as Response
    )
    await expect
      .element(revoke.first())
      .toHaveAttribute('aria-disabled', 'false')
  })

  it("self: admin-app rows' Revoke is aria-disabled with a visible reason; stoktok rows stay enabled", async () => {
    const { client } = fakeApi(
      assignmentsServer({
        assignments: [
          assignment(),
          assignment({
            id: A2,
            app: 'admin',
            role_id: SUPER_ADMIN_ID,
            role_key: 'admin:super-admin',
          }),
        ],
      })
    )
    const screen = await renderAssignments(client, {
      selfId: ADA.id.toUpperCase(),
    })
    await expect
      .element(screen.getByText("You can't change your own admin roles"))
      .toBeVisible()
    await expect
      .element(
        screen.getByRole('button', {
          name: 'Revoke admin:super-admin in admin',
        })
      )
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(
        screen.getByRole('button', { name: 'Revoke stoktok:viewer in stoktok' })
      )
      .toHaveAttribute('aria-disabled', 'false')
  })

  it("admin:* denied: admin-app rows' Revoke is aria-disabled with 'Needs admin:*'; unknown fails open", async () => {
    const rows = [
      assignment({
        id: A2,
        app: 'admin',
        role_id: SUPER_ADMIN_ID,
        role_key: 'admin:super-admin',
      }),
    ]
    const { client } = fakeApi(assignmentsServer({ assignments: rows }))
    const denied = await renderAssignments(client, {
      granted: ['admin:users:read', 'admin:roles:assign'],
    })
    const button = denied.getByRole('button', {
      name: 'Revoke admin:super-admin in admin',
    })
    await expect.element(button).toHaveAttribute('aria-disabled', 'true')
    await expect.element(denied.getByText('Needs admin:*')).toBeVisible()
    await denied.unmount()

    const unknown = await renderAssignments(client, { granted: null })
    await expect
      .element(
        unknown.getByRole('button', {
          name: 'Revoke admin:super-admin in admin',
        })
      )
      .toHaveAttribute('aria-disabled', 'false')
  })
})

describe('notices after a change', () => {
  it('after a stoktok grant: toast without the email, the 12-hour note, list refetched, focus on the heading', async () => {
    const rows: Assignment[] = []
    const { client, seen } = fakeApi(assignmentsServer({ assignments: rows }))
    const screen = await renderAssignments(client)
    await expect.element(screen.getByText('No role assignments.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Assign role' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(dialog.getByRole('combobox', { name: 'App' }))
    await userEvent.click(screen.getByRole('option', { name: /Stoktok/ }))
    await userEvent.click(dialog.getByRole('combobox', { name: 'Role' }))
    await userEvent.click(
      screen.getByRole('option', { name: /Viewer \(stoktok:viewer\)/ })
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Grant role' }))
    await expect
      .element(
        screen
          .getByRole('status')
          .filter({ hasText: 'Granted stoktok:viewer in stoktok.' })
      )
      .toHaveTextContent(assignmentEffect('stoktok'))
    expect(toast.success).toHaveBeenCalledWith(
      'Role stoktok:viewer granted in stoktok.'
    )
    expect(JSON.stringify(vi.mocked(toast.success).mock.calls)).not.toContain(
      '@'
    )
    expect(writes(seen, 'POST')).toHaveLength(1)
    await expect
      .element(screen.getByText('stoktok:viewer').first())
      .toBeVisible()
    expect(gets(seen).length).toBeGreaterThanOrEqual(2)
    await expect
      .element(screen.getByRole('heading', { name: 'Apps & roles' }))
      .toHaveFocus()
  })

  it('after an admin revoke: the status shows the next-admin-request note', async () => {
    const rows = [
      assignment({
        id: A2,
        app: 'admin',
        role_id: SUPER_ADMIN_ID,
        role_key: 'admin:super-admin',
      }),
    ]
    const { client } = fakeApi(assignmentsServer({ assignments: rows }))
    const screen = await renderAssignments(client, { selfId: 'someone-else' })
    await userEvent.click(
      screen.getByRole('button', { name: 'Revoke admin:super-admin in admin' })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Revoke role' }))
    await expect
      .element(
        screen
          .getByRole('status')
          .filter({ hasText: 'Revoked admin:super-admin in admin.' })
      )
      .toHaveTextContent(assignmentEffect('admin'))
    await expect.element(screen.getByText('No role assignments.')).toBeVisible()
  })

  it('revoke is never optimistic: the row stays while the DELETE is pending and leaves after the refetch', async () => {
    let release: (r: Response) => void = () => {}
    const base = assignmentsServer({ assignments: [assignment()] })
    const { client } = fakeApi((req) =>
      req.method === 'DELETE'
        ? new Promise<Response>((resolve) => (release = resolve))
        : base(req)
    )
    const screen = await renderAssignments(client)
    await userEvent.click(
      screen.getByRole('button', { name: 'Revoke stoktok:viewer in stoktok' })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Revoke role' }))
    await expect
      .element(screen.getByRole('button', { name: 'Revoking…' }))
      .toBeVisible()
    // The modal hides the table from the accessibility tree: match by text.
    await expect
      .element(screen.getByText('stoktok:viewer', { exact: true }))
      .toBeVisible()
    // The API deletes the row only now; the list refetches after the 204.
    void base(
      new Request(`https://api.test${ASSIGNMENTS}/${assignment().id}`, {
        method: 'DELETE',
      })
    )
    release(new Response(null, { status: 204 }))
    await expect.element(screen.getByText('No role assignments.')).toBeVisible()
  })

  it('a failed revoke keeps the row and shows the mapped error in the dialog', async () => {
    const base = assignmentsServer({ assignments: [assignment()] })
    const { client } = fakeApi((req) =>
      req.method === 'DELETE' ? apiError(409, 'conflict') : base(req)
    )
    const screen = await renderAssignments(client)
    await userEvent.click(
      screen.getByRole('button', { name: 'Revoke stoktok:viewer in stoktok' })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Revoke role' }))
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('This assignment changed at the same time.')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect
      .element(screen.getByRole('table').getByText('stoktok:viewer'))
      .toBeVisible()
  })

  it('cancelling the revoke returns focus to the row button', async () => {
    const { client } = fakeApi(
      assignmentsServer({ assignments: [assignment()] })
    )
    const screen = await renderAssignments(client)
    const button = screen.getByRole('button', {
      name: 'Revoke stoktok:viewer in stoktok',
    })
    await userEvent.click(button)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect.element(button).toHaveFocus()
  })
})
