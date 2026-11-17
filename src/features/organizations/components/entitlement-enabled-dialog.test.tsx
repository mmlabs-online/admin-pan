import { apiError, fakeApi, json } from '@/test-utils/api'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { ENTITLEMENTS, ORGS } from './test-data'
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

const ACME = ORGS[0]
const [CALECHIP, STOKTOK] = ENTITLEMENTS[ACME.id]
type Screen = Awaited<ReturnType<typeof renderOrgSheet>>

async function openSwitch(screen: Screen, name: string) {
  await userEvent.click(screen.getByRole('tab', { name: 'Entitlements' }))
  const sw = screen.getByRole('switch', { name })
  // The page behind the modal is aria-hidden, so keep the element itself.
  const el = sw.element() as HTMLElement
  await userEvent.click(sw)
  return { sw, el, dialog: screen.getByRole('alertdialog') }
}

describe('EntitlementEnabledDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('disable: switch opens a confirm naming org and app; Cancel sends nothing and focus returns to the switch', async () => {
    const { client, seen } = fakeApi(orgsServer(() => json({})))
    const screen = await renderOrgSheet(client)
    const { sw, dialog } = await openSwitch(screen, 'calechip enabled')
    await expect
      .element(dialog.getByText('Disable calechip for Acme Corp?'))
      .toBeVisible()
    await expect
      .element(dialog.getByText(/recorded in the audit log/))
      .toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen, 'PATCH')).toHaveLength(0)
    await expect.element(sw).toHaveFocus()
    await expect.element(sw).toBeChecked()
  })

  it("disable confirm sends one PATCH {enabled:false} even on double click; 'Disabling…' aria-disabled; the switch stays on until the refetch, then off; status 'Disabled'; toast", async () => {
    let enabled = true
    let release: (r: Response) => void = () => {}
    const { client, seen } = fakeApi(
      orgsServer(
        () => new Promise<Response>((resolve) => (release = resolve)),
        {
          entitlements: () => [
            { ...CALECHIP, enabled, active: enabled },
            STOKTOK,
          ],
        }
      )
    )
    const screen = await renderOrgSheet(client)
    const { sw, el, dialog } = await openSwitch(screen, 'calechip enabled')
    const confirm = dialog.getByRole('button', { name: 'Disable' })
    // Two clicks in one task: no re-render in between.
    const button = confirm.element() as HTMLElement
    button.click()
    button.click()
    await expect
      .element(dialog.getByRole('button', { name: 'Disabling…' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect.poll(() => writes(seen, 'PATCH').length).toBe(1)
    expect(await writes(seen, 'PATCH')[0].json()).toEqual({ enabled: false })
    expect(new URL(writes(seen, 'PATCH')[0].url).pathname).toBe(
      `/api/v1/organizations/${ACME.id}/entitlements/${CALECHIP.id}`
    )
    expect(el.getAttribute('aria-checked')).toBe('true')

    enabled = false
    release(json({ ...CALECHIP, enabled: false, active: false }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith(
      'calechip for Acme Corp disabled.'
    )
    await expect.element(sw).not.toBeChecked()
    expect(writes(seen, 'PATCH')).toHaveLength(1)
    await expect.poll(() => entitlementCalls(seen, ACME.id).length).toBe(2)
    await expect.element(sw).toHaveFocus()
  })

  it('enable confirm sends PATCH {enabled:true} (non-destructive button)', async () => {
    const { client, seen } = fakeApi(orgsServer(() => json(STOKTOK)))
    const screen = await renderOrgSheet(client)
    const { dialog } = await openSwitch(screen, 'stoktok enabled')
    await expect
      .element(dialog.getByText('Enable stoktok for Acme Corp?'))
      .toBeVisible()
    const confirm = dialog.getByRole('button', { name: 'Enable' })
    expect((confirm.element() as HTMLElement).className).not.toContain(
      'bg-destructive'
    )
    await userEvent.click(confirm)
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen, 'PATCH')).toHaveLength(1)
    expect(await writes(seen, 'PATCH')[0].json()).toEqual({ enabled: true })
    expect(toast.success).toHaveBeenCalledWith('stoktok for Acme Corp enabled.')
  })

  it("errors inline, dialog stays open: 403 → ForbiddenPanel; 404 → 'no longer exists' and list refetched", async () => {
    let c = fakeApi(orgsServer(() => apiError(403, 'permission_denied')))
    let screen = await renderOrgSheet(c.client)
    let { dialog } = await openSwitch(screen, 'calechip enabled')
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent("You don't have permission to do this")
    await screen.unmount()

    c = fakeApi(orgsServer(() => apiError(404, 'not_found')))
    screen = await renderOrgSheet(c.client)
    ;({ dialog } = await openSwitch(screen, 'calechip enabled'))
    await userEvent.click(dialog.getByRole('button', { name: 'Disable' }))
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('This entitlement no longer exists.')
    await expect.poll(() => entitlementCalls(c.seen, ACME.id).length).toBe(2)
    await expect.element(dialog).toBeVisible()
  })
})
