import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { Toaster } from '@/components/ui/sonner'
import { type AuditLogEntry } from '../data/schema'
import { AuditLogDetailSheet } from './audit-log-detail-sheet'

const entry = (over: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: '11111111-1111-4111-8111-111111111111',
  occurred_at: '2026-11-01T12:00:00Z',
  actor_kind: 'user',
  actor_user_id: '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c01',
  actor_label: null,
  action: 'user.disabled',
  outcome: 'success',
  target_type: 'user',
  target_id: '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c02',
  app_key: 'admin',
  org_id: null,
  changes: null,
  ip: '10.0.0.1',
  user_agent: 'Mozilla/5.0',
  request_id: 'req-123',
  ...over,
})

const show = (e: AuditLogEntry) =>
  render(
    <>
      <AuditLogDetailSheet entry={e} onOpenChange={() => {}} />
      <Toaster />
    </>
  )

describe('AuditLogDetailSheet', () => {
  it('shows every field; null fields show —', async () => {
    const screen = await show(
      entry({ org_id: null, ip: null, user_agent: null, app_key: null })
    )
    const dialog = screen.getByRole('dialog')
    await expect
      .element(dialog.getByText('Mozilla/5.0'))
      .not.toBeInTheDocument()
    await expect.element(dialog.getByText('Organization ID')).toBeVisible()
    const dds = Array.from(document.querySelectorAll('dd')).map(
      (d) => d.textContent
    )
    expect(dds.filter((t) => t === '—').length).toBeGreaterThanOrEqual(4)
    await expect.element(dialog.getByText('req-123')).toBeVisible()
  })

  it('renders from/to changes as a Field/Before/After table', async () => {
    const screen = await show(
      entry({ changes: { status: { from: 'active', to: 'disabled' } } })
    )
    const table = screen.getByRole('table', { name: 'Before and after' })
    await expect
      .element(table.getByRole('columnheader', { name: 'Before' }))
      .toBeVisible()
    await expect
      .element(table.getByRole('columnheader', { name: 'After' }))
      .toBeVisible()
    await expect.element(table.getByText('"active"')).toBeVisible()
    await expect.element(table.getByText('"disabled"')).toBeVisible()
  })

  it('renders a flat map as Field/Value', async () => {
    const screen = await show(entry({ changes: { reason: 'bad_password' } }))
    const table = screen.getByRole('table', { name: 'Recorded values' })
    await expect
      .element(table.getByRole('columnheader', { name: 'Value' }))
      .toBeVisible()
    await expect.element(table.getByText('"bad_password"')).toBeVisible()
  })

  it('changes null shows "No changes recorded for this event."', async () => {
    const screen = await show(entry({ changes: null }))
    await expect
      .element(screen.getByText('No changes recorded for this event.'))
      .toBeVisible()
  })

  it('R6: HTML payloads in changes, user_agent and actor_label render as text', async () => {
    const html = '<img src=x onerror=alert(1)><script>alert(1)</script>'
    const screen = await show(
      entry({
        actor_kind: 'system',
        actor_label: html,
        user_agent: html,
        changes: { name: { from: html, to: html }, note: html },
      })
    )
    await expect.element(screen.getByRole('dialog')).toBeVisible()
    const dialog = document.querySelector('[role=dialog]')!
    expect(dialog.querySelector('img, script')).toBeNull()
    expect(dialog.textContent).toContain('<img src=x')
  })

  it('unknown action string renders with the neutral tone', async () => {
    const screen = await show(entry({ action: 'brand.new_action' }))
    await expect
      .element(screen.getByText('brand.new_action').first())
      .toBeVisible()
  })

  it('Copy request ID: success and failure toasts; button hidden when request_id is null', async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValueOnce()
    const screen = await show(entry())
    await screen.getByRole('button', { name: 'Copy request ID' }).click()
    expect(writeText).toHaveBeenCalledWith('req-123')
    await expect.element(screen.getByText('Request ID copied')).toBeVisible()
    writeText.mockRejectedValueOnce(new Error('denied'))
    await screen.getByRole('button', { name: 'Copy request ID' }).click()
    await expect
      .element(screen.getByText('Could not copy the request ID'))
      .toBeVisible()
    writeText.mockRestore()
    const none = await show(entry({ request_id: null }))
    expect(
      none.getByRole('button', { name: 'Copy request ID' }).elements()
    ).toHaveLength(0)
  })
})
