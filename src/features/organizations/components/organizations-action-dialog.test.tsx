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
const writes = (seen: Request[], method: string) =>
  seen.filter((r) => r.method === method)
const lists = (seen: Request[]) =>
  seen.filter(
    (r) =>
      r.method === 'GET' && new URL(r.url).pathname === '/api/v1/organizations'
  )

function server(write: (req: Request) => Response | Promise<Response>) {
  return fakeApi((req) =>
    req.method === 'GET' ? json(orgsPage()) : write(req)
  )
}

async function openCreate(
  screen: Awaited<ReturnType<typeof renderOrganizations>>
) {
  await userEvent.click(
    screen.getByRole('button', { name: 'New organization' })
  )
  return screen.getByRole('dialog', { name: 'New organization' })
}

async function fillCreate(
  dialog: Awaited<ReturnType<typeof openCreate>>,
  name: string,
  slug: string
) {
  await userEvent.fill(dialog.getByRole('textbox', { name: 'Name' }), name)
  await userEvent.fill(dialog.getByRole('textbox', { name: 'Slug' }), slug)
  await userEvent.click(
    dialog.getByRole('button', { name: 'Create organization' })
  )
}

async function openEdit(
  screen: Awaited<ReturnType<typeof renderOrganizations>>
) {
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for Acme Corp' })
  )
  await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
  return screen.getByRole('dialog', { name: 'Edit organization' })
}

describe('Organization create/edit dialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('client validation: required, slug pattern, 63/255/5000 limits; no request sent', async () => {
    const { client, seen } = server(() => json(ORGS[0]))
    const screen = await renderOrganizations(client)
    const dialog = await openCreate(screen)
    const submit = dialog.getByRole('button', { name: 'Create organization' })

    await userEvent.click(submit)
    await expect.element(dialog.getByText('Name is required.')).toBeVisible()
    await expect.element(dialog.getByText('Slug is required.')).toBeVisible()

    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Slug' }),
      'Bad Slug!'
    )
    await userEvent.click(submit)
    await expect
      .element(dialog.getByText(/^Use lowercase letters, digits and hyphens/))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('textbox', { name: 'Slug' }))
      .toHaveAttribute('aria-invalid', 'true')

    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Slug' }),
      'a'.repeat(64)
    )
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Name' }),
      'n'.repeat(256)
    )
    await userEvent.fill(
      dialog.getByRole('textbox', { name: /Description/ }),
      'd'.repeat(5001)
    )
    await userEvent.click(submit)
    await expect
      .element(dialog.getByText('Use at most 63 characters.'))
      .toBeVisible()
    await expect
      .element(dialog.getByText('Use at most 255 characters.'))
      .toBeVisible()
    await expect
      .element(dialog.getByText('Use at most 5000 characters.'))
      .toBeVisible()
    expect(writes(seen, 'POST')).toHaveLength(0)
  })

  it('create sends POST {slug,name,description:null}, closes, toasts, refetches the list', async () => {
    const { client, seen } = server(() => json(ORGS[0], 201))
    const screen = await renderOrganizations(client)
    const dialog = await openCreate(screen)
    await fillCreate(dialog, 'Umbrella', 'umbrella')
    await expect.element(dialog).not.toBeInTheDocument()

    expect(writes(seen, 'POST')).toHaveLength(1)
    expect(await writes(seen, 'POST')[0].json()).toEqual({
      slug: 'umbrella',
      name: 'Umbrella',
      description: null,
    })
    expect(toast.success).toHaveBeenCalledWith(
      'Organization "Umbrella" created.'
    )
    await expect.poll(() => lists(seen).length).toBe(2)
  })

  it('409 conflict on create sets the error on the slug field, focuses it, keeps the dialog open and values', async () => {
    const { client } = server(() => apiError(409, 'conflict'))
    const screen = await renderOrganizations(client)
    const dialog = await openCreate(screen)
    await fillCreate(dialog, 'Acme 2', 'acme')

    const message = dialog.getByText(
      'An organization with this slug already exists.'
    )
    await expect.element(message).toBeVisible()
    const slug = dialog.getByRole('textbox', { name: 'Slug' })
    await expect.element(slug).toHaveAttribute('aria-invalid', 'true')
    await expect
      .element(slug)
      .toHaveAttribute(
        'aria-describedby',
        expect.stringContaining(message.element().id)
      )
    await expect.element(slug).toHaveFocus()
    await expect.element(slug).toHaveValue('acme')
    await expect
      .element(dialog.getByRole('textbox', { name: 'Name' }))
      .toHaveValue('Acme 2')
    await expect
      .element(dialog.getByText('server text'))
      .not.toBeInTheDocument()
  })

  it('422 maps details to fields', async () => {
    const { client } = server(() =>
      apiError(422, 'validation_error', [
        {
          type: 'string_pattern_mismatch',
          loc: ['body', 'slug'],
          msg: 'Slug is not valid',
        },
      ])
    )
    const screen = await renderOrganizations(client)
    const dialog = await openCreate(screen)
    await fillCreate(dialog, 'Umbrella', 'umbrella')
    await expect.element(dialog.getByText('Slug is not valid')).toBeVisible()
    await expect.element(dialog).toBeVisible()
  })

  it('403 shows the inline ForbiddenPanel; dialog stays open', async () => {
    const { client } = server(() => apiError(403, 'permission_denied'))
    const screen = await renderOrganizations(client)
    const dialog = await openCreate(screen)
    await fillCreate(dialog, 'Umbrella', 'umbrella')
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
    await expect.element(dialog).toBeVisible()
  })

  it("pending: 'Creating…', aria-disabled, sr-only status; Escape does not close; a second click sends no second POST", async () => {
    let release: (r: Response) => void = noop
    const { client, seen } = server(
      () => new Promise<Response>((resolve) => (release = resolve))
    )
    const screen = await renderOrganizations(client)
    const dialog = await openCreate(screen)
    await fillCreate(dialog, 'Umbrella', 'umbrella')

    const busy = dialog.getByRole('button', { name: 'Creating…' })
    await expect.element(busy).toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(dialog.getByRole('status'))
      .toHaveTextContent('Creating…')
    // Playwright's click waits for "enabled", which aria-disabled fails.
    ;(busy.element() as HTMLElement).click()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).toBeVisible()
    expect(writes(seen, 'POST')).toHaveLength(1)

    release(json(ORGS[0], 201))
    await expect.element(dialog).not.toBeInTheDocument()
  })

  it('edit: prefilled, slug read-only, sends PATCH {name, description} without slug; success closes and refetches', async () => {
    const { client, seen } = server(() => json(ORGS[0]))
    const screen = await renderOrganizations(client)
    const dialog = await openEdit(screen)
    const slug = dialog.getByRole('textbox', { name: 'Slug' })
    await expect.element(slug).toHaveValue('acme')
    await expect.element(slug).toHaveAttribute('readonly')
    await expect.element(slug).toHaveAttribute('aria-readonly', 'true')

    const name = dialog.getByRole('textbox', { name: 'Name' })
    await userEvent.fill(name, 'Acme Holdings')
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await expect.element(dialog).not.toBeInTheDocument()

    expect(await writes(seen, 'PATCH')[0].json()).toEqual({
      name: 'Acme Holdings',
      description: 'Rockets and anvils',
    })
    expect(toast.success).toHaveBeenCalledWith(
      'Organization "Acme Holdings" updated.'
    )
    await expect.poll(() => lists(seen).length).toBe(2)
  })

  it("edit 404 shows 'This organization no longer exists.' and refetches", async () => {
    const { client, seen } = server(() => apiError(404, 'not_found'))
    const screen = await renderOrganizations(client)
    const dialog = await openEdit(screen)
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('This organization no longer exists.')
    await expect.poll(() => lists(seen).length).toBe(2)
  })

  it('reopening after a failure shows no stale error', async () => {
    const { client } = server(() => apiError(409, 'conflict'))
    const screen = await renderOrganizations(client)
    let dialog = await openCreate(screen)
    await fillCreate(dialog, 'Acme 2', 'acme')
    await expect
      .element(
        dialog.getByText('An organization with this slug already exists.')
      )
      .toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()

    dialog = await openCreate(screen)
    await expect.element(dialog).toBeVisible()
    await expect
      .element(
        dialog.getByText('An organization with this slug already exists.')
      )
      .not.toBeInTheDocument()
    await expect
      .element(dialog.getByRole('textbox', { name: 'Slug' }))
      .toHaveValue('')
  })
})
