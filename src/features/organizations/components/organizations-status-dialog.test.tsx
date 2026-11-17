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

const noop = () => {}
const patches = (seen: Request[]) => seen.filter((r) => r.method === 'PATCH')
const lists = (seen: Request[]) => seen.filter((r) => r.method === 'GET')

function server(
  patch: (req: Request) => Response | Promise<Response>,
  rows: () => typeof ORGS = () => ORGS
) {
  return fakeApi((req) =>
    req.method === 'PATCH' ? patch(req) : json(orgsPage(rows()))
  )
}

async function open(
  screen: Awaited<ReturnType<typeof renderOrganizations>>,
  name: string,
  action: RegExp
) {
  await userEvent.click(
    screen.getByRole('button', { name: `Actions for ${name}` })
  )
  await userEvent.click(screen.getByRole('menuitem', { name: action }))
  return screen.getByRole('alertdialog')
}

describe('OrganizationsStatusDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it("suspend: confirm names the org and sends PATCH {status:'suspended'}; cancel sends nothing", async () => {
    const { client, seen } = server(() =>
      json({ ...ORGS[0], status: 'suspended' })
    )
    const screen = await renderOrganizations(client)
    let dialog = await open(screen, 'Acme Corp', /Suspend/)
    await expect.element(dialog.getByText('Acme Corp')).toBeVisible()
    await expect.element(dialog.getByText(/acme/)).toBeVisible()
    await expect
      .element(
        dialog.getByText(/Access already granted lasts until it expires/)
      )
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(patches(seen)).toHaveLength(0)

    dialog = await open(screen, 'Acme Corp', /Suspend/)
    await userEvent.click(dialog.getByRole('button', { name: 'Suspend' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await patches(seen)[0].json()).toEqual({ status: 'suspended' })
    expect(toast.success).toHaveBeenCalledWith(
      'Organization "Acme Corp" suspended.'
    )
    await expect.poll(() => lists(seen).length).toBe(2)
  })

  it("reactivate: offered for suspended orgs, sends PATCH {status:'active'}", async () => {
    const { client, seen } = server(() =>
      json({ ...ORGS[1], status: 'active' })
    )
    const screen = await renderOrganizations(client)
    const dialog = await open(screen, 'Globex', /Reactivate/)
    await userEvent.click(dialog.getByRole('button', { name: 'Reactivate' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await patches(seen)[0].json()).toEqual({ status: 'active' })
    expect(toast.success).toHaveBeenCalledWith(
      'Organization "Globex" reactivated.'
    )
  })

  it('pending: dialog open, buttons aria-disabled, "Suspending…"; the badge changes only after the refetch', async () => {
    let release: (r: Response) => void = noop
    let status: 'active' | 'suspended' = 'active'
    const { client } = server(
      () => new Promise<Response>((resolve) => (release = resolve)),
      () => [{ ...ORGS[0], status }, ...ORGS.slice(1)]
    )
    const screen = await renderOrganizations(client)
    const table = screen.getByRole('table', { name: 'Organizations' })
    await expect
      .element(table.getByText('Active', { exact: true }).first())
      .toBeVisible()
    const dialog = await open(screen, 'Acme Corp', /Suspend/)
    await userEvent.click(dialog.getByRole('button', { name: 'Suspend' }))

    await expect
      .element(dialog.getByRole('button', { name: 'Suspending…' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(dialog.getByRole('button', { name: 'Cancel' }))
      .toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).toBeVisible()
    expect(
      screen.getByText('Suspended', { exact: true }).elements()
    ).toHaveLength(1)

    status = 'suspended'
    release(json({ ...ORGS[0], status }))
    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .poll(
        () => screen.getByText('Suspended', { exact: true }).elements().length
      )
      .toBe(2)
  })

  it('403 / 404 / other errors are shown inline; dialog stays open', async () => {
    for (const [res, text] of [
      [
        apiError(403, 'permission_denied'),
        "You don't have permission to do this",
      ],
      [apiError(404, 'not_found'), 'This organization no longer exists.'],
      [apiError(500, 'internal_error'), 'server text'],
    ] as const) {
      const { client } = server(() => res.clone())
      const screen = await renderOrganizations(client)
      const dialog = await open(screen, 'Acme Corp', /Suspend/)
      await userEvent.click(dialog.getByRole('button', { name: 'Suspend' }))
      await expect.element(dialog.getByRole('alert')).toHaveTextContent(text)
      await expect.element(dialog).toBeVisible()
      await screen.unmount()
    }
  })
})
