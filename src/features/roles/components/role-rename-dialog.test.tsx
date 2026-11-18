import { apiError, fakeApi, json } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { VIEWER_ID } from './test-data'
import { renderRoles, rolesServer, writes } from './test-fixtures'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

type Screen = Awaited<ReturnType<typeof renderRoles>>
const path = (r: Request) => new URL(r.url).pathname

async function open(screen: Screen, key: string) {
  await userEvent.click(
    screen.getByRole('button', { name: `Actions for ${key}` })
  )
  await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
  const dialog = screen.getByRole('dialog')
  await expect
    .element(dialog.getByRole('textbox', { name: 'Name' }))
    .toBeVisible()
  return dialog
}
const listCalls = (seen: Request[]) =>
  seen.filter(
    (r) => r.method === 'GET' && path(r).endsWith('/role-definitions')
  )

describe('RoleRenameDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('prefilled with the name; unchanged (after trim) -> closes with no request', async () => {
    const { client, seen } = fakeApi(rolesServer(() => json({})))
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen, 'stoktok:viewer')
    const input = dialog.getByRole('textbox', { name: 'Name' })
    await expect.element(input).toHaveValue('Viewer')
    await userEvent.fill(input, '  Viewer ')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen)).toHaveLength(0)
  })

  it("sends PATCH {name} only; toast; refetch; focus returns to the row's actions button", async () => {
    const { client, seen } = fakeApi(
      rolesServer(() =>
        json({
          id: VIEWER_ID,
          key: 'stoktok:viewer',
          name: 'Reader',
          is_system: false,
          permissions: [],
        })
      )
    )
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen, 'stoktok:viewer')
    const before = listCalls(seen).length
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Name' }),
      'Reader'
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await expect.element(dialog).not.toBeInTheDocument()
    const [patch] = writes(seen)
    expect(patch.method).toBe('PATCH')
    expect(path(patch)).toBe(`/api/v1/apps/stoktok/roles/${VIEWER_ID}`)
    expect(await patch.json()).toEqual({ name: 'Reader' })
    expect(toast.success).toHaveBeenCalledWith('Role stoktok:viewer renamed.')
    await expect.poll(() => listCalls(seen).length).toBeGreaterThan(before)
    await expect
      .element(
        screen.getByRole('button', { name: 'Actions for stoktok:viewer' })
      )
      .toHaveFocus()
  })

  it("422 name error on the field; 404 -> 'This role no longer exists.'", async () => {
    let next: Response = apiError(422, 'validation_error', [
      { type: 'string_too_long', loc: ['body', 'name'], msg: 'Too long' },
    ])
    const { client } = fakeApi(
      rolesServer((req) => (req.method === 'PATCH' ? next.clone() : json({})))
    )
    const screen = await renderRoles(client, { search: { app: 'stoktok' } })
    const dialog = await open(screen, 'stoktok:viewer')
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Name' }),
      'Reader'
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await expect.element(dialog.getByText('Too long')).toBeVisible()
    next = apiError(404, 'not_found')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('This role no longer exists.')
  })

  it('admin app: 403 admin_wildcard_required inline', async () => {
    const { client } = fakeApi(
      rolesServer((req) =>
        req.method === 'PATCH'
          ? apiError(403, 'admin_wildcard_required')
          : json({})
      )
    )
    const screen = await renderRoles(client, { search: { app: 'admin' } })
    const dialog = await open(screen, 'admin:super-admin')
    await expect
      .element(dialog.getByText(/need the admin:\* permission/))
      .toBeVisible()
    await userEvent.fill(dialog.getByRole('textbox', { name: 'Name' }), 'Root')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await expect
      .element(dialog.getByText('Only super admins can do this'))
      .toBeVisible()
  })
})
