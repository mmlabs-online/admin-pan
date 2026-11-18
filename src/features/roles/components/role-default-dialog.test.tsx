import { apiError, fakeApi, json } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { APPS, OPERATOR_ID, ROLES, VIEWER_ID } from './test-data'
import { renderRoles, rolesServer, writes } from './test-fixtures'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

type Screen = Awaited<ReturnType<typeof renderRoles>>
const path = (r: Request) => new URL(r.url).pathname
const stoktok = { search: { app: 'stoktok' } }

async function open(screen: Screen, key = 'stoktok:viewer') {
  await userEvent.click(
    screen.getByRole('button', { name: `Actions for ${key}` })
  )
  await userEvent.click(
    screen.getByRole('menuitem', { name: /Set as default/ })
  )
  return screen.getByRole('alertdialog')
}

describe('RoleDefaultDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('confirm names the role and the app; Cancel sends nothing; confirm sends PATCH /apps/{key} {default_role_id: row.id} only; the Default badge moves only after the refetch', async () => {
    let defaultId: string | null = null
    const apps = () =>
      APPS.map((a) =>
        a.key === 'stoktok' ? { ...a, default_role_id: defaultId } : a
      )
    const roles = (k: string) =>
      (ROLES[k] ?? []).map((r) => ({ ...r, is_default: r.id === defaultId }))
    let release: (r: Response) => void = () => {}
    const { client, seen } = fakeApi(
      rolesServer(
        (req) => {
          if (req.method !== 'PATCH') return json({})
          return new Promise<Response>((resolve) => {
            release = (r) => {
              defaultId = VIEWER_ID
              resolve(r)
            }
          })
        },
        { apps, roles }
      )
    )
    const screen = await renderRoles(client, stoktok)
    let dialog = await open(screen)
    await expect
      .element(dialog.getByText('Viewer', { exact: true }))
      .toBeVisible()
    await expect
      .element(dialog.getByText(/New members of Stoktok/))
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen)).toHaveLength(0)

    dialog = await open(screen)
    await userEvent.click(dialog.getByRole('button', { name: 'Make default' }))
    await expect
      .element(dialog.getByRole('button', { name: 'Saving…' }))
      .toHaveAttribute('aria-disabled', 'true')
    // Nothing is optimistic: still no badge while the PATCH is pending.
    await expect
      .element(screen.getByText('Default', { exact: true }))
      .not.toBeInTheDocument()
    release(json({ ...APPS[3], default_role_id: VIEWER_ID }))
    await expect.element(dialog).not.toBeInTheDocument()
    const [patch] = writes(seen)
    expect(patch.method).toBe('PATCH')
    expect(path(patch)).toBe('/api/v1/apps/stoktok')
    expect(await patch.json()).toEqual({ default_role_id: VIEWER_ID })
    expect(toast.success).toHaveBeenCalledWith(
      'stoktok:viewer is now the default role of Stoktok.'
    )
    const row = screen.getByRole('row').filter({ hasText: 'stoktok:viewer' })
    await expect
      .element(row.getByText('Default', { exact: true }))
      .toBeVisible()
  })

  it('422 role_has_admin_permissions / role_has_org_permissions / unknown_role / same_as_default_role -> fixed copy inline', async () => {
    let reason = 'role_has_admin_permissions'
    const { client } = fakeApi(
      rolesServer((req) =>
        req.method === 'PATCH'
          ? apiError(422, 'unprocessable', [
              { field: 'default_role_id', reason },
            ])
          : json({})
      )
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    const expected: Record<string, string> = {
      role_has_admin_permissions: 'holds admin-only permissions',
      role_has_org_permissions: 'org-scoped permissions',
      unknown_role: 'This role no longer exists.',
      same_as_default_role: "org owner role, so it can't also be the default",
    }
    for (const [r, text] of Object.entries(expected)) {
      reason = r
      await userEvent.click(
        dialog.getByRole('button', { name: 'Make default' })
      )
      await expect.element(dialog.getByRole('alert')).toHaveTextContent(text)
    }
  })

  it('privileged role: confirm shows the admin-only hint; request still sent; 422 shown', async () => {
    const { client, seen } = fakeApi(
      rolesServer((req) =>
        req.method === 'PATCH'
          ? apiError(422, 'unprocessable', [
              {
                field: 'default_role_id',
                reason: 'role_has_admin_permissions',
              },
            ])
          : json({})
      )
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen, 'stoktok:operator')
    await expect
      .element(dialog.getByText(/the API refuses those on a default role/))
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Make default' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('holds admin-only permissions')
    expect(await writes(seen)[0].json()).toEqual({
      default_role_id: OPERATOR_ID,
    })
  })

  it('403 permission_denied inline', async () => {
    const { client } = fakeApi(
      rolesServer((req) =>
        req.method === 'PATCH' ? apiError(403, 'permission_denied') : json({})
      )
    )
    const screen = await renderRoles(client, stoktok)
    const dialog = await open(screen)
    await userEvent.click(dialog.getByRole('button', { name: 'Make default' }))
    await expect
      .element(dialog.getByText("You don't have permission to do this"))
      .toBeVisible()
  })
})
