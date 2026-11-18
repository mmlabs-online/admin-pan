import { QueryClientProvider } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { apiError, fakeApi, json, testQueryClient } from '@/test-utils/api'
import { WithPermissions } from '@/test-utils/permissions'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { ADMIN_PERMISSIONS } from '@/lib/permissions/registry'
import {
  APPS,
  OPERATOR_ID,
  ROLES,
  VIEWER_ID,
  pageOf,
  role,
} from '@/features/roles/components/test-data'
import { assignmentEffect } from '../data/assignments'
import { type User } from '../data/schema'
import {
  ACME,
  ADA,
  ANN,
  ANNA,
  assignmentsServer,
  bodyOf,
  writes,
} from './assignment-test-data'
import { RoleAssignDialog, type AssignTarget } from './role-assign-dialog'

vi.mock('sonner', async (orig) => ({
  ...(await orig<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

const path = (r: Request) => new URL(r.url).pathname
const searchOf = (r: Request) => new URL(r.url).searchParams
const posts = (seen: Request[]) => writes(seen, 'POST')
const app = (key: string) => APPS.find((a) => a.key === key)!
const userTarget = (user: User = ADA): AssignTarget => ({ kind: 'user', user })
const roleTarget = (appKey = 'stoktok', id = VIEWER_ID): AssignTarget => ({
  kind: 'role',
  app: app(appKey),
  role: ROLES[appKey].find((r) => r.id === id)!,
})

async function renderDialog(
  client: ApiClient,
  target: AssignTarget,
  opts: {
    granted?: Parameters<typeof WithPermissions>[0]['granted'] | null
    selfId?: string
  } = {}
) {
  const onDone = vi.fn()
  const tree = <RoleAssignDialog api={client} target={target} onDone={onDone} />
  const granted = opts.granted === undefined ? ADMIN_PERMISSIONS : opts.granted
  const screen = await render(
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
  return { screen, onDone }
}

type Screen = Awaited<ReturnType<typeof render>>
async function choose(screen: Screen, field: 'App' | 'Role', option: RegExp) {
  await userEvent.click(screen.getByRole('combobox', { name: field }))
  await userEvent.click(screen.getByRole('option', { name: option }))
}
// `fill` does not press keys: submit the search with Enter.
async function searchFor(
  input: ReturnType<Screen['getByLabelText']>,
  text: string
) {
  await userEvent.fill(input, text)
  await userEvent.keyboard('{Enter}')
}
// A real click on an aria-disabled button must do nothing (Playwright would wait for it to be enabled).
const domClick = (button: { element: () => Element }) =>
  (button.element() as HTMLElement).click()
const submit = (screen: Screen, name = 'Grant role') =>
  screen.getByRole('dialog').getByRole('button', { name })

describe('RoleAssignDialog, user fixed', () => {
  it('names the user (display name and email in bdi) and has no user picker', async () => {
    const { client } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, userTarget())
    await expect
      .element(
        screen.getByRole('heading', { name: 'Assign a role to Ada Lovelace' })
      )
      .toBeVisible()
    await expect.element(screen.getByText('ada@example.com')).toBeVisible()
    expect(
      (await screen.getByText('ada@example.com').element()).closest('bdi')
    ).not.toBeNull()
    await expect
      .element(screen.getByLabelText('Find a user by email'))
      .not.toBeInTheDocument()
  })

  it("app select lists apps with ' — disabled'; changing the app resets the role and the scope", async () => {
    const { client } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, userTarget())
    await userEvent.click(screen.getByRole('combobox', { name: 'App' }))
    await expect
      .element(
        screen.getByRole('option', { name: 'Legacy (legacy) — disabled' })
      )
      .toBeVisible()
    await userEvent.click(screen.getByRole('option', { name: /Calechip/ }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Role' }))
    await userEvent.click(screen.getByRole('option', { name: /Member/ }))
    await expect
      .element(screen.getByRole('combobox', { name: 'Role' }))
      .toHaveTextContent('Member (calechip:member)')
    await userEvent.click(
      screen.getByRole('radio', { name: 'One organization' })
    )
    await choose(screen, 'App', /Stoktok/)
    await expect
      .element(screen.getByRole('combobox', { name: 'Role' }))
      .toHaveTextContent('Choose a role')
    await expect
      .element(screen.getByRole('radio', { name: 'One organization' }))
      .not.toBeInTheDocument()
  })

  it('roles load from every role-definitions page (130 roles, 2 requests); labelled "name (key)"; privileged ones say "needs admin:*"', async () => {
    const all = Array.from({ length: 130 }, (_, i) =>
      role(
        'stoktok',
        `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        `r${i}`,
        {
          privileged: i === 0,
        }
      )
    )
    const { client, seen } = fakeApi(
      assignmentsServer({
        over: (req) =>
          path(req) === '/api/v1/apps/stoktok/role-definitions'
            ? json(
                pageOf(
                  all,
                  Number(searchOf(req).get('limit')),
                  Number(searchOf(req).get('offset'))
                )
              )
            : undefined,
      })
    )
    const { screen } = await renderDialog(client, userTarget())
    await choose(screen, 'App', /Stoktok/)
    await userEvent.click(screen.getByRole('combobox', { name: 'Role' }))
    await expect
      .element(screen.getByRole('option', { name: 'R129 (stoktok:r129)' }))
      .toBeInTheDocument()
    await expect
      .element(
        screen.getByRole('option', { name: 'R0 (stoktok:r0) — needs admin:*' })
      )
      .toBeInTheDocument()
    expect(
      seen
        .filter((r) => path(r) === '/api/v1/apps/stoktok/role-definitions')
        .map((r) => searchOf(r).get('offset'))
    ).toEqual(['0', '100'])
  })

  it('admin:* denied: privileged options are disabled with a text reason; unknown fails open', async () => {
    const { client } = fakeApi(assignmentsServer())
    const denied = await renderDialog(client, userTarget(), {
      granted: ['admin:apps:read', 'admin:roles:assign', 'admin:users:read'],
    })
    await choose(denied.screen, 'App', /Stoktok/)
    await userEvent.click(denied.screen.getByRole('combobox', { name: 'Role' }))
    const option = denied.screen.getByRole('option', {
      name: 'Operator (stoktok:operator) — needs admin:*',
    })
    await expect.element(option).toHaveAttribute('aria-disabled', 'true')
    await denied.screen.unmount()

    const open = await renderDialog(client, userTarget(), { granted: null })
    await choose(open.screen, 'App', /Stoktok/)
    await userEvent.click(open.screen.getByRole('combobox', { name: 'Role' }))
    await expect
      .element(
        open.screen.getByRole('option', {
          name: 'Operator (stoktok:operator) — needs admin:*',
        })
      )
      .not.toHaveAttribute('aria-disabled', 'true')
  })

  it('org_mode none: no scope field and the POST body has no org_id', async () => {
    const { client, seen } = fakeApi(assignmentsServer())
    const { screen, onDone } = await renderDialog(client, userTarget())
    await choose(screen, 'App', /Stoktok/)
    await choose(screen, 'Role', /Viewer/)
    await expect
      .element(screen.getByRole('radio', { name: 'App-wide' }))
      .not.toBeInTheDocument()
    await userEvent.click(submit(screen))
    await expect.poll(() => posts(seen)).toHaveLength(1)
    expect(path(posts(seen)[0])).toBe(
      `/api/v1/users/${ADA.id}/role-assignments`
    )
    expect(await bodyOf(posts(seen)[0])).toEqual({ role_id: VIEWER_ID })
    await vi.waitFor(() =>
      expect(onDone).toHaveBeenCalledWith({
        result: 'success',
        app: 'stoktok',
        roleKey: 'stoktok:viewer',
      })
    )
  })

  it('org_mode required: App-wide by default; a searched org is chosen explicitly; "App-wide" clears it', async () => {
    const { client, seen } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, userTarget())
    await choose(screen, 'App', /Calechip/)
    await choose(screen, 'Role', /Member/)
    await expect
      .element(screen.getByRole('radio', { name: 'App-wide' }))
      .toBeChecked()
    await userEvent.click(
      screen.getByRole('radio', { name: 'One organization' })
    )
    await userEvent.fill(screen.getByLabelText('Find an organization'), 'ac')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await expect.element(screen.getByText('Acme Corp')).toBeVisible()
    expect(
      seen.find(
        (r) =>
          path(r) === '/api/v1/organizations' && searchOf(r).get('q') === 'ac'
      )
    ).toBeDefined()
    // One result is shown but nothing is picked: Submit stays disabled.
    await expect
      .element(submit(screen))
      .toHaveAttribute('aria-disabled', 'true')
    domClick(submit(screen))
    expect(posts(seen)).toHaveLength(0)
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose Acme Corp' })
    )
    await expect.element(screen.getByText(/Selected:/)).toBeVisible()
    await expect
      .element(submit(screen))
      .not.toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(screen.getByRole('radio', { name: 'App-wide' }))
    await expect.element(screen.getByText(/Selected:/)).not.toBeInTheDocument()
    await userEvent.click(submit(screen))
    await expect.poll(() => posts(seen)).toHaveLength(1)
    expect(await bodyOf(posts(seen)[0])).toEqual({
      role_id: ROLES.calechip[0].id,
    })
  })

  it('an organization is sent as org_id when chosen', async () => {
    const { client, seen } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, userTarget())
    await choose(screen, 'App', /Calechip/)
    await choose(screen, 'Role', /Member/)
    await userEvent.click(
      screen.getByRole('radio', { name: 'One organization' })
    )
    await searchFor(screen.getByLabelText('Find an organization'), 'acme')
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose Acme Corp' })
    )
    await userEvent.click(submit(screen))
    await expect.poll(() => posts(seen)).toHaveLength(1)
    expect(await bodyOf(posts(seen)[0])).toEqual({
      role_id: ROLES.calechip[0].id,
      org_id: ACME.id,
    })
  })

  it('org search 403 shows an inline panel and App-wide still works', async () => {
    const { client, seen } = fakeApi(
      assignmentsServer({
        over: (req) =>
          path(req) === '/api/v1/organizations'
            ? apiError(403, 'permission_denied')
            : undefined,
      })
    )
    const { screen } = await renderDialog(client, userTarget())
    await choose(screen, 'App', /Calechip/)
    await choose(screen, 'Role', /Member/)
    await userEvent.click(
      screen.getByRole('radio', { name: 'One organization' })
    )
    await searchFor(screen.getByLabelText('Find an organization'), 'ac')
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
    await userEvent.click(screen.getByRole('radio', { name: 'App-wide' }))
    await userEvent.click(submit(screen))
    await expect.poll(() => posts(seen)).toHaveLength(1)
  })

  it('expiry: the label shows the zone; empty sends no key; a value is sent ending in Z; a past value is a field error and sends nothing', async () => {
    const { client, seen } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, userTarget())
    await choose(screen, 'App', /Stoktok/)
    await choose(screen, 'Role', /Viewer/)
    await expect
      .element(screen.getByText(/Your time zone: .+, UTC[+-]\d\d:\d\d/))
      .toBeVisible()
    const expiry = screen.getByLabelText('Expires (optional)')
    await userEvent.fill(expiry, '2020-01-01T00:00')
    await userEvent.click(submit(screen))
    await expect
      .element(screen.getByText('Pick a time in the future.'))
      .toBeVisible()
    await expect.element(expiry).toHaveFocus()
    expect(posts(seen)).toHaveLength(0)
    await userEvent.fill(expiry, '2099-01-02T03:04')
    await userEvent.click(submit(screen))
    await expect.poll(() => posts(seen)).toHaveLength(1)
    const body = (await bodyOf(posts(seen)[0])) as { expires_at: string }
    expect(body.expires_at.endsWith('Z')).toBe(true)
    expect(body.expires_at).toBe(new Date('2099-01-02T03:04').toISOString())
  })

  it('admin:super-admin selected: expiry is disabled with a text reason and cleared', async () => {
    const { client } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, userTarget(), {
      selfId: 'someone-else',
    })
    await choose(screen, 'App', /Admin console/)
    await userEvent.fill(
      screen.getByLabelText('Expires (optional)'),
      '2099-01-02T03:04'
    )
    await userEvent.click(screen.getByRole('combobox', { name: 'Role' }))
    await userEvent.click(screen.getByRole('option', { name: /Super admin/ }))
    await expect
      .element(screen.getByLabelText('Expires (optional)'))
      .toBeDisabled()
    await expect
      .element(screen.getByLabelText('Expires (optional)'))
      .toHaveValue('')
    await expect
      .element(screen.getByText("admin:super-admin can't expire."))
      .toBeVisible()
  })

  it('a plain grant sends one POST; a double click sends one; pending shows "Granting…" and blocks closing', async () => {
    let release: (r: Response) => void = () => {}
    const base = assignmentsServer()
    const { client, seen } = fakeApi((req) =>
      req.method === 'POST'
        ? new Promise<Response>((resolve) => (release = resolve))
        : base(req)
    )
    const { screen, onDone } = await renderDialog(client, userTarget())
    await choose(screen, 'App', /Stoktok/)
    await choose(screen, 'Role', /Viewer/)
    await userEvent.dblClick(submit(screen))
    await expect
      .element(
        screen.getByRole('dialog').getByRole('button', { name: 'Granting…' })
      )
      .toBeVisible()
    expect(posts(seen)).toHaveLength(1)
    await userEvent.keyboard('{Escape}')
    expect(onDone).not.toHaveBeenCalled()
    release(json({ id: 'x' }, 201))
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(posts(seen)).toHaveLength(1)
  })

  it('a privileged role goes through a confirm step naming user, role, app and scope; Back sends nothing; Confirm sends one POST', async () => {
    const { client, seen } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, userTarget())
    await choose(screen, 'App', /Stoktok/)
    await choose(screen, 'Role', /Operator/)
    await userEvent.click(submit(screen, 'Review grant'))
    const dialog = screen.getByRole('dialog')
    await expect
      .element(dialog.getByText(/This role gives admin-level access/))
      .toBeVisible()
    await expect
      .element(
        dialog.getByText(
          /Grant Operator \(stoktok:operator\) in stoktok to Ada Lovelace/
        )
      )
      .toBeVisible()
    await expect.element(dialog.getByText(/app-wide/)).toBeVisible()
    expect(posts(seen)).toHaveLength(0)
    // A DOM click: the Review button mounts where Back was, and Playwright's
    // click would hit it as well.
    domClick(dialog.getByRole('button', { name: 'Back' }))
    expect(posts(seen)).toHaveLength(0)
    await userEvent.click(submit(screen, 'Review grant'))
    await userEvent.dblClick(dialog.getByRole('button', { name: 'Grant role' }))
    await expect.poll(() => posts(seen)).toHaveLength(1)
    expect(await bodyOf(posts(seen)[0])).toEqual({ role_id: OPERATOR_ID })
  })

  it('admin app and the signed-in user as target: Submit is aria-disabled with the reason; stoktok is allowed', async () => {
    const { client, seen } = fakeApi(assignmentsServer())
    const self = await renderDialog(client, userTarget(), {
      selfId: ADA.id.toUpperCase(),
    })
    await choose(self.screen, 'App', /Admin console/)
    await choose(self.screen, 'Role', /Super admin/)
    await expect
      .element(self.screen.getByText("You can't change your own admin roles."))
      .toBeVisible()
    await expect
      .element(submit(self.screen, 'Review grant'))
      .toHaveAttribute('aria-disabled', 'true')
    domClick(submit(self.screen, 'Review grant'))
    expect(posts(seen)).toHaveLength(0)
    await choose(self.screen, 'App', /Stoktok/)
    await choose(self.screen, 'Role', /Viewer/)
    await expect
      .element(submit(self.screen))
      .not.toHaveAttribute('aria-disabled', 'true')
  })

  it('a disabled target user gets a note, and Submit is still allowed', async () => {
    const { client } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, userTarget(ANNA))
    await expect
      .element(
        screen.getByText(
          "This account is disabled; they can't sign in until it is re-enabled."
        )
      )
      .toBeVisible()
    await choose(screen, 'App', /Stoktok/)
    await choose(screen, 'Role', /Viewer/)
    await expect
      .element(submit(screen))
      .not.toHaveAttribute('aria-disabled', 'true')
  })

  it('shows the effect hint under the summary before Submit', async () => {
    const { client } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, userTarget())
    await choose(screen, 'App', /Stoktok/)
    await choose(screen, 'Role', /Viewer/)
    await expect
      .element(screen.getByText(assignmentEffect('stoktok')))
      .toBeVisible()
    await expect
      .element(
        screen.getByText(
          /Grant Viewer \(stoktok:viewer\) in stoktok to Ada Lovelace/
        )
      )
      .toBeVisible()
  })
})

describe('RoleAssignDialog, errors', () => {
  async function grantWith(
    respond: () => Response | Promise<Response>,
    appRe = /Stoktok/,
    roleRe = /Viewer/
  ) {
    const base = assignmentsServer()
    const { client, seen } = fakeApi((req) =>
      req.method === 'POST' ? respond() : base(req)
    )
    const view = await renderDialog(client, userTarget())
    await choose(view.screen, 'App', appRe)
    await choose(view.screen, 'Role', roleRe)
    return { ...view, seen }
  }

  it('403 admin_wildcard_required shows the inline forbidden panel and keeps the dialog open', async () => {
    const { screen, onDone } = await grantWith(() =>
      apiError(403, 'admin_wildcard_required')
    )
    await userEvent.click(submit(screen))
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Only super admins can do this')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('422 expires_in_past is an error on the expiry field', async () => {
    const { screen } = await grantWith(() =>
      apiError(422, 'unprocessable', [
        { field: 'expires_at', reason: 'expires_in_past' },
      ])
    )
    await userEvent.fill(
      screen.getByLabelText('Expires (optional)'),
      '2099-01-02T03:04'
    )
    await userEvent.click(submit(screen))
    await expect
      .element(screen.getByText(/already past by the server's clock/))
      .toBeVisible()
    await expect
      .element(screen.getByLabelText('Expires (optional)'))
      .toHaveFocus()
  })

  it('422 unknown_org is an error on the organization field', async () => {
    const { screen } = await grantWith(
      () =>
        apiError(422, 'unprocessable', [
          { field: 'org_id', reason: 'unknown_org' },
        ]),
      /Calechip/,
      /Member/
    )
    await userEvent.click(submit(screen))
    await expect
      .element(screen.getByText('This organization no longer exists.'))
      .toBeVisible()
  })

  it('422 unknown_role is an error on the role field and the role list is refetched', async () => {
    const { screen, seen } = await grantWith(() =>
      apiError(422, 'unprocessable', [
        { field: 'role_id', reason: 'unknown_role' },
      ])
    )
    const loads = () =>
      seen.filter((r) => path(r) === '/api/v1/apps/stoktok/role-definitions')
        .length
    expect(loads()).toBe(1)
    await userEvent.click(submit(screen))
    await expect
      .element(
        screen.getByText(
          'This role no longer exists. The role list was refreshed.'
        )
      )
      .toBeVisible()
    await expect.poll(loads).toBe(2)
  })

  it('409, 404 and a network failure show fixed alerts; nothing is retried', async () => {
    const cases: [() => Response | Promise<Response>, string][] = [
      [
        () => apiError(409, 'conflict'),
        'This user already has this role in this scope',
      ],
      [() => apiError(404, 'not_found'), 'This user no longer exists.'],
      [
        () => Promise.reject(new TypeError('Failed to fetch')),
        "We couldn't confirm whether the role was granted.",
      ],
    ]
    for (const [respond, text] of cases) {
      const { screen, seen } = await grantWith(respond)
      await userEvent.click(submit(screen))
      await expect.element(screen.getByRole('alert')).toHaveTextContent(text)
      expect(posts(seen)).toHaveLength(1)
      await screen.unmount()
    }
  })
})

describe('RoleAssignDialog, role fixed', () => {
  it('names the role and the app and has no app or role selects', async () => {
    const { client } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, roleTarget())
    await expect
      .element(
        screen.getByRole('heading', { name: 'Assign Viewer (stoktok:viewer)' })
      )
      .toBeVisible()
    await expect.element(screen.getByText('in Stoktok')).toBeVisible()
    await expect
      .element(screen.getByRole('combobox', { name: 'App' }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('combobox', { name: 'Role' }))
      .not.toBeInTheDocument()
  })

  it('search fires on Search or Enter only, trims and never sends an empty email; one result is not auto-selected', async () => {
    const { client, seen } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, roleTarget())
    const input = screen.getByLabelText('Find a user by email')
    const searches = () => seen.filter((r) => path(r) === '/api/v1/users')
    await userEvent.fill(input, 'ada')
    await expect.element(input).toHaveValue('ada')
    expect(searches()).toHaveLength(0)
    await userEvent.fill(input, '   ')
    domClick(screen.getByRole('button', { name: 'Search' }))
    expect(searches()).toHaveLength(0)
    await userEvent.fill(input, '  ada  ')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await expect.element(screen.getByText('ada@example.com')).toBeVisible()
    expect(searchOf(searches()[0]).get('email')).toBe('ada')
    // Exactly one result: still nothing selected.
    // Negative assertions pass at once: let any auto-selection land first.
    await new Promise((r) => setTimeout(r, 100))
    await expect
      .element(submit(screen))
      .toHaveAttribute('aria-disabled', 'true')
    await expect.element(screen.getByText(/Selected:/)).not.toBeInTheDocument()
    domClick(submit(screen))
    expect(posts(seen)).toHaveLength(0)
    await searchFor(input, 'ann')
    await expect.element(screen.getByText('anna@example.com')).toBeVisible()
    expect(searches()).toHaveLength(2)
  })

  it('selecting shows "Selected: …" and the POST goes to that row\'s id; Change returns to the results', async () => {
    const { client, seen } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, roleTarget())
    await searchFor(screen.getByLabelText('Find a user by email'), 'ann')
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose ann@example.com' })
    )
    await expect
      .element(screen.getByText(/Selected: Ann Nguyen \(ann@example\.com\)/))
      .toBeVisible()
    await userEvent.click(submit(screen))
    await expect.poll(() => posts(seen)).toHaveLength(1)
    expect(path(posts(seen)[0])).toBe(
      `/api/v1/users/${ANN.id}/role-assignments`
    )
    expect(await bodyOf(posts(seen)[0])).toEqual({ role_id: VIEWER_ID })
  })

  it('editing the search text after a selection clears it; Change returns to the results', async () => {
    const { client } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, roleTarget())
    const input = screen.getByLabelText('Find a user by email')
    await searchFor(input, 'ann')
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose ann@example.com' })
    )
    await expect.element(screen.getByText(/Selected:/)).toBeVisible()
    await expect
      .element(submit(screen))
      .not.toHaveAttribute('aria-disabled', 'true')
    await userEvent.type(input, 'x')
    await expect.element(screen.getByText(/Selected:/)).not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('list', { name: 'Matching users' }))
      .not.toBeInTheDocument()
    await expect
      .element(submit(screen))
      .toHaveAttribute('aria-disabled', 'true')

    await userEvent.fill(input, 'ann')
    await userEvent.keyboard('{Enter}')
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose ann@example.com' })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Change' }))
    await expect
      .element(submit(screen))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(screen.getByRole('button', { name: 'Choose ann@example.com' }))
      .toBeVisible()
  })

  it('a late response for an old term never changes the list or the selection', async () => {
    let release: (r: Response) => void = () => {}
    const base = assignmentsServer()
    const { client } = fakeApi((req) =>
      path(req) === '/api/v1/users' && searchOf(req).get('email') === 'an'
        ? new Promise<Response>((resolve) => (release = resolve))
        : base(req)
    )
    const { screen } = await renderDialog(client, roleTarget())
    const input = screen.getByLabelText('Find a user by email')
    await searchFor(input, 'an')
    await expect.element(screen.getByText('Searching…')).toBeVisible()
    await searchFor(input, 'ann')
    await expect.element(screen.getByText('anna@example.com')).toBeVisible()
    release(json(pageOf([ADA], 10, 0)))
    await new Promise((r) => setTimeout(r, 50))
    await expect
      .element(screen.getByText('ada@example.com'))
      .not.toBeInTheDocument()
    await expect.element(screen.getByText('anna@example.com')).toBeVisible()
    await expect
      .element(submit(screen))
      .toHaveAttribute('aria-disabled', 'true')
  })

  it('shows "No users match.", "Refine the search." when there are more than 10, and a 403 panel', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...ADA,
      id: `0b9c6a2e-3f5d-4c1a-9a7e-${String(i).padStart(12, '0')}`,
      email: `bob${i}@example.com`,
    }))
    const { client } = fakeApi(assignmentsServer({ users: many }))
    const one = await renderDialog(client, roleTarget())
    await searchFor(one.screen.getByLabelText('Find a user by email'), 'zzz')
    await expect.element(one.screen.getByText('No users match.')).toBeVisible()
    await searchFor(one.screen.getByLabelText('Find a user by email'), 'bob')
    await expect
      .element(
        one.screen.getByText(/More than 10 users match. Refine the search./)
      )
      .toBeVisible()
    await one.screen.unmount()

    const denied = fakeApi(
      assignmentsServer({
        over: (req) =>
          path(req) === '/api/v1/users'
            ? apiError(403, 'permission_denied')
            : undefined,
      })
    )
    const two = await renderDialog(denied.client, roleTarget())
    await searchFor(two.screen.getByLabelText('Find a user by email'), 'a')
    await expect
      .element(two.screen.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
  })

  it('a display name with markup and U+202E renders as literal text inside bdi', async () => {
    const tricky: User = { ...ANN, display_name: '<b>x</b>\u202Eevil' }
    const { client } = fakeApi(assignmentsServer({ users: [tricky] }))
    const { screen } = await renderDialog(client, roleTarget())
    await searchFor(screen.getByLabelText('Find a user by email'), 'ann')
    const name = screen.getByText('<b>x</b>\u202Eevil')
    await expect.element(name).toBeVisible()
    expect((await name.element()).tagName).toBe('BDI')
    expect((await name.element()).querySelector('b')).toBeNull()
  })

  it('the email only appears in the users search request: not in a toast or any other URL', async () => {
    const { client, seen } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, roleTarget())
    await searchFor(screen.getByLabelText('Find a user by email'), 'ann')
    await userEvent.click(
      screen.getByRole('button', { name: 'Choose ann@example.com' })
    )
    await userEvent.click(submit(screen))
    await expect.poll(() => posts(seen)).toHaveLength(1)
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(JSON.stringify(vi.mocked(toast.success).mock.calls)).not.toContain(
      '@'
    )
    for (const r of seen) {
      if (path(r) === '/api/v1/users') continue
      expect(r.url).not.toContain('@')
      expect(r.url).not.toContain('ann')
    }
  })
})

describe('RoleAssignDialog, keyboard and missing input', () => {
  it('ArrowDown and Tab through the result rows never select one; Enter on a row does and focuses Change', async () => {
    const { client } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, roleTarget())
    await searchFor(screen.getByLabelText('Find a user by email'), 'ann')
    const row = screen.getByRole('button', { name: 'Choose ann@example.com' })
    await expect.element(row).toBeVisible()
    ;(row.element() as HTMLElement).focus()
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Tab}')
    await expect.element(screen.getByText(/Selected:/)).not.toBeInTheDocument()
    ;(row.element() as HTMLElement).focus()
    await userEvent.keyboard('{Enter}')
    await expect.element(screen.getByText(/Selected:/)).toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Change' }))
      .toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect
      .element(screen.getByLabelText('Find a user by email'))
      .toHaveFocus()
  })

  it('Grant with no user chosen shows "Choose a user." linked to the search input and focuses it; nothing is sent', async () => {
    const { client, seen } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, roleTarget())
    domClick(submit(screen))
    const input = screen.getByLabelText('Find a user by email')
    await expect.element(screen.getByText('Choose a user.')).toBeVisible()
    await expect.element(input).toHaveFocus()
    await expect.element(input).toHaveAttribute('aria-invalid', 'true')
    await expect.element(input).toHaveAccessibleDescription('Choose a user.')
    expect(posts(seen)).toHaveLength(0)
  })

  it('Grant with "One organization" and none chosen shows "Choose an organization." and focuses the org search', async () => {
    const { client, seen } = fakeApi(assignmentsServer())
    const { screen } = await renderDialog(client, userTarget())
    await choose(screen, 'App', /Calechip/)
    await choose(screen, 'Role', /Member/)
    await userEvent.click(
      screen.getByRole('radio', { name: 'One organization' })
    )
    domClick(submit(screen))
    const input = screen.getByLabelText('Find an organization')
    await expect
      .element(screen.getByText('Choose an organization.'))
      .toBeVisible()
    await expect.element(input).toHaveFocus()
    await expect
      .element(input)
      .toHaveAccessibleDescription('Choose an organization.')
    expect(posts(seen)).toHaveLength(0)
  })

  it('confirm step: focus moves to the summary, Back focuses Review, and an expiry that passed meanwhile returns to the form with the error focused', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2030-01-01T00:00:00'))
    try {
      const { client, seen } = fakeApi(assignmentsServer())
      const { screen } = await renderDialog(client, userTarget())
      await choose(screen, 'App', /Stoktok/)
      await choose(screen, 'Role', /Operator/)
      await userEvent.fill(
        screen.getByLabelText('Expires (optional)'),
        '2030-06-01T00:00'
      )
      await userEvent.click(submit(screen, 'Review grant'))
      const dialog = screen.getByRole('dialog')
      await expect
        .element(dialog.getByText(/This role gives admin-level access/))
        .toBeVisible()
      expect(
        (
          dialog.getByText(/Grant Operator/).element().parentElement as Element
        ).contains(document.activeElement)
      ).toBe(true)
      domClick(dialog.getByRole('button', { name: 'Back' }))
      await expect.element(submit(screen, 'Review grant')).toHaveFocus()
      await userEvent.click(submit(screen, 'Review grant'))
      vi.setSystemTime(new Date('2031-01-01T00:00:00'))
      await userEvent.click(dialog.getByRole('button', { name: 'Grant role' }))
      await expect
        .element(screen.getByText('Pick a time in the future.'))
        .toBeVisible()
      await expect
        .element(screen.getByLabelText('Expires (optional)'))
        .toHaveFocus()
      expect(posts(seen)).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
