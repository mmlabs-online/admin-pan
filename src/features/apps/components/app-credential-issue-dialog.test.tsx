import { type QueryClient } from '@tanstack/react-query'
import { apiError, fakeApi, json, testQueryClient } from '@/test-utils/api'
import { FAKE_CREDENTIAL } from '@/test-utils/fake-credential'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { CREDENTIALS } from './test-data'
import { appsServer, renderApps, writes } from './test-fixtures'

vi.mock('sonner', async (orig) => ({
  ...(await orig()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const noop = () => {}
const path = (r: Request) => new URL(r.url).pathname
const credCalls = (seen: Request[]) =>
  seen.filter(
    (r) => r.method === 'GET' && path(r) === '/api/v1/apps/calechip/credentials'
  )
const ISSUED = { ...CREDENTIALS.calechip[0], credential: FAKE_CREDENTIAL }
type Screen = Awaited<ReturnType<typeof renderApps>>

async function openDialog(screen: Screen, key = 'calechip') {
  await userEvent.click(screen.getByRole('button', { name: `View ${key}` }))
  const sheet = screen.getByRole('dialog')
  await userEvent.click(sheet.getByRole('tab', { name: 'Credentials' }))
  const open = sheet.getByRole('button', { name: 'Issue credential' })
  await userEvent.click(open)
  return {
    sheet,
    open, // The name changes with the phase, so match both titles.
    dialog: screen.getByRole('dialog', {
      name: /Issue credential|Credential issued/,
    }),
  }
}

async function pickScope(screen: Screen, dialog: Dialog, scope: string) {
  await userEvent.click(dialog.getByRole('combobox', { name: 'Scope' }))
  await userEvent.click(
    screen.getByRole('option', { name: scope, exact: true })
  )
}

/** Picks a scope, then presses Issue credential. */
async function issueWith(screen: Screen, dialog: Dialog, scope = 'manifest') {
  await pickScope(screen, dialog, scope)
  await userEvent.click(issueButton(dialog))
}

type Dialog = ReturnType<Screen['getByRole']>

const issueButton = (dialog: Dialog) =>
  dialog.getByRole('button', { name: 'Issue credential' })

describe('AppCredentialIssueDialog', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('confirm phase names app name and key; Cancel sends no POST; focus returns to Issue credential', async () => {
    const { client, seen } = fakeApi(appsServer(() => json(ISSUED, 201)))
    const screen = await renderApps(client)
    const { open, dialog } = await openDialog(screen)
    await expect.element(dialog).toHaveTextContent('Calechip (calechip)')
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await expect.element(dialog).not.toBeInTheDocument()
    expect(writes(seen, 'POST')).toHaveLength(0)
    await expect.element(open).toHaveFocus()
  })

  it("Issue: one POST with body {scope: org-members:read} even on double click; pending 'Issuing…' aria-disabled; Escape, outside click and Cancel ignored while pending", async () => {
    let release: (r: Response) => void = noop
    const { client, seen } = fakeApi(
      appsServer(() => new Promise<Response>((r) => (release = r)))
    )
    const screen = await renderApps(client)
    const { dialog } = await openDialog(screen)
    await pickScope(screen, dialog, 'org-members:read')
    await expect
      .element(dialog.getByText(/Backend deploy environment only/).first())
      .toBeVisible()
    const button = issueButton(dialog).element() as HTMLElement
    button.click()
    button.click()
    const busy = dialog.getByRole('button', { name: 'Issuing…' })
    await expect.element(busy).toHaveAttribute('aria-disabled', 'true')
    expect(writes(seen, 'POST')).toHaveLength(1)
    expect(await writes(seen, 'POST')[0].text()).toBe(
      '{"scope":"org-members:read"}'
    )

    await userEvent.keyboard('{Escape}')
    // aria-disabled is not clickable for the test driver: use a DOM click.
    ;(
      dialog.getByRole('button', { name: 'Cancel' }).element() as HTMLElement
    ).click()
    await expect.element(dialog).toBeInTheDocument()
    release(json({ ...ISSUED, scope: 'org-members:read' }, 201))
    await expect.element(dialog.getByText('Credential issued')).toBeVisible()
    await expect
      .element(dialog.getByText(/\(org-members:read\) for Calechip/))
      .toBeVisible()
    await expect
      .element(dialog.getByText(/only in the backend's deploy environment/))
      .toBeVisible()
  })

  it('reveal: masked by default (DOM has mmak_<key_id>_ + mask, not the secret); warning and status line visible; Show puts FAKE_CREDENTIAL in a readOnly unnamed input; Hide masks again; focus starts on Copy', async () => {
    const { client } = fakeApi(appsServer(() => json(ISSUED, 201)))
    const screen = await renderApps(client)
    const { dialog } = await openDialog(screen)
    await issueWith(screen, dialog)
    const field = dialog.getByLabelText('Credential', { exact: true })
    await expect.element(field).toHaveValue('mmak_aaaa000000000002_••••••••')
    expect(document.body.innerHTML).not.toContain(FAKE_CREDENTIAL)
    await expect
      .element(
        dialog.getByText(/You won't see it again|you won't see it again/)
      )
      .toBeVisible()
    await expect.element(dialog.getByText(/can't be shown again/)).toBeVisible()
    await expect
      .element(dialog.getByText(/Credential aaaa000000000002 issued/))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('button', { name: 'Copy' }))
      .toHaveFocus()

    const input = field.element() as HTMLInputElement
    expect(input.readOnly).toBe(true)
    expect(input.getAttribute('name')).toBeNull()
    expect(input.getAttribute('autocomplete')).toBe('off')
    expect(input.getAttribute('spellcheck')).toBe('false')
    expect(input.closest('form')).toBeNull()

    const show = dialog.getByRole('button', { name: 'Show' })
    await userEvent.click(show)
    await expect.element(field).toHaveValue(FAKE_CREDENTIAL)
    await expect
      .element(dialog.getByRole('button', { name: 'Hide' }))
      .toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(dialog.getByRole('button', { name: 'Hide' }))
    await expect.element(field).toHaveValue('mmak_aaaa000000000002_••••••••')
    expect(document.body.innerHTML).not.toContain(FAKE_CREDENTIAL)
  })

  it("Copy calls navigator.clipboard.writeText(FAKE_CREDENTIAL) without Show and announces 'Copied to the clipboard.'; a rejected writeText shows the manual-copy message", async () => {
    const write = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)
    const { client } = fakeApi(appsServer(() => json(ISSUED, 201)))
    const screen = await renderApps(client)
    const { dialog } = await openDialog(screen)
    await issueWith(screen, dialog)
    await userEvent.click(dialog.getByRole('button', { name: 'Copy' }))
    expect(write).toHaveBeenCalledWith(FAKE_CREDENTIAL)
    await expect
      .element(dialog.getByText('Copied to the clipboard.'))
      .toBeVisible()

    write.mockRejectedValue(new Error('denied'))
    await userEvent.click(dialog.getByRole('button', { name: 'Copy' }))
    await expect.element(dialog.getByText(/Couldn't copy/)).toBeVisible()
  })

  it('reveal: no X button; Escape and outside click keep the dialog (and the sheet) open; only "I\'ve saved it" closes; focus returns to Issue credential; the list is refetched', async () => {
    const { client, seen } = fakeApi(appsServer(() => json(ISSUED, 201)))
    const screen = await renderApps(client)
    const { open, dialog } = await openDialog(screen)
    await issueWith(screen, dialog)
    await expect.element(dialog.getByText('Credential issued')).toBeVisible()
    await expect
      .element(dialog.getByRole('button', { name: 'Close' }))
      .not.toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    const overlays = document.querySelectorAll('[data-slot=dialog-overlay]')
    overlays[overlays.length - 1].dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true })
    )
    await expect.element(dialog).toBeInTheDocument()
    // The sheet is aria-hidden behind the dialog: check it is still mounted.
    expect(document.querySelector('[data-slot=sheet-content]')).not.toBeNull()

    await userEvent.click(dialog.getByRole('button', { name: "I've saved it" }))
    await expect.element(dialog).not.toBeInTheDocument()
    await expect.element(open).toHaveFocus()
    await expect.poll(() => credCalls(seen).length).toBeGreaterThan(1)
  })

  it.each(['manifest', 'org-members:read'])(
    'leak regression (%s): FAKE_CREDENTIAL is never in the mutation or query cache (while open and after close), and after close not in the DOM, storage, URL, console or toasts',
    async (scope) => {
      const consoleSpies = (
        ['log', 'info', 'warn', 'error', 'debug'] as const
      ).map((m) => vi.spyOn(console, m))
      const queryClient: QueryClient = testQueryClient()
      const dump = () =>
        JSON.stringify([
          queryClient
            .getMutationCache()
            .getAll()
            .map((m) => m.state),
          queryClient
            .getQueryCache()
            .getAll()
            .map((q) => q.state),
        ])
      const { client } = fakeApi(
        appsServer(() => json({ ...ISSUED, scope }, 201))
      )
      const screen = await renderApps(client, { queryClient })
      const { dialog } = await openDialog(screen)
      await issueWith(screen, dialog, scope)
      await expect.element(dialog.getByText('Credential issued')).toBeVisible()
      expect(dump()).not.toContain(FAKE_CREDENTIAL)

      await userEvent.click(dialog.getByRole('button', { name: 'Show' }))
      expect(dump()).not.toContain(FAKE_CREDENTIAL)
      await userEvent.click(
        dialog.getByRole('button', { name: "I've saved it" })
      )
      await expect.element(dialog).not.toBeInTheDocument()

      expect(dump()).not.toContain(FAKE_CREDENTIAL)
      expect(document.body.innerHTML).not.toContain(FAKE_CREDENTIAL)
      for (const store of [localStorage, sessionStorage])
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i) as string
          expect(k).not.toContain(FAKE_CREDENTIAL)
          expect(store.getItem(k)).not.toContain(FAKE_CREDENTIAL)
        }
      expect(location.href).not.toContain(FAKE_CREDENTIAL)
      expect(
        JSON.stringify(consoleSpies.map((s) => s.mock.calls))
      ).not.toContain(FAKE_CREDENTIAL)
      expect(
        JSON.stringify(
          [toast.success, toast.error, toast.info].map(
            (t) => (t as ReturnType<typeof vi.fn>).mock.calls
          )
        )
      ).not.toContain(FAKE_CREDENTIAL)
    }
  )

  it("pagehide clears the value: the reveal shows 'This value was cleared' and FAKE_CREDENTIAL is not in the DOM", async () => {
    const { client } = fakeApi(appsServer(() => json(ISSUED, 201)))
    const screen = await renderApps(client)
    const { dialog } = await openDialog(screen)
    await issueWith(screen, dialog)
    await userEvent.click(dialog.getByRole('button', { name: 'Show' }))
    expect(document.body.innerHTML).toContain(FAKE_CREDENTIAL)
    window.dispatchEvent(new Event('pagehide'))
    await expect
      .element(dialog.getByText(/This value was cleared/))
      .toBeVisible()
    expect(document.body.innerHTML).not.toContain(FAKE_CREDENTIAL)
  })

  it('reopening after close shows the confirm phase, no value', async () => {
    const { client } = fakeApi(appsServer(() => json(ISSUED, 201)))
    const screen = await renderApps(client)
    const { open, dialog } = await openDialog(screen)
    await issueWith(screen, dialog)
    await userEvent.click(dialog.getByRole('button', { name: 'Show' }))
    await userEvent.click(dialog.getByRole('button', { name: "I've saved it" }))
    await expect.element(dialog).not.toBeInTheDocument()
    await userEvent.click(open)
    const again = screen.getByRole('dialog', { name: 'Issue credential' })
    await expect.element(issueButton(again)).toBeVisible()
    expect(document.body.innerHTML).not.toContain(FAKE_CREDENTIAL)
  })

  it('403 ×2, 404, 409 admin_app / app_disabled / scope_not_available / credential_limit and 422 show their messages; the dialog stays in the confirm phase with the chosen scope kept', async () => {
    let res: () => Response = () => apiError(403, 'admin_wildcard_required')
    const { client } = fakeApi(appsServer(() => res()))
    const screen = await renderApps(client)
    const { dialog } = await openDialog(screen)
    await pickScope(screen, dialog, 'org-members:read')
    const conflict = (reason: string) => () =>
      apiError(409, 'conflict', [{ field: 'key', reason }])
    const cases: [() => Response, string][] = [
      [
        () => apiError(403, 'admin_wildcard_required'),
        'Only super admins can do this',
      ],
      [
        () => apiError(403, 'permission_denied'),
        "You don't have permission to do this",
      ],
      [
        conflict('admin_app'),
        'The admin app can only have releases credentials.',
      ],
      [conflict('app_disabled'), 'This app is disabled.'],
      [conflict('scope_not_available'), "This scope can't be issued yet."],
      [conflict('credential_limit'), '2 active org-members:read credentials'],
      [() => apiError(404, 'not_found'), 'This app no longer exists.'],
      [() => apiError(422, 'validation_error'), 'The API rejected this scope.'],
    ]
    for (const [make, text] of cases) {
      res = make
      await userEvent.click(issueButton(dialog))
      await expect
        .element(dialog.getByRole('alert').filter({ hasText: text }))
        .toBeVisible()
      await expect.element(issueButton(dialog)).toBeVisible()
      await expect
        .element(dialog.getByRole('combobox', { name: 'Scope' }))
        .toHaveTextContent('org-members:read')
    }
  })

  it("Scope select is labelled 'Scope', nothing preselected; Issue without a scope shows 'Select a scope.' linked to the trigger and sends no POST", async () => {
    const { client, seen } = fakeApi(appsServer(() => json(ISSUED, 201)))
    const screen = await renderApps(client)
    const { dialog } = await openDialog(screen)
    const trigger = dialog.getByRole('combobox', { name: 'Scope' })
    await expect.element(trigger).toHaveTextContent('Select a scope')
    await userEvent.click(issueButton(dialog))
    const message = dialog.getByText('Select a scope.')
    await expect.element(message).toBeVisible()
    const el = trigger.element()
    expect(el.getAttribute('aria-invalid')).toBe('true')
    expect(el.getAttribute('aria-describedby')).toContain(
      (message.element() as HTMLElement).id
    )
    expect(writes(seen, 'POST')).toHaveLength(0)
  })

  it('calechip offers 5 scopes (no limits:write)', async () => {
    const { client } = fakeApi(appsServer(() => json(ISSUED, 201)))
    const screen = await renderApps(client)
    const { dialog } = await openDialog(screen)
    await userEvent.click(dialog.getByRole('combobox', { name: 'Scope' }))
    expect(
      screen
        .getByRole('option')
        .elements()
        .map((o) => o.textContent)
    ).toEqual([
      'manifest',
      'releases',
      'org-members:read',
      'usage:read',
      'usage:write',
    ])
  })

  it('admin offers only releases and calls the dialog a control-plane CI secret', async () => {
    const { client } = fakeApi(appsServer(() => json(ISSUED, 201)))
    const adminScreen = await renderApps(client)
    const admin = await openDialog(adminScreen, 'admin')
    await userEvent.click(admin.dialog.getByRole('combobox', { name: 'Scope' }))
    expect(
      adminScreen
        .getByRole('option')
        .elements()
        .map((o) => o.textContent)
    ).toEqual(['releases'])
    await expect
      .element(admin.dialog.getByText(/CI secret for the control plane/))
      .toBeVisible()
  })

  it('manifest: the hint says CI deploy secret store and there is no runtime warning; a runtime scope shows the warning before Issue', async () => {
    const { client } = fakeApi(appsServer(() => json(ISSUED, 201)))
    const screen = await renderApps(client)
    const { dialog } = await openDialog(screen)
    await pickScope(screen, dialog, 'manifest')
    await expect
      .element(dialog.getByText(/CI deploy secret store/))
      .toBeVisible()
    await expect
      .element(dialog.getByText(/Backend deploy environment only/))
      .not.toBeInTheDocument()
    await pickScope(screen, dialog, 'usage:write')
    await expect
      .element(dialog.getByText(/can read or report usage for Calechip/))
      .toBeVisible()
  })

  it("network failure and 502: 'may have been created' message, Issue button removed (only Close), credentials list refetched", async () => {
    const { client, seen } = fakeApi(
      appsServer(() => apiError(502, 'bad_gateway'))
    )
    const screen = await renderApps(client)
    const { dialog } = await openDialog(screen)
    const before = credCalls(seen).length
    await issueWith(screen, dialog)
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent("couldn't confirm whether the credential was created")
    await expect.element(issueButton(dialog)).not.toBeInTheDocument()
    await expect
      .element(dialog.getByRole('button', { name: 'Close' }).first())
      .toBeVisible()
    expect(writes(seen, 'POST')).toHaveLength(1)
    await expect.poll(() => credCalls(seen).length).toBeGreaterThan(before)
  })
})
