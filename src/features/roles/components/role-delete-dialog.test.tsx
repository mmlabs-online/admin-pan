import { apiError, fakeApi, json } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { OPERATOR_ID } from './test-data'
import { renderRoles, rolesServer, writes } from './test-fixtures'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

type Screen = Awaited<ReturnType<typeof renderRoles>>
const path = (r: Request) => new URL(r.url).pathname
const noContent = () => new Response(null, { status: 204 })

async function open(screen: Screen, key = 'stoktok:operator') {
  await userEvent.click(
    screen.getByRole('button', { name: `Actions for ${key}` })
  )
  await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
  return screen.getByRole('alertdialog')
}
const listCalls = (seen: Request[]) =>
  seen.filter(
    (r) => r.method === 'GET' && path(r).endsWith('/role-definitions')
  )
const stoktok = { search: { app: 'stoktok' } }

describe('RoleDeleteDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it("confirm names 'Operator (stoktok:operator)'; Cancel sends nothing", async () => {
    const { client, seen } = fakeApi(rolesServer(noContent))
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await expect
      .element(dialog.getByText('Operator', { exact: true }))
      .toBeVisible()
    await expect
      .element(dialog.getByText(/\(\s*stoktok:operator\)/))
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen)).toHaveLength(0)
  })

  it('confirm sends one DELETE (double-click too) to the row id; toast; list refetched; focus to New role', async () => {
    const { client, seen } = fakeApi(rolesServer(noContent))
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    const before = listCalls(seen).length
    await userEvent.dblClick(dialog.getByRole('button', { name: 'Delete' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen).map((r) => `${r.method} ${path(r)}`)).toEqual([
      `DELETE /api/v1/apps/stoktok/roles/${OPERATOR_ID}`,
    ])
    expect(toast.success).toHaveBeenCalledWith('Role stoktok:operator deleted.')
    await expect.poll(() => listCalls(seen).length).toBeGreaterThan(before)
    await expect
      .element(screen.getByRole('button', { name: 'New role' }))
      .toHaveFocus()
  })

  it('409 conflict shows the fixed reason text plus the API message inline (role=alert, aria-describedby); dialog stays open', async () => {
    const { client } = fakeApi(rolesServer(() => apiError(409, 'conflict')))
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }))
    const alert = dialog.getByRole('alert')
    await expect.element(alert).toHaveTextContent("This role can't be deleted")
    await expect.element(alert).toHaveTextContent('server text')
    await expect.element(dialog).toBeVisible()
    const confirm = dialog.getByRole('button', { name: 'Delete' })
    const describedBy = (confirm.element() as HTMLElement).getAttribute(
      'aria-describedby'
    )
    expect(describedBy).toBeTruthy()
    expect(
      document.getElementById(describedBy as string)?.textContent
    ).toContain("This role can't be deleted")
  })

  it("404 -> 'This role no longer exists.' and refetch; 403 admin_wildcard_required inline", async () => {
    let next: Response = apiError(404, 'not_found')
    const { client, seen } = fakeApi(
      rolesServer((req) => (req.method === 'DELETE' ? next.clone() : json({})))
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    const before = listCalls(seen).length
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('This role no longer exists.')
    await expect.poll(() => listCalls(seen).length).toBeGreaterThan(before)
    next = apiError(403, 'admin_wildcard_required')
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }))
    await expect
      .element(dialog.getByText('Only super admins can do this'))
      .toBeVisible()
  })
})
