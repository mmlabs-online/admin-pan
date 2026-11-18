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
import {
  ACME,
  ADA,
  assignment,
  assignmentsServer,
  writes,
} from './assignment-test-data'
import { RoleAssignmentRevokeDialog } from './role-assignment-revoke-dialog'

vi.mock('sonner', async (orig) => ({
  ...(await orig<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

const path = (r: Request) => new URL(r.url).pathname
const deletes = (seen: Request[]) => writes(seen, 'DELETE')
const confirmButton = (screen: Awaited<ReturnType<typeof render>>) =>
  screen.getByRole('alertdialog').getByRole('button', { name: 'Revoke role' })
const domClick = (button: { element: () => Element }) =>
  (button.element() as HTMLElement).click()

async function renderRevoke(
  client: ApiClient,
  row: Assignment = assignment(),
  opts: {
    granted?: Parameters<typeof WithPermissions>[0]['granted']
    selfId?: string
  } = {}
) {
  const onDone = vi.fn()
  const screen = await render(
    <QueryClientProvider client={testQueryClient()}>
      <WithPermissions
        granted={opts.granted ?? ADMIN_PERMISSIONS}
        userId={opts.selfId}
      >
        <RoleAssignmentRevokeDialog
          api={client}
          user={ADA}
          assignment={row}
          onDone={onDone}
        />
      </WithPermissions>
    </QueryClientProvider>
  )
  return { screen, onDone }
}

describe('RoleAssignmentRevokeDialog', () => {
  it('names the user, the role name and key, the app and the org name; Cancel sends no DELETE', async () => {
    const { client, seen } = fakeApi(assignmentsServer())
    const { screen, onDone } = await renderRevoke(
      client,
      assignment({ org_id: ACME.id })
    )
    const dialog = screen.getByRole('alertdialog')
    await expect
      .element(dialog.getByRole('heading', { name: 'Revoke stoktok:viewer?' }))
      .toBeVisible()
    await expect.element(dialog.getByText('Acme Corp')).toBeVisible()
    await expect
      .element(dialog.getByText('Viewer', { exact: true }))
      .toBeVisible()
    await expect
      .element(dialog)
      .toHaveTextContent(
        'Revoke Viewer (stoktok:viewer) in stoktok from Ada Lovelace (ada@example.com) — scope: Acme Corp?'
      )
    expect(
      (await dialog.getByText('ada@example.com').element()).closest('bdi')
    ).not.toBeNull()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(deletes(seen)).toHaveLength(0)
    expect(onDone).toHaveBeenCalledWith('cancel')
  })

  it('app-wide scope and a failed role lookup fall back to App-wide and the role key', async () => {
    const { client } = fakeApi(
      assignmentsServer({
        over: (req) =>
          path(req).includes('/role-definitions/')
            ? apiError(500, 'internal_error')
            : undefined,
      })
    )
    const { screen } = await renderRevoke(client)
    await expect
      .element(screen.getByRole('alertdialog'))
      .toHaveTextContent(
        'Revoke stoktok:viewer (stoktok:viewer) in stoktok from Ada Lovelace (ada@example.com) — scope: App-wide?'
      )
  })

  it("an org lookup failure or organizations.view denied shows 'Organization {id}'; a denied view sends no org request", async () => {
    const failing = fakeApi(
      assignmentsServer({
        over: (req) =>
          path(req).startsWith('/api/v1/organizations')
            ? apiError(403, 'permission_denied')
            : undefined,
      })
    )
    const a = await renderRevoke(
      failing.client,
      assignment({ org_id: ACME.id })
    )
    await expect
      .element(a.screen.getByRole('alertdialog'))
      .toHaveTextContent(`scope: Organization ${ACME.id}?`)
    await a.screen.unmount()

    const denied = fakeApi(assignmentsServer())
    const b = await renderRevoke(
      denied.client,
      assignment({ org_id: ACME.id }),
      {
        granted: ['admin:roles:assign', 'admin:apps:read'],
      }
    )
    await expect
      .element(b.screen.getByRole('alertdialog'))
      .toHaveTextContent(`scope: Organization ${ACME.id}?`)
    expect(
      denied.seen.filter((r) => path(r).startsWith('/api/v1/organizations'))
    ).toHaveLength(0)
  })

  it('shows when the change takes effect for the app, never as immediate', async () => {
    const { client } = fakeApi(assignmentsServer())
    const a = await renderRevoke(client)
    await expect
      .element(a.screen.getByRole('alertdialog'))
      .toHaveTextContent(assignmentEffect('stoktok'))
    await a.screen.unmount()
    const b = await renderRevoke(
      client,
      assignment({
        app: 'admin',
        role_id: SUPER_ADMIN_ID,
        role_key: 'admin:viewer',
      }),
      { selfId: 'someone-else' }
    )
    await expect
      .element(b.screen.getByRole('alertdialog'))
      .toHaveTextContent(assignmentEffect('admin'))
  })

  it('confirm sends one DELETE even on a double click; closing is blocked while pending; no email in the toast', async () => {
    let release: (r: Response) => void = () => {}
    const base = assignmentsServer({ assignments: [assignment()] })
    const { client, seen } = fakeApi((req) =>
      req.method === 'DELETE'
        ? new Promise<Response>((resolve) => (release = resolve))
        : base(req)
    )
    const { screen, onDone } = await renderRevoke(client)
    await userEvent.dblClick(confirmButton(screen))
    await expect
      .element(screen.getByRole('button', { name: 'Revoking…' }))
      .toBeVisible()
    expect(deletes(seen)).toHaveLength(1)
    expect(path(deletes(seen)[0])).toBe(
      `/api/v1/users/${ADA.id}/role-assignments/${assignment().id}`
    )
    await userEvent.keyboard('{Escape}')
    expect(onDone).not.toHaveBeenCalled()
    release(new Response(null, { status: 204 }))
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith('success'))
    expect(deletes(seen)).toHaveLength(1)
    expect(toast.success).toHaveBeenCalledWith(
      'Role stoktok:viewer revoked in stoktok.'
    )
    expect(JSON.stringify(vi.mocked(toast.success).mock.calls)).not.toContain(
      '@'
    )
  })

  it('admin:super-admin adds the last-super-admin note; a 409 last_super_admin is inline and the dialog stays open', async () => {
    const { client, seen } = fakeApi(
      assignmentsServer({
        over: (req) =>
          req.method === 'DELETE'
            ? apiError(409, 'last_super_admin')
            : undefined,
      })
    )
    const { screen, onDone } = await renderRevoke(
      client,
      assignment({
        app: 'admin',
        role_id: SUPER_ADMIN_ID,
        role_key: 'admin:super-admin',
      }),
      { selfId: 'someone-else' }
    )
    await expect
      .element(screen.getByRole('alertdialog'))
      .toHaveTextContent(
        'The API refuses to revoke the last active super admin.'
      )
    await userEvent.click(confirmButton(screen))
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('This is the last active super admin.')
    expect(onDone).not.toHaveBeenCalled()
    expect(deletes(seen)).toHaveLength(1)
  })

  it('403 codes show the inline panel; 404 finishes as gone; an unknown outcome says it may have been applied', async () => {
    const cases: [() => Response | Promise<Response>, string | 'gone'][] = [
      [
        () => apiError(403, 'admin_wildcard_required'),
        'Only super admins can do this',
      ],
      [
        () => apiError(403, 'self_assignment_forbidden'),
        "You can't change your own roles",
      ],
      [() => apiError(404, 'not_found'), 'gone'],
      [() => Promise.reject(new TypeError('x')), 'it may have been applied'],
    ]
    for (const [respond, expected] of cases) {
      const base = assignmentsServer()
      const { client, seen } = fakeApi((req) =>
        req.method === 'DELETE' ? respond() : base(req)
      )
      const { screen, onDone } = await renderRevoke(client)
      await userEvent.click(confirmButton(screen))
      if (expected === 'gone')
        await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith('gone'))
      else {
        await expect
          .element(screen.getByRole('alert'))
          .toHaveTextContent(expected)
        expect(onDone).not.toHaveBeenCalled()
      }
      expect(deletes(seen)).toHaveLength(1)
      await screen.unmount()
    }
  })

  it('a privileged role with admin:* denied disables Confirm with the reason and sends nothing', async () => {
    const { client, seen } = fakeApi(assignmentsServer())
    const { screen } = await renderRevoke(
      client,
      assignment({
        app: 'admin',
        role_id: SUPER_ADMIN_ID,
        role_key: 'admin:super-admin',
      }),
      {
        granted: ['admin:roles:assign', 'admin:apps:read', 'admin:users:read'],
        selfId: 'someone-else',
      }
    )
    await expect.element(screen.getByText('Needs admin:*.')).toBeVisible()
    await expect.element(confirmButton(screen)).toBeDisabled()
    domClick(confirmButton(screen))
    expect(deletes(seen)).toHaveLength(0)
  })
})
