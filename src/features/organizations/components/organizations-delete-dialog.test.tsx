import { apiError, fakeApi, json } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { ORGS, orgsPage } from './test-data'
import { renderOrganizations } from './test-fixtures'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

const deletes = (seen: Request[]) => seen.filter((r) => r.method === 'DELETE')
const lists = (seen: Request[]) => seen.filter((r) => r.method === 'GET')

function server(
  del: (req: Request) => Response,
  rows: () => typeof ORGS = () => ORGS
) {
  return fakeApi((req) =>
    req.method === 'DELETE' ? del(req) : json(orgsPage(rows()))
  )
}

async function openDelete(
  screen: Awaited<ReturnType<typeof renderOrganizations>>
) {
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for Acme Corp' })
  )
  await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
  return screen.getByRole('alertdialog')
}

describe('OrganizationsDeleteDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('says the deletion is permanent and names the org', async () => {
    const { client } = server(() => new Response(null, { status: 204 }))
    const screen = await renderOrganizations(client)
    const dialog = await openDelete(screen)
    await expect.element(dialog.getByText(/Permanently delete/)).toBeVisible()
    await expect.element(dialog.getByText('Acme Corp')).toBeVisible()
    await expect
      .element(dialog.getByText(/This cannot be undone/))
      .toBeVisible()
  })

  it('Delete stays disabled until the exact slug is typed (wrong case or partial stays disabled)', async () => {
    const { client } = server(() => new Response(null, { status: 204 }))
    const screen = await renderOrganizations(client)
    const dialog = await openDelete(screen)
    const del = dialog.getByRole('button', { name: 'Delete' })
    const input = dialog.getByLabelText('Type acme to confirm')
    await expect.element(del).toBeDisabled()
    await userEvent.fill(input, 'acm')
    await expect.element(del).toBeDisabled()
    await userEvent.fill(input, 'ACME')
    await expect.element(del).toBeDisabled()
    await userEvent.fill(input, 'acme')
    await expect.element(del).toBeEnabled()
  })

  it('confirm sends DELETE, handles 204, toasts, refetches; the row disappears; cancel sends nothing', async () => {
    let rows = ORGS
    const { client, seen } = server(
      () => {
        rows = ORGS.slice(1)
        return new Response(null, { status: 204 })
      },
      () => rows
    )
    const screen = await renderOrganizations(client)
    let dialog = await openDelete(screen)
    await userEvent.fill(dialog.getByLabelText('Type acme to confirm'), 'acme')
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(deletes(seen)).toHaveLength(0)

    dialog = await openDelete(screen)
    await expect
      .element(dialog.getByLabelText('Type acme to confirm'))
      .toHaveValue('')
    await userEvent.fill(dialog.getByLabelText('Type acme to confirm'), 'acme')
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }))
    await expect.element(dialog).not.toBeInTheDocument()

    expect(deletes(seen)).toHaveLength(1)
    expect(new URL(deletes(seen)[0].url).pathname).toBe(
      `/api/v1/organizations/${ORGS[0].id}`
    )
    expect(toast.success).toHaveBeenCalledWith(
      'Organization "Acme Corp" deleted.'
    )
    await expect.poll(() => lists(seen).length).toBe(2)
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .not.toBeInTheDocument()
  })

  it('Enter in the slug input submits only when it matches', async () => {
    const { client, seen } = server(() => new Response(null, { status: 204 }))
    const screen = await renderOrganizations(client)
    const dialog = await openDelete(screen)
    const input = dialog.getByLabelText('Type acme to confirm')
    await userEvent.fill(input, 'acm')
    await userEvent.keyboard('{Enter}')
    expect(deletes(seen)).toHaveLength(0)
    await userEvent.fill(input, 'acme')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => deletes(seen).length).toBe(1)
  })

  it('409 org_has_assignments shows the revoke-first message inline; dialog stays open', async () => {
    const { client } = server(() =>
      apiError(409, 'org_has_assignments', [
        { field: 'org_id', reason: 'org_has_assignments' },
      ])
    )
    const screen = await renderOrganizations(client)
    const dialog = await openDelete(screen)
    await userEvent.fill(dialog.getByLabelText('Type acme to confirm'), 'acme')
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('Revoke them first, then delete it.')
    await expect.element(dialog).toBeVisible()
  })

  it("403 inline panel; 404 'no longer exists' and the list refetches", async () => {
    const forbidden = server(() => apiError(403, 'permission_denied'))
    let screen = await renderOrganizations(forbidden.client)
    let dialog = await openDelete(screen)
    await userEvent.fill(dialog.getByLabelText('Type acme to confirm'), 'acme')
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
    await screen.unmount()

    const gone = server(() => apiError(404, 'not_found'))
    screen = await renderOrganizations(gone.client)
    dialog = await openDelete(screen)
    await userEvent.fill(dialog.getByLabelText('Type acme to confirm'), 'acme')
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('This organization no longer exists.')
    await expect.poll(() => lists(gone.seen).length).toBe(2)
  })
})
