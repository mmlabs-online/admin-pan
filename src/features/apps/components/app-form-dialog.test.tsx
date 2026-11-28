import { apiError, fakeApi, json } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { ADMIN_PERMISSIONS } from '@/lib/permissions/registry'
import { APPS, SIMAP_ADMIN_ID, SIMAP_USER_ID } from './test-data'
import { appsServer, isList, renderApps, writes } from './test-fixtures'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

const noop = () => {}
type Screen = Awaited<ReturnType<typeof renderApps>>

async function openCreate(screen: Screen) {
  await userEvent.click(screen.getByRole('button', { name: 'Register app' }))
  return screen.getByRole('dialog', { name: 'Register app' })
}

async function fillCreate(
  dialog: Awaited<ReturnType<typeof openCreate>>,
  key: string,
  name: string
) {
  await userEvent.fill(dialog.getByRole('textbox', { name: 'Key' }), key)
  await userEvent.fill(dialog.getByRole('textbox', { name: 'Name' }), name)
  await userEvent.click(dialog.getByRole('button', { name: 'Register app' }))
}

async function openEdit(screen: Screen, key: string) {
  await userEvent.click(
    screen.getByRole('button', { name: `Actions for ${key}` })
  )
  await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
  return screen.getByRole('dialog', { name: `Edit app ${key}` })
}

describe('App register/edit dialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('client validation (key pattern/length, name, origins <= 20 and duplicates); no request sent', async () => {
    const { client, seen } = fakeApi(appsServer(() => json(APPS[2], 201)))
    const screen = await renderApps(client)
    const dialog = await openCreate(screen)
    const submit = dialog.getByRole('button', { name: 'Register app' })

    await userEvent.click(submit)
    await expect.element(dialog.getByText('Key is required.')).toBeVisible()
    await expect.element(dialog.getByText('Name is required.')).toBeVisible()

    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Key' }),
      'Bad_Key'
    )
    await userEvent.click(submit)
    await expect
      .element(dialog.getByText(/^Use 2–32 lowercase letters/))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('textbox', { name: 'Key' }))
      .toHaveAttribute('aria-invalid', 'true')

    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Key' }),
      'k'.repeat(33)
    )
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Name' }),
      'n'.repeat(256)
    )
    await userEvent.click(submit)
    await expect
      .element(dialog.getByText('Use at most 32 characters.'))
      .toBeVisible()
    await expect
      .element(dialog.getByText('Use at most 255 characters.'))
      .toBeVisible()

    await userEvent.fill(dialog.getByRole('textbox', { name: 'Key' }), 'okapp')
    await userEvent.fill(dialog.getByRole('textbox', { name: 'Name' }), 'Ok')
    const add = dialog.getByRole('button', { name: 'Add origin' })
    await userEvent.click(add)
    await userEvent.click(add)
    await userEvent.click(submit)
    await expect
      .element(dialog.getByText('Enter an origin.').first())
      .toBeVisible()
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Origin 1' }),
      'https://a.mmlabs.online'
    )
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Origin 2' }),
      'https://A.mmlabs.online/'
    )
    await userEvent.click(submit)
    await expect
      .element(dialog.getByText('This origin is already listed.'))
      .toBeVisible()

    for (let i = 2; i < 21; i++) await userEvent.click(add)
    await userEvent.click(submit)
    await expect
      .element(dialog.getByText('Use at most 20 origins.'))
      .toBeVisible()
    expect(writes(seen, 'POST')).toHaveLength(0)
  })

  it('register sends POST {key,name,join_policy,org_mode,origins}, closes, toasts, refetches the list', async () => {
    const { client, seen } = fakeApi(appsServer(() => json(APPS[2], 201)))
    const screen = await renderApps(client)
    const dialog = await openCreate(screen)
    await userEvent.click(dialog.getByRole('button', { name: 'Add origin' }))
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Origin 1' }),
      'http://localhost:5173'
    )
    await fillCreate(dialog, 'newapp', 'New App')
    await expect.element(dialog).not.toBeInTheDocument()

    expect(writes(seen, 'POST')).toHaveLength(1)
    expect(await writes(seen, 'POST')[0].json()).toEqual({
      key: 'newapp',
      name: 'New App',
      join_policy: 'approval',
      org_mode: 'none',
      origins: ['http://localhost:5173'],
    })
    expect(toast.success).toHaveBeenCalledWith('App newapp registered.')
    await expect
      .element(screen.getByRole('button', { name: 'Register app' }))
      .toHaveFocus()
    await expect.poll(() => seen.filter(isList).length).toBe(2)
  })

  it('409 key taken sets the error on Key, focuses it, keeps values; 409 origin_taken shows the origins error linked to the fieldset', async () => {
    let res = () => apiError(409, 'conflict')
    const { client } = fakeApi(appsServer(() => res()))
    const screen = await renderApps(client)
    const dialog = await openCreate(screen)
    await fillCreate(dialog, 'stoktok', 'Stoktok 2')

    const message = dialog.getByText('An app with this key already exists.')
    await expect.element(message).toBeVisible()
    const key = dialog.getByRole('textbox', { name: 'Key' })
    await expect.element(key).toHaveAttribute('aria-invalid', 'true')
    await expect
      .element(key)
      .toHaveAttribute(
        'aria-describedby',
        expect.stringContaining(message.element().id)
      )
    await expect.element(key).toHaveFocus()
    await expect.element(key).toHaveValue('stoktok')
    await expect
      .element(dialog.getByRole('textbox', { name: 'Name' }))
      .toHaveValue('Stoktok 2')
    await expect
      .element(dialog.getByText('server text'))
      .not.toBeInTheDocument()

    res = () =>
      apiError(409, 'conflict', [{ field: 'origins', reason: 'origin_taken' }])
    await userEvent.click(dialog.getByRole('button', { name: 'Add origin' }))
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Origin 1' }),
      'https://a.mmlabs.online'
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Register app' }))
    const originsMessage = dialog.getByText(
      'One of these origins is already registered to another app.'
    )
    await expect.element(originsMessage).toBeVisible()
    const fieldset = dialog.getByRole('group', { name: 'Origins' })
    await expect
      .element(fieldset)
      .toHaveAttribute('aria-describedby', originsMessage.element().id)
  })

  it('422 validation_error on origins shows the API message on the origins fieldset', async () => {
    const { client } = fakeApi(
      appsServer(() =>
        apiError(422, 'validation_error', [
          {
            type: 't',
            loc: ['body', 'origins', 0],
            msg: 'Origin is not valid',
          },
        ])
      )
    )
    const screen = await renderApps(client)
    const dialog = await openCreate(screen)
    await userEvent.click(dialog.getByRole('button', { name: 'Add origin' }))
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Origin 1' }),
      'ftp://x'
    )
    await fillCreate(dialog, 'newapp', 'New')
    await expect.element(dialog.getByText('Origin is not valid')).toBeVisible()
    await expect
      .element(dialog.getByRole('group', { name: 'Origins' }))
      .toHaveAttribute('aria-describedby')
    await expect.element(dialog).toBeVisible()
  })

  it("pending: 'Registering…', aria-disabled, sr-only status, Escape does not close; a double click sends one POST (sync guard)", async () => {
    let release: (r: Response) => void = noop
    const { client, seen } = fakeApi(
      appsServer(() => new Promise<Response>((resolve) => (release = resolve)))
    )
    const screen = await renderApps(client)
    const dialog = await openCreate(screen)
    await userEvent.fill(dialog.getByRole('textbox', { name: 'Key' }), 'newapp')
    await userEvent.fill(dialog.getByRole('textbox', { name: 'Name' }), 'New')
    const submit = dialog.getByRole('button', { name: 'Register app' })
    // Two clicks in one task: no re-render in between.
    const button = submit.element() as HTMLElement
    button.click()
    button.click()

    const busy = dialog.getByRole('button', { name: 'Registering…' })
    await expect.element(busy).toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(dialog.getByRole('status'))
      .toHaveTextContent('Registering…')
    ;(busy.element() as HTMLElement).click()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).toBeVisible()
    expect(writes(seen, 'POST')).toHaveLength(1)

    release(json(APPS[2], 201))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen, 'POST')).toHaveLength(1)
  })

  it('edit: prefilled; key readOnly + aria-readonly; sends PATCH with changed fields only; no change -> closes without a request', async () => {
    const { client, seen } = fakeApi(appsServer(() => json(APPS[2])))
    const screen = await renderApps(client)
    let dialog = await openEdit(screen, 'stoktok')
    const key = dialog.getByRole('textbox', { name: 'Key' })
    await expect.element(key).toHaveValue('stoktok')
    await expect.element(key).toHaveAttribute('readonly')
    await expect.element(key).toHaveAttribute('aria-readonly', 'true')
    await expect
      .element(dialog.getByRole('textbox', { name: 'Origin 2' }))
      .toHaveValue('http://localhost:5173')

    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen, 'PATCH')).toHaveLength(0)

    dialog = await openEdit(screen, 'stoktok')
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Name' }),
      'Stoktok Pro'
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(new URL(writes(seen, 'PATCH')[0].url).pathname).toBe(
      '/api/v1/apps/stoktok'
    )
    expect(await writes(seen, 'PATCH')[0].json()).toEqual({
      name: 'Stoktok Pro',
    })
    expect(toast.success).toHaveBeenCalledWith('App stoktok updated.')
    await expect.poll(() => seen.filter(isList).length).toBe(2)
  })

  it('edit org_mode: 422 role_has_org_permissions shown on Org mode', async () => {
    const { client, seen } = fakeApi(
      appsServer(() =>
        apiError(422, 'unprocessable', [
          { field: 'default_role_id', reason: 'role_has_org_permissions' },
        ])
      )
    )
    const screen = await renderApps(client)
    const dialog = await openEdit(screen, 'stoktok')
    await expect
      .element(dialog.getByText(/does not reclassify existing permissions/))
      .toBeVisible()
    await userEvent.click(dialog.getByRole('combobox', { name: 'Org mode' }))
    await userEvent.click(screen.getByRole('option', { name: 'Required' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await expect
      .element(dialog.getByText(/default role holds org-scoped permissions/))
      .toBeVisible()
    expect(await writes(seen, 'PATCH')[0].json()).toEqual({
      org_mode: 'required',
    })
  })

  it('admin app: shows the admin:* note; controls stay enabled; 403 admin_wildcard_required shows the inline panel; 409 shows the admin-app rule', async () => {
    let res = () => apiError(403, 'admin_wildcard_required')
    const { client } = fakeApi(appsServer(() => res()))
    const screen = await renderApps(client)
    const dialog = await openEdit(screen, 'admin')
    await expect
      .element(dialog.getByText(/need the admin:\* permission/))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('textbox', { name: 'Name' }))
      .toBeEnabled()
    await expect
      .element(dialog.getByRole('combobox', { name: 'Org mode' }))
      .toBeEnabled()
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Name' }),
      'Console'
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('Only super admins can do this')

    res = () => apiError(409, 'conflict')
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('The admin app must stay active, closed')
    await expect.element(dialog).toBeVisible()
  })

  it("edit 404 shows 'This app no longer exists.' and refetches", async () => {
    const { client, seen } = fakeApi(
      appsServer(() => apiError(404, 'not_found'))
    )
    const screen = await renderApps(client)
    const dialog = await openEdit(screen, 'stoktok')
    await userEvent.fill(dialog.getByRole('textbox', { name: 'Name' }), 'Other')
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('This app no longer exists.')
    await expect.poll(() => seen.filter(isList).length).toBe(2)
  })

  it('reopening after a failure shows no stale error', async () => {
    const { client } = fakeApi(appsServer(() => apiError(409, 'conflict')))
    const screen = await renderApps(client)
    let dialog = await openCreate(screen)
    await fillCreate(dialog, 'stoktok', 'Stoktok 2')
    await expect
      .element(dialog.getByText('An app with this key already exists.'))
      .toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()

    dialog = await openCreate(screen)
    await expect.element(dialog).toBeVisible()
    await expect
      .element(dialog.getByText('An app with this key already exists.'))
      .not.toBeInTheDocument()
    await expect
      .element(dialog.getByRole('textbox', { name: 'Key' }))
      .toHaveValue('')
  })
})

describe('App edit dialog: roles', () => {
  beforeEach(() => vi.clearAllMocks())

  const pick = async (
    screen: Screen,
    dialog: Awaited<ReturnType<typeof openEdit>>,
    field: string,
    option: RegExp | string
  ) => {
    await userEvent.click(dialog.getByRole('combobox', { name: field }))
    await userEvent.click(screen.getByRole('option', { name: option }))
  }
  const save = (dialog: Awaited<ReturnType<typeof openEdit>>) =>
    userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
  const ready = async (dialog: Awaited<ReturnType<typeof openEdit>>) =>
    expect
      .element(dialog.getByRole('combobox', { name: 'Default role' }))
      .toBeEnabled()

  it('simap: set Org owner role to simap:admin -> review -> one PATCH with that body; the sheet then shows simap:admin, never the uuid', async () => {
    let apps = [...APPS]
    const { client, seen } = fakeApi(
      appsServer(
        async (req) => {
          const body = (await req.clone().json()) as Record<
            string,
            string | null
          >
          apps = apps.map((a) => (a.key === 'simap' ? { ...a, ...body } : a))
          return json(apps.find((a) => a.key === 'simap'))
        },
        () => apps
      )
    )
    const screen = await renderApps(client)
    const dialog = await openEdit(screen, 'simap')
    await ready(dialog)
    await pick(screen, dialog, 'Org owner role', /^simap:admin/)
    await save(dialog)

    const review = dialog.getByRole('heading', { name: 'Review role changes' })
    await expect.element(review).toBeVisible()
    await expect.element(review).toHaveFocus()
    await expect
      .element(dialog.getByText(/Org owner role:/))
      .toHaveTextContent('Org owner role: None → simap:admin')
    expect(writes(seen, 'PATCH')).toHaveLength(0)
    await userEvent.click(
      dialog.getByRole('button', { name: 'Confirm and save' })
    )
    await expect.element(dialog).not.toBeInTheDocument()
    const patches = writes(seen, 'PATCH')
    expect(patches).toHaveLength(1)
    expect(await patches[0].json()).toEqual({
      org_owner_role_id: SIMAP_ADMIN_ID,
    })

    await userEvent.click(screen.getByRole('button', { name: 'View simap' }))
    const sheet = screen.getByRole('dialog')
    await expect.element(sheet.getByText('simap:admin')).toBeVisible()
    await expect
      .element(sheet.getByText(SIMAP_ADMIN_ID))
      .not.toBeInTheDocument()
  })

  it('selects: Default role always; Org owner and Super-admin only while Org mode is Required; options are None + key — name; admin app shows none', async () => {
    const { client } = fakeApi(appsServer(() => json({})))
    const screen = await renderApps(client)
    let dialog = await openEdit(screen, 'stoktok')
    await ready(dialog)
    await expect
      .element(dialog.getByRole('combobox', { name: 'Org owner role' }))
      .not.toBeInTheDocument()
    await expect
      .element(dialog.getByRole('combobox', { name: 'Super-admin role' }))
      .not.toBeInTheDocument()
    await pick(screen, dialog, 'Org mode', 'Required')
    await expect
      .element(dialog.getByRole('combobox', { name: 'Org owner role' }))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('combobox', { name: 'Super-admin role' }))
      .toBeVisible()
    await userEvent.click(
      dialog.getByRole('combobox', { name: 'Default role' })
    )
    await expect
      .element(screen.getByRole('option', { name: 'None' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('option', { name: 'stoktok:member — Member' }))
      .toBeVisible()
    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()

    dialog = await openEdit(screen, 'admin')
    await expect
      .element(dialog.getByRole('combobox', { name: 'Default role' }))
      .not.toBeInTheDocument()
  })

  it('untouched roles are never sent: a name edit on calechip sends {name} only, with no review phase', async () => {
    const { client, seen } = fakeApi(appsServer(() => json(APPS[1])))
    const screen = await renderApps(client)
    const dialog = await openEdit(screen, 'calechip')
    await ready(dialog)
    await userEvent.fill(dialog.getByRole('textbox', { name: 'Name' }), 'Cal')
    await save(dialog)
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await writes(seen, 'PATCH')[0].json()).toEqual({ name: 'Cal' })
  })

  it('role change -> review; Back sends nothing and keeps the values; Confirm sends one PATCH even on a double click', async () => {
    let release: (r: Response) => void = noop
    const { client, seen } = fakeApi(
      appsServer(() => new Promise<Response>((resolve) => (release = resolve)))
    )
    const screen = await renderApps(client)
    const dialog = await openEdit(screen, 'simap')
    await ready(dialog)
    await pick(screen, dialog, 'Default role', /^simap:user/)
    await save(dialog)
    await expect
      .element(
        dialog.getByText(
          'Accounts that join Simap from now on get this role.',
          { exact: false }
        )
      )
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Back' }))
    await expect
      .element(dialog.getByRole('combobox', { name: 'Default role' }))
      .toHaveTextContent('simap:user')
    expect(writes(seen, 'PATCH')).toHaveLength(0)

    await save(dialog)
    const confirm = dialog.getByRole('button', { name: 'Confirm and save' })
    const button = (await confirm.element()) as HTMLElement
    button.click()
    button.click()
    const busy = dialog.getByRole('button', { name: 'Saving…' })
    await expect.element(busy).toHaveAttribute('aria-disabled', 'true')
    expect(writes(seen, 'PATCH')).toHaveLength(1)
    release(json(APPS[3]))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await writes(seen, 'PATCH')[0].json()).toEqual({
      default_role_id: SIMAP_USER_ID,
    })
  })

  it('Org owner -> None: the review warns and the body is {org_owner_role_id: null}', async () => {
    const { client, seen } = fakeApi(appsServer(() => json(APPS[1])))
    const screen = await renderApps(client)
    const dialog = await openEdit(screen, 'calechip')
    await ready(dialog)
    await pick(screen, dialog, 'Org owner role', 'None')
    await save(dialog)
    await expect
      .element(
        dialog.getByText(
          'Org creation and invitations stop working for Calechip.'
        )
      )
      .toBeVisible()
    await userEvent.click(
      dialog.getByRole('button', { name: 'Confirm and save' })
    )
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await writes(seen, 'PATCH')[0].json()).toEqual({
      org_owner_role_id: null,
    })
  })

  it('without admin:* the Super-admin select is disabled with the reason linked; with admin:* it is enabled', async () => {
    const without = ADMIN_PERMISSIONS.filter((p) => p !== 'admin:*')
    const { client } = fakeApi(appsServer(() => json({})))
    let screen = await renderApps(client, { granted: without })
    let dialog = await openEdit(screen, 'simap')
    await ready(dialog)
    const select = dialog.getByRole('combobox', { name: 'Super-admin role' })
    await expect.element(select).toBeDisabled()
    const reason =
      'Requires admin:*. Only super admins can change the super-admin role.'
    await expect.element(dialog.getByText(reason)).toBeVisible()
    const id = (select.element() as HTMLElement)
      .getAttribute('aria-describedby')
      ?.split(' ')
    expect(
      id?.some((i) => document.getElementById(i)?.textContent === reason)
    ).toBe(true)
    await screen.unmount()

    screen = await renderApps(client)
    dialog = await openEdit(screen, 'simap')
    await ready(dialog)
    await expect
      .element(dialog.getByRole('combobox', { name: 'Super-admin role' }))
      .toBeEnabled()
  })

  it('super-admin with another change -> field error, no PATCH; alone -> review with the cross-org warning and body {super_admin_role_id}', async () => {
    const { client, seen } = fakeApi(appsServer(() => json(APPS[3])))
    const screen = await renderApps(client)
    const dialog = await openEdit(screen, 'simap')
    await ready(dialog)
    await pick(screen, dialog, 'Super-admin role', /^simap:support/)
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Name' }),
      'Simap 2'
    )
    await save(dialog)
    await expect
      .element(dialog.getByText(/Save the super-admin role on its own/))
      .toBeVisible()
    expect(writes(seen, 'PATCH')).toHaveLength(0)

    await userEvent.fill(dialog.getByRole('textbox', { name: 'Name' }), 'Simap')
    await save(dialog)
    await expect
      .element(dialog.getByText(/without being a member/))
      .toBeVisible()
    await userEvent.click(
      dialog.getByRole('button', { name: 'Confirm and save' })
    )
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await writes(seen, 'PATCH')[0].json()).toEqual({
      super_admin_role_id: expect.any(String),
    })
  })

  it('422 org_owner_role_id/role_has_admin_permissions -> back in the form with the field error linked and focused; the value is kept', async () => {
    const { client } = fakeApi(
      appsServer(() =>
        apiError(422, 'unprocessable', [
          { field: 'org_owner_role_id', reason: 'role_has_admin_permissions' },
        ])
      )
    )
    const screen = await renderApps(client)
    const dialog = await openEdit(screen, 'simap')
    await ready(dialog)
    await pick(screen, dialog, 'Org owner role', /^simap:admin/)
    await save(dialog)
    await userEvent.click(
      dialog.getByRole('button', { name: 'Confirm and save' })
    )
    const select = dialog.getByRole('combobox', { name: 'Org owner role' })
    await expect
      .element(dialog.getByText(/can't be the org owner role/))
      .toBeVisible()
    await expect.element(select).toHaveAttribute('aria-invalid', 'true')
    await expect.element(select).toHaveFocus()
    await expect.element(select).toHaveTextContent('simap:admin')
  })

  it('409 super_admin_role_id/role_has_assignments -> error on Super-admin role; 403 admin_wildcard_required -> inline panel saying nothing was saved, values kept', async () => {
    let res = () =>
      apiError(409, 'conflict', [
        { field: 'super_admin_role_id', reason: 'role_has_assignments' },
      ])
    const { client } = fakeApi(appsServer(() => res()))
    const screen = await renderApps(client)
    const dialog = await openEdit(screen, 'simap')
    await ready(dialog)
    await pick(screen, dialog, 'Super-admin role', /^simap:support/)
    await save(dialog)
    await userEvent.click(
      dialog.getByRole('button', { name: 'Confirm and save' })
    )
    await expect
      .element(dialog.getByText(/Users already hold this role/))
      .toBeVisible()

    res = () => apiError(403, 'admin_wildcard_required')
    await save(dialog)
    await userEvent.click(
      dialog.getByRole('button', { name: 'Confirm and save' })
    )
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('Nothing was saved.')
    await expect
      .element(dialog.getByRole('combobox', { name: 'Super-admin role' }))
      .toHaveTextContent('simap:support')
  })

  it('roles failed to load: role selects disabled with a note and Retry; a name edit sends {name} only', async () => {
    const { client, seen } = fakeApi((req) =>
      new URL(req.url).pathname.endsWith('/role-definitions')
        ? apiError(500, 'internal_error')
        : appsServer(() => json(APPS[1]))(req)
    )
    const screen = await renderApps(client)
    const dialog = await openEdit(screen, 'calechip')
    await expect
      .element(dialog.getByText(/Couldn't load this app's roles/).first())
      .toBeVisible()
    await expect
      .element(dialog.getByRole('combobox', { name: 'Default role' }))
      .toBeDisabled()
    await expect
      .element(dialog.getByRole('combobox', { name: 'Org owner role' }))
      .toHaveTextContent(/Unknown role \(/)
    await expect
      .element(dialog.getByRole('button', { name: 'Retry' }))
      .toBeVisible()
    await userEvent.fill(dialog.getByRole('textbox', { name: 'Name' }), 'Cal')
    await save(dialog)
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await writes(seen, 'PATCH')[0].json()).toEqual({ name: 'Cal' })
  })
})
