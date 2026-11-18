import { apiError, fakeApi, json } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { renderRoles, rolesServer, writes } from './test-fixtures'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

const NEW_ID = 'e1000001-0000-4000-8000-000000000001'
const created = (key: string, name: string) =>
  json({ id: NEW_ID, key, name, is_system: false, permissions: [] }, 201)
const path = (r: Request) => new URL(r.url).pathname
type Screen = Awaited<ReturnType<typeof renderRoles>>

async function open(screen: Screen) {
  await userEvent.click(screen.getByRole('button', { name: 'New role' }))
  const dialog = screen.getByRole('dialog')
  await expect
    .element(dialog.getByRole('textbox', { name: 'Key' }))
    .toBeVisible()
  return dialog
}
async function fill(
  dialog: ReturnType<Screen['getByRole']>,
  segment: string,
  name: string
) {
  await userEvent.fill(dialog.getByRole('textbox', { name: 'Key' }), segment)
  await userEvent.fill(dialog.getByRole('textbox', { name: 'Name' }), name)
}
const check = (dialog: ReturnType<Screen['getByRole']>, key: string) =>
  userEvent.click(dialog.getByRole('checkbox', { name: key }))
const submit = (dialog: ReturnType<Screen['getByRole']>) =>
  userEvent.click(dialog.getByRole('button', { name: 'Create role' }))
const listCalls = (seen: Request[]) =>
  seen.filter(
    (r) => r.method === 'GET' && path(r).endsWith('/role-definitions')
  )

/** Stoktok roles page, POST -> 201, PUT -> `put`. */
function server(put: () => Response | Promise<Response>) {
  return rolesServer((req) =>
    req.method === 'POST'
      ? created('stoktok:auditor', 'Auditor')
      : req.method === 'PUT'
        ? put()
        : json({})
  )
}
const putOk = () =>
  json({
    id: NEW_ID,
    key: 'stoktok:auditor',
    name: 'Auditor',
    is_system: false,
    permissions: [],
  })

describe('RoleCreateDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it("key prefix '{app}:' shown read-only; client validation (segment, name) sends nothing", async () => {
    const { client, seen } = fakeApi(server(putOk))
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen)
    await expect
      .element(dialog.getByText('stoktok:', { exact: true }))
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Create role' }))
    await expect.element(dialog.getByText('Key is required.')).toBeVisible()
    await expect.element(dialog.getByText('Name is required.')).toBeVisible()
    await fill(dialog, 'Bad_Key', 'X')
    await submit(dialog)
    await expect
      .element(dialog.getByText(/Use 1–48 lowercase letters/))
      .toBeVisible()
    expect(writes(seen)).toHaveLength(0)
  })

  it('POST {key,name} then PUT {permission_keys} to the id from the POST response; toast; close; list refetched', async () => {
    const { client, seen } = fakeApi(server(putOk))
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen)
    await fill(dialog, 'auditor', 'Auditor')
    await check(dialog, 'stoktok:orders:write')
    await check(dialog, 'stoktok:orders:read')
    await submit(dialog)
    await expect.element(dialog).not.toBeInTheDocument()
    const [post, put] = writes(seen)
    expect(post.method).toBe('POST')
    expect(path(post)).toBe('/api/v1/apps/stoktok/roles')
    expect(await post.json()).toEqual({
      key: 'stoktok:auditor',
      name: 'Auditor',
    })
    expect(put.method).toBe('PUT')
    expect(path(put)).toBe(`/api/v1/apps/stoktok/roles/${NEW_ID}/permissions`)
    expect(await put.json()).toEqual({
      permission_keys: ['stoktok:orders:read', 'stoktok:orders:write'],
    })
    expect(toast.success).toHaveBeenCalledWith(
      'Role stoktok:auditor created with 2 permissions.'
    )
    await expect.poll(() => listCalls(seen).length).toBeGreaterThan(1)
  })

  it('no permissions chosen -> POST only, no PUT', async () => {
    const { client, seen } = fakeApi(server(putOk))
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen)
    await fill(dialog, 'auditor', 'Auditor')
    await submit(dialog)
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen).map((r) => r.method)).toEqual(['POST'])
    expect(toast.success).toHaveBeenCalledWith('Role stoktok:auditor created.')
  })

  it('POST 201 then PUT 403 admin_wildcard_required -> partial phase: alert names the role and says permissions were not saved; key/name read-only; list refetched; exactly one POST', async () => {
    const { client, seen } = fakeApi(
      server(() => apiError(403, 'admin_wildcard_required'))
    )
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen)
    await fill(dialog, 'auditor', 'Auditor')
    await check(dialog, 'stoktok:orders:read')
    const before = listCalls(seen).length
    await submit(dialog)
    const alert = dialog.getByRole('alert').first()
    await expect
      .element(alert)
      .toHaveTextContent(
        "Role stoktok:auditor was created, but its permissions weren't saved."
      )
    await expect
      .element(alert)
      .toHaveTextContent('Only super admins can do this')
    await expect
      .element(dialog.getByRole('textbox', { name: 'Key' }))
      .toHaveAttribute('readonly')
    await expect
      .element(dialog.getByRole('textbox', { name: 'Name' }))
      .toHaveAttribute('readonly')
    await expect.poll(() => listCalls(seen).length).toBeGreaterThan(before)
    expect(writes(seen, 'POST')).toHaveLength(1)
  })

  it('partial: Retry saving permissions sends only the PUT (POSTs 1, PUTs 2); success closes', async () => {
    let fail = true
    const { client, seen } = fakeApi(
      server(() => (fail ? apiError(500, 'internal') : putOk()))
    )
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen)
    await fill(dialog, 'auditor', 'Auditor')
    await check(dialog, 'stoktok:orders:read')
    await submit(dialog)
    await expect
      .element(dialog.getByRole('button', { name: 'Retry saving permissions' }))
      .toBeVisible()
    fail = false
    await userEvent.click(
      dialog.getByRole('button', { name: 'Retry saving permissions' })
    )
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen, 'POST')).toHaveLength(1)
    expect(writes(seen, 'PUT')).toHaveLength(2)
  })

  it('partial: pressing Enter in a field sends nothing (no submit button, no second POST)', async () => {
    const { client, seen } = fakeApi(server(() => apiError(500, 'internal')))
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen)
    await fill(dialog, 'auditor', 'Auditor')
    await check(dialog, 'stoktok:orders:read')
    await submit(dialog)
    await expect
      .element(dialog.getByRole('button', { name: 'Retry saving permissions' }))
      .toBeVisible()
    await userEvent.click(dialog.getByRole('textbox', { name: 'Name' }))
    await userEvent.keyboard('{Enter}')
    await new Promise((r) => setTimeout(r, 200))
    expect(writes(seen, 'POST')).toHaveLength(1)
    expect(writes(seen, 'PUT')).toHaveLength(1)
  })

  it('partial: Close leaves the role; no further request', async () => {
    const { client, seen } = fakeApi(server(() => apiError(500, 'internal')))
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen)
    await fill(dialog, 'auditor', 'Auditor')
    await check(dialog, 'stoktok:orders:read')
    await submit(dialog)
    await expect
      .element(dialog.getByRole('button', { name: 'Retry saving permissions' }))
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Close' }).first())
    await expect.element(dialog).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 200))
    expect(writes(seen, 'POST')).toHaveLength(1)
    expect(writes(seen, 'PUT')).toHaveLength(1)
    expect(seen.filter((r) => r.method !== 'GET')).toHaveLength(2)
  })

  it('partial: PUT 422 unknown_permission names the key; the selection is still editable before retry', async () => {
    const { client } = fakeApi(
      server(() =>
        apiError(422, 'unprocessable', [
          {
            field: 'permission_keys',
            reason: 'unknown_permission',
            key: 'stoktok:orders:read',
          },
        ])
      )
    )
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen)
    await fill(dialog, 'auditor', 'Auditor')
    await check(dialog, 'stoktok:orders:read')
    await submit(dialog)
    await expect
      .element(dialog.getByRole('alert').first())
      .toHaveTextContent(
        'These permissions no longer exist: stoktok:orders:read.'
      )
    await check(dialog, 'stoktok:orders:read')
    await expect
      .element(dialog.getByRole('checkbox', { name: 'stoktok:orders:read' }))
      .not.toBeChecked()
  })

  it("double-click on Create sends one POST; pending 'Creating…', aria-disabled, Escape ignored", async () => {
    let release: (r: Response) => void = () => {}
    const base = server(putOk)
    const { client, seen } = fakeApi((req) =>
      req.method === 'POST'
        ? new Promise<Response>((resolve) => (release = resolve))
        : base(req)
    )
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen)
    await fill(dialog, 'auditor', 'Auditor')
    const button = dialog.getByRole('button', { name: 'Create role' })
    await userEvent.dblClick(button)
    const pending = dialog.getByRole('button', { name: 'Creating…' })
    await expect.element(pending).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).toBeVisible()
    expect(writes(seen, 'POST')).toHaveLength(1)
    release(created('stoktok:auditor', 'Auditor'))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen, 'POST')).toHaveLength(1)
  })

  it("POST 500: couldn't-confirm alert; list refetched; no automatic POST; a manual resubmit that gets 409 shows the 'may have just been created' text on Key", async () => {
    let status = 500
    const { client, seen } = fakeApi(
      rolesServer((req) =>
        req.method === 'POST'
          ? status === 500
            ? apiError(500, 'internal')
            : apiError(409, 'conflict')
          : json({})
      )
    )
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen)
    await fill(dialog, 'auditor', 'Auditor')
    const before = listCalls(seen).length
    await submit(dialog)
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent("We couldn't confirm whether the role was created")
    await expect.poll(() => listCalls(seen).length).toBeGreaterThan(before)
    await new Promise((r) => setTimeout(r, 200))
    expect(writes(seen, 'POST')).toHaveLength(1)
    status = 409
    await submit(dialog)
    await expect
      .element(
        dialog.getByText(/It may have just been created; check the list\./)
      )
      .toBeVisible()
    expect(writes(seen, 'POST')).toHaveLength(2)
  })

  it('409 key taken -> Key field error focused; 422 prefix_mismatch -> Key', async () => {
    let next: Response = apiError(409, 'conflict')
    const { client } = fakeApi(
      rolesServer((req) => (req.method === 'POST' ? next.clone() : json({})))
    )
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen)
    await fill(dialog, 'viewer', 'Viewer')
    await submit(dialog)
    await expect
      .element(dialog.getByText('A role with this key already exists.'))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('textbox', { name: 'Key' }))
      .toHaveFocus()
    next = apiError(422, 'unprocessable', [
      { field: 'key', reason: 'prefix_mismatch' },
    ])
    await submit(dialog)
    await expect
      .element(dialog.getByText('The key must start with stoktok:'))
      .toBeVisible()
  })

  it('admin app: note shown; admin:* checkbox disabled; POST 403 shown inline, no PUT', async () => {
    const { client, seen } = fakeApi(
      rolesServer((req) =>
        req.method === 'POST'
          ? apiError(403, 'admin_wildcard_required')
          : json({})
      )
    )
    const screen = await renderRoles(client, { search: { app: 'admin' } })
    const dialog = await open(screen)
    await expect
      .element(dialog.getByText(/need the admin:\* permission/))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('checkbox', { name: 'admin:*' }))
      .toBeDisabled()
    await fill(dialog, 'support', 'Support')
    await check(dialog, 'admin:apps:read')
    await submit(dialog)
    await expect
      .element(dialog.getByText('Only super admins can do this'))
      .toBeVisible()
    expect(writes(seen).map((r) => r.method)).toEqual(['POST'])
  })

  it('picker list loading/error: Create stays usable with no permissions selected; error offers Retry', async () => {
    let fail = true
    const base = server(putOk)
    const { client, seen } = fakeApi((req) =>
      path(req).endsWith('/permissions') && fail
        ? apiError(500, 'internal')
        : base(req)
    )
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen)
    await expect
      .element(dialog.getByText("Couldn't load the permission list."))
      .toBeVisible()
    fail = false
    await userEvent.click(dialog.getByRole('button', { name: 'Retry' }))
    await expect
      .element(dialog.getByRole('checkbox', { name: 'stoktok:orders:read' }))
      .toBeVisible()
    await fill(dialog, 'auditor', 'Auditor')
    await submit(dialog)
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen).map((r) => r.method)).toEqual(['POST'])
  })
})
