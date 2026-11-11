import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { type AuditLogEntry } from '../data/schema'
import { AuditLogTable } from './audit-log-table'

function makeEntry(
  overrides: Partial<AuditLogEntry> & Pick<AuditLogEntry, 'id'>
): AuditLogEntry {
  return {
    occurred_at: '2026-11-01T12:00:00.000Z',
    actor_user_id: 'user-1',
    actor_email: 'ops@mmlabs.online',
    action: 'auth.login.success',
    target_type: 'session',
    target_id: 'session-0001',
    app_key: 'admin',
    org_id: null,
    changes: null,
    ip: '10.0.0.1',
    user_agent: 'Mozilla/5.0',
    request_id: `req_${overrides.id}`,
    ...overrides,
  }
}

// Deliberately not sorted by time: the table must show newest first.
const DATA: AuditLogEntry[] = [
  makeEntry({
    id: 'old',
    occurred_at: '2026-10-20T08:00:00.000Z',
    action: 'auth.logout',
  }),
  makeEntry({
    id: 'newest',
    occurred_at: '2026-11-10T09:00:00.000Z',
    actor_user_id: 'user-2',
    actor_email: 'alice@mmlabs.online',
    action: 'organization.update',
    target_type: 'organization',
    target_id: 'org-acme-1234',
    app_key: null,
    changes: {
      before: { name: 'Acme Old' },
      after: { name: 'Acme New' },
    },
  }),
  makeEntry({
    id: 'middle',
    occurred_at: '2026-11-05T09:00:00.000Z',
    actor_user_id: null,
    actor_email: null,
    action: 'user.disable',
    target_type: 'user',
    target_id: 'user-9',
    app_key: null,
    changes: { before: { status: 'active' }, after: { status: 'disabled' } },
  }),
]

function dataRows() {
  return Array.from(document.querySelectorAll('tbody tr'))
}

describe('AuditLogTable', () => {
  const navigate = vi.fn()
  beforeEach(() => vi.clearAllMocks())

  it('renders entries newest first', async () => {
    const screen = await render(
      <AuditLogTable data={DATA} search={{}} navigate={navigate} />
    )
    await expect
      .element(screen.getByRole('table', { name: 'Audit log entries' }))
      .toBeInTheDocument()
    const rows = dataRows()
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('organization.update')
    expect(rows[1].textContent).toContain('user.disable')
    expect(rows[2].textContent).toContain('auth.logout')
  })

  it('filters by actor text and writes it to the URL', async () => {
    const screen = await render(
      <AuditLogTable data={DATA} search={{}} navigate={navigate} />
    )
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'Actor' }),
      'system'
    )
    await expect.poll(() => dataRows().length).toBe(1)
    expect(dataRows()[0].textContent).toContain('System')
    expect(navigate).toHaveBeenCalled()
    const patches = navigate.mock.calls.map(([opts]) => opts.search({}))
    expect(patches).toContainEqual(expect.objectContaining({ actor: 'system' }))
  })

  it('filters by the action facet', async () => {
    const screen = await render(
      <AuditLogTable data={DATA} search={{}} navigate={navigate} />
    )
    await screen.getByRole('button', { name: 'Action' }).click()
    await screen.getByRole('option', { name: /auth\.logout/ }).click()
    await expect.poll(() => dataRows().length).toBe(1)
    expect(dataRows()[0].textContent).toContain('auth.logout')
  })

  it('applies target type and date range filters from the URL search', async () => {
    await render(
      <AuditLogTable
        data={DATA}
        search={{ targetType: ['user', 'session'] }}
        navigate={navigate}
      />
    )
    expect(dataRows()).toHaveLength(2)
    expect(dataRows()[0].textContent).toContain('user.disable')
  })

  it('applies the from/to date range', async () => {
    await render(
      <AuditLogTable
        data={DATA}
        search={{ from: '2026-11-01', to: '2026-11-06' }}
        navigate={navigate}
      />
    )
    expect(dataRows()).toHaveLength(1)
    expect(dataRows()[0].textContent).toContain('user.disable')
  })

  it('shows an empty state when nothing matches', async () => {
    const screen = await render(
      <AuditLogTable
        data={DATA}
        search={{ actor: 'nobody' }}
        navigate={navigate}
      />
    )
    await expect
      .element(screen.getByText('No audit entries match these filters.'))
      .toBeInTheDocument()
  })

  it('opens the detail sheet with before/after and copies the request ID', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      writeText,
    } as unknown as Clipboard)

    const screen = await render(
      <AuditLogTable data={DATA} search={{}} navigate={navigate} />
    )
    await screen
      .getByRole('button', { name: /View organization\.update/ })
      .click()

    const sheet = screen.getByRole('dialog')
    await expect.element(sheet).toBeInTheDocument()
    await expect.element(sheet.getByText('org-acme-1234')).toBeInTheDocument()
    await expect
      .element(sheet.getByLabelText('Before'))
      .toHaveTextContent('"name": "Acme Old"')
    await expect
      .element(sheet.getByLabelText('After'))
      .toHaveTextContent('"name": "Acme New"')
    await expect
      .element(sheet.getByLabelText('Diff'))
      .toHaveTextContent('- name: "Acme Old"+ name: "Acme New"')

    await sheet.getByRole('button', { name: 'Copy request ID' }).click()
    expect(writeText).toHaveBeenCalledWith('req_newest')
  })
})
