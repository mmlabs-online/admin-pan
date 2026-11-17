import { apiError, fakeApi, json } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { ENTITLEMENTS, ORGS, PICKER_APPS } from './test-data'
import {
  entitlementCalls,
  orgsServer,
  renderOrgSheet,
  writes,
} from './test-fixtures'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn() },
}))

const noop = () => {}
const path = (r: Request) => new URL(r.url).pathname
const ACME = ORGS[0]
const [CALECHIP, STOKTOK] = ENTITLEMENTS[ACME.id]
type Screen = Awaited<ReturnType<typeof renderOrgSheet>>

async function openTab(screen: Screen) {
  await userEvent.click(screen.getByRole('tab', { name: 'Entitlements' }))
}
async function openGrant(screen: Screen) {
  await openTab(screen)
  const grant = screen.getByRole('button', { name: 'Grant product' })
  await userEvent.click(grant)
  return {
    grant,
    dialog: screen.getByRole('dialog', { name: 'Grant product' }),
  }
}
async function openEdit(screen: Screen, key = 'calechip') {
  await openTab(screen)
  const edit = screen.getByRole('button', { name: `Edit ${key}` })
  await userEvent.click(edit)
  return { edit, dialog: screen.getByRole('dialog', { name: /^Edit / }) }
}
/** Acme has only stoktok granted, so calechip and zenith are eligible. */
const grantedStoktok = { entitlements: () => [STOKTOK] }

describe('EntitlementFormDialog: grant', () => {
  beforeEach(() => vi.clearAllMocks())

  it('Select lists only active, org_mode=required, non-admin apps not yet granted; sends POST {app_key, plan, limits:{seats:10}}; toast names app and org; dialog closes; list refetched; focus returns to Grant', async () => {
    let rows = [STOKTOK]
    const { client, seen } = fakeApi(
      orgsServer(() => json({ ...CALECHIP }, 201), {
        entitlements: () => rows,
      })
    )
    const screen = await renderOrgSheet(client)
    const { grant, dialog } = await openGrant(screen)
    await userEvent.click(dialog.getByRole('combobox', { name: 'App' }))
    const options = screen.getByRole('option').elements()
    expect(options.map((o) => o.textContent)).toEqual([
      'Calechip (calechip)',
      'Zenith (zenith)',
    ])
    await userEvent.click(screen.getByRole('option', { name: /^Calechip/ }))
    await userEvent.fill(dialog.getByLabelText('Plan'), 'pro')
    await userEvent.click(dialog.getByRole('button', { name: 'Add limit' }))
    await userEvent.fill(dialog.getByLabelText('Limit name, row 1'), 'seats')
    await userEvent.fill(dialog.getByLabelText('Value, row 1'), '10')
    rows = [CALECHIP, STOKTOK]
    await userEvent.click(dialog.getByRole('button', { name: 'Grant' }))
    await expect.element(dialog).not.toBeInTheDocument()

    expect(writes(seen, 'POST')).toHaveLength(1)
    expect(path(writes(seen, 'POST')[0])).toBe(
      `/api/v1/organizations/${ACME.id}/entitlements`
    )
    expect(await writes(seen, 'POST')[0].json()).toEqual({
      app_key: 'calechip',
      plan: 'pro',
      limits: { seats: 10 },
    })
    expect(toast.success).toHaveBeenCalledWith('calechip granted to Acme Corp.')
    await expect.poll(() => entitlementCalls(seen, ACME.id).length).toBe(2)
    await expect.element(grant).toHaveFocus()
  })

  it("GET /apps 403 → text 'App key' input with the 'Type the app key' hint; typed key is POSTed; invalid key pattern blocked client-side", async () => {
    const { client, seen } = fakeApi((req) =>
      req.method === 'GET' && path(req) === '/api/v1/apps'
        ? apiError(403, 'permission_denied')
        : orgsServer(() => json(CALECHIP, 201), grantedStoktok)(req)
    )
    const screen = await renderOrgSheet(client)
    const { dialog } = await openGrant(screen)
    const input = dialog.getByLabelText('App key')
    await expect.element(input).toBeVisible()
    await expect.element(dialog.getByText(/Type the app key\./)).toBeVisible()
    await userEvent.fill(dialog.getByLabelText('Plan'), 'pro')
    await userEvent.fill(input, 'Bad Key')
    await userEvent.click(dialog.getByRole('button', { name: 'Grant' }))
    await expect
      .element(dialog.getByText(/Use 2–32 lowercase letters/))
      .toBeVisible()
    expect(writes(seen, 'POST')).toHaveLength(0)

    await userEvent.fill(input, 'calechip')
    await userEvent.click(dialog.getByRole('button', { name: 'Grant' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await writes(seen, 'POST')[0].json()).toEqual({
      app_key: 'calechip',
      plan: 'pro',
      limits: {},
    })
  })

  it("no eligible apps → 'No eligible apps …' text and Grant natively disabled", async () => {
    const { client } = fakeApi(
      orgsServer(() => json({}), {
        ...grantedStoktok,
        apps: () => [PICKER_APPS[0], PICKER_APPS[2]],
      })
    )
    const screen = await renderOrgSheet(client)
    const { dialog } = await openGrant(screen)
    await expect.element(dialog.getByText(/No eligible apps/)).toBeVisible()
    await expect
      .element(dialog.getByRole('button', { name: 'Grant' }))
      .toBeDisabled()
  })

  it('409 org_mode_none → message on the app field, dialog stays open; 409 entitlement_exists → message and the list is refetched; 404 unknown_app → app field', async () => {
    const cases = [
      [
        apiError(409, 'conflict', [
          { field: 'app_key', reason: 'org_mode_none' },
        ]),
        "This app doesn't use organizations.",
        2,
      ],
      [
        apiError(409, 'conflict', [
          { field: 'app_key', reason: 'entitlement_exists' },
        ]),
        'This organization already has this app.',
        2,
      ],
      [
        apiError(404, 'not_found', [
          { field: 'app_key', reason: 'unknown_app' },
        ]),
        'No app with this key.',
        2,
      ],
    ] as const
    for (const [res, text, lists] of cases) {
      const { client, seen } = fakeApi(
        orgsServer(() => res.clone(), grantedStoktok)
      )
      const screen = await renderOrgSheet(client)
      const { dialog } = await openGrant(screen)
      await userEvent.click(dialog.getByRole('combobox', { name: 'App' }))
      await userEvent.click(screen.getByRole('option', { name: /^Calechip/ }))
      await userEvent.fill(dialog.getByLabelText('Plan'), 'pro')
      await userEvent.click(dialog.getByRole('button', { name: 'Grant' }))
      await expect.element(dialog.getByText(text)).toBeVisible()
      await expect.element(dialog).toBeVisible()
      await expect
        .poll(() => entitlementCalls(seen, ACME.id).length)
        .toBe(lists)
      await screen.unmount()
    }
  })

  it("pending: 'Granting…' aria-disabled, sr-only status, Escape ignored; a double click sends one POST", async () => {
    const { client, seen } = fakeApi(
      orgsServer(() => new Promise<Response>(noop), grantedStoktok)
    )
    const screen = await renderOrgSheet(client)
    const { dialog } = await openGrant(screen)
    await userEvent.click(dialog.getByRole('combobox', { name: 'App' }))
    await userEvent.click(screen.getByRole('option', { name: /^Calechip/ }))
    await userEvent.fill(dialog.getByLabelText('Plan'), 'pro')
    const submit = dialog.getByRole('button', { name: 'Grant' })
    // Two clicks in one task: no re-render in between.
    const button = submit.element() as HTMLElement
    button.click()
    button.click()
    await expect
      .element(dialog.getByRole('button', { name: 'Granting…' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(dialog.getByRole('status'))
      .toHaveTextContent('Granting…')
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).toBeVisible()
    expect(writes(seen, 'POST')).toHaveLength(1)
  })
})

describe('EntitlementFormDialog: edit', () => {
  beforeEach(() => vi.clearAllMocks())

  it("app shown read-only; changing only plan PATCHes {plan}; changing a limit PATCHes the whole limits object (unchanged plan not sent); removing all rows sends limits:{}; no change → 'Nothing to save.' and no request; focus returns to that row's Edit", async () => {
    const { client, seen } = fakeApi(orgsServer(() => json(CALECHIP)))
    const screen = await renderOrgSheet(client)
    const { edit, ...first } = await openEdit(screen)
    let { dialog } = first
    expect(dialog.getByLabelText('App key').elements()).toHaveLength(0)
    await expect.element(dialog.getByText('calechip').first()).toBeVisible()

    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await expect.element(dialog.getByText('Nothing to save.')).toBeVisible()
    expect(writes(seen, 'PATCH')).toHaveLength(0)

    await userEvent.fill(dialog.getByLabelText('Plan'), 'team')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await writes(seen, 'PATCH')[0].json()).toEqual({ plan: 'team' })
    expect(toast.success).toHaveBeenCalledWith(
      'calechip for Acme Corp updated.'
    )
    await expect.element(edit).toHaveFocus()
    expect(path(writes(seen, 'PATCH')[0])).toBe(
      `/api/v1/organizations/${ACME.id}/entitlements/${CALECHIP.id}`
    )
    ;({ dialog } = await openEdit(screen))
    await userEvent.fill(dialog.getByLabelText('Value, row 1'), '20')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await writes(seen, 'PATCH')[1].json()).toEqual({
      limits: { seats: 20 },
    })
    ;({ dialog } = await openEdit(screen))
    await userEvent.click(
      dialog.getByRole('button', { name: 'Remove limit row 1' })
    )
    await expect.element(dialog.getByText('No limits.')).toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await writes(seen, 'PATCH')[2].json()).toEqual({ limits: {} })
  })

  it("duplicate limit key and a '1.5' value show linked field errors (aria-describedby) and send nothing; 'Add limit' disabled at 32 rows; 422 body.plan maps to the plan field; 404 → alert", async () => {
    const { client, seen } = fakeApi(orgsServer(() => json({})))
    const screen = await renderOrgSheet(client)
    const { dialog } = await openEdit(screen)
    const add = dialog.getByRole('button', { name: 'Add limit' })
    await userEvent.click(add)
    await userEvent.fill(dialog.getByLabelText('Limit name, row 2'), 'seats')
    await userEvent.fill(dialog.getByLabelText('Value, row 2'), '1.5')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await expect
      .element(dialog.getByLabelText('Limit name, row 2'))
      .toHaveAccessibleDescription('Each limit name must be used once.')
    await expect
      .element(dialog.getByLabelText('Value, row 2'))
      .toHaveAccessibleDescription(/whole number/)
    expect(writes(seen, 'PATCH')).toHaveLength(0)

    for (let i = 3; i <= 32; i++) await userEvent.click(add)
    await expect.element(add).toBeDisabled()
    await expect.element(dialog.getByText('At most 32 limits.')).toBeVisible()
    await screen.unmount()

    const plan = fakeApi(
      orgsServer(() =>
        apiError(422, 'validation_error', [
          { loc: ['body', 'plan'], msg: 'String should match pattern' },
        ])
      )
    )
    const planScreen = await renderOrgSheet(plan.client)
    const planDialog = (await openEdit(planScreen)).dialog
    await userEvent.fill(planDialog.getByLabelText('Plan'), 'team')
    await userEvent.click(planDialog.getByRole('button', { name: 'Save' }))
    await expect
      .element(planDialog.getByLabelText('Plan'))
      .toHaveAccessibleDescription(/String should match pattern/)
    await planScreen.unmount()

    const gone = fakeApi(orgsServer(() => apiError(404, 'not_found')))
    const goneScreen = await renderOrgSheet(gone.client)
    const goneDialog = (await openEdit(goneScreen)).dialog
    await userEvent.fill(goneDialog.getByLabelText('Plan'), 'team')
    await userEvent.click(goneDialog.getByRole('button', { name: 'Save' }))
    await expect
      .element(goneDialog.getByRole('alert'))
      .toHaveTextContent('This entitlement no longer exists.')
  })
})
