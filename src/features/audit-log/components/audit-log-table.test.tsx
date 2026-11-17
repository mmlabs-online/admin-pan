import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { type ApiClient } from '@/api'
import { apiError, fakeApi, json, testQueryClient } from '@/test-utils/api'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { type AuditLogEntry } from '../data/schema'
import { toAuditRange } from '../lib/format'
import { AuditLogTable } from './audit-log-table'

const ID = '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c01'

const entry = (
  over: Partial<AuditLogEntry> & { id: string }
): AuditLogEntry => ({
  occurred_at: '2026-11-01T12:00:00Z',
  actor_kind: 'user',
  actor_user_id: ID,
  actor_label: null,
  action: 'auth.login_succeeded',
  outcome: 'success',
  target_type: 'user',
  target_id: ID,
  app_key: 'admin',
  org_id: null,
  changes: null,
  ip: '10.0.0.1',
  user_agent: 'Mozilla/5.0',
  request_id: `req-${over.id}`,
  ...over,
})

// Returned order is shown as is (newest first is the API's job).
const ROWS = [
  entry({
    id: 'a1',
    occurred_at: '2026-11-10T09:00:00Z',
    action: 'user.disabled',
    outcome: 'denied',
    target_id: null,
    target_type: null,
    app_key: null,
    changes: { status: { from: 'active', to: 'disabled' } },
  }),
  entry({
    id: 'a2',
    occurred_at: '2026-11-05T09:00:00Z',
    actor_kind: 'system',
    actor_user_id: null,
    actor_label: 'purge-job',
    action: 'audit_log.purged',
  }),
]

const page = (items = ROWS, total = items.length, offset = 0) =>
  json({ items, total, limit: 20, offset })

function Harness({
  client,
  initial = {},
}: {
  client: ApiClient
  initial?: Record<string, unknown>
}) {
  const [search, setSearch] = useState<Record<string, unknown>>(initial)
  const navigate: NavigateFn = ({ search: next }) => {
    if (next === true) return
    setSearch((prev) => (typeof next === 'function' ? next(prev) : next))
  }
  return (
    <QueryClientProvider client={testQueryClient()}>
      <div data-testid='search'>{JSON.stringify(search)}</div>
      <AuditLogTable search={search} navigate={navigate} api={client} />
    </QueryClientProvider>
  )
}

const renderTable = (client: ApiClient, initial?: Record<string, unknown>) =>
  render(<Harness client={client} initial={initial} />)

const lastUrl = (seen: Request[]) => new URL(seen[seen.length - 1].url)
const searchState = () =>
  JSON.parse(document.querySelector('[data-testid=search]')!.textContent!)

describe('AuditLogTable states', () => {
  it('loading: shows "Loading audit log…" in the live region and aria-busy', async () => {
    const { client } = fakeApi(() => new Promise<Response>(() => {}))
    const screen = await renderTable(client)
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Loading audit log…')
    await expect
      .element(screen.getByRole('table', { name: 'Audit log entries' }))
      .toHaveAttribute('aria-busy', 'true')
  })

  it('renders rows as returned; null target/app show —; outcome text shown', async () => {
    const { client } = fakeApi(() => page())
    const screen = await renderTable(client)
    await expect.element(screen.getByText('user.disabled')).toBeVisible()
    const rows = Array.from(document.querySelectorAll('tbody tr'))
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('user.disabled')
    expect(rows[0].textContent).toContain('Denied')
    expect(rows[0].textContent).toContain('—')
    expect(rows[1].textContent).toContain('purge-job')
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('2 entries, page 1 of 1')
  })

  it('empty (no filters)', async () => {
    const { client } = fakeApi(() => page([]))
    const screen = await renderTable(client)
    await expect
      .element(screen.getByRole('cell', { name: 'No audit entries yet.' }))
      .toBeVisible()
  })

  it('empty (filtered)', async () => {
    const { client } = fakeApi(() => page([]))
    const screen = await renderTable(client, { outcome: 'denied' })
    await expect
      .element(
        screen.getByRole('cell', {
          name: 'No audit entries match these filters.',
        })
      )
      .toBeVisible()
  })

  it('error shows alert and Retry refetches', async () => {
    let fail = true
    const { client, seen } = fakeApi(() =>
      fail ? apiError(500, 'internal_error') : page()
    )
    const screen = await renderTable(client)
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't load the audit log.")
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expect.element(screen.getByText('user.disabled')).toBeVisible()
    expect(seen.length).toBe(2)
  })

  it('422 shows the rejected-filters message with Reset', async () => {
    const { client } = fakeApi(() =>
      apiError(422, 'validation_error', [{ field: 'from' }])
    )
    const screen = await renderTable(client, { outcome: 'denied' })
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('The API rejected these filters.')
    expect(
      screen.getByRole('button', { name: 'Retry' }).elements()
    ).toHaveLength(0)
    await userEvent.click(
      screen.getByRole('alert').getByRole('button', { name: 'Reset' })
    )
    expect(searchState().outcome).toBeUndefined()
  })

  it('403 renders ForbiddenPanel and hides the table', async () => {
    const { client } = fakeApi(() =>
      apiError(403, 'permission_denied', { required: 'admin:audit:read' })
    )
    const screen = await renderTable(client)
    await expect.element(screen.getByText('admin:audit:read')).toBeVisible()
    expect(screen.getByRole('table').elements()).toHaveLength(0)
  })

  it('403 on refetch replaces stale rows', async () => {
    let deny = false
    const { client } = fakeApi(() =>
      deny
        ? apiError(403, 'permission_denied', { required: 'admin:audit:read' })
        : page()
    )
    const screen = await renderTable(client)
    await expect.element(screen.getByText('user.disabled')).toBeVisible()
    deny = true
    // Trigger a refetch through a filter change.
    await userEvent.click(screen.getByLabelText('Outcome'))
    await userEvent.click(screen.getByRole('option', { name: 'Denied' }))
    await expect.element(screen.getByText('admin:audit:read')).toBeVisible()
    expect(screen.getByText('purge-job').elements()).toHaveLength(0)
  })
})

describe('AuditLogTable filters and paging', () => {
  it('next page requests offset=20 and updates ?page', async () => {
    const { client, seen } = fakeApi(() => page(ROWS, 45))
    const screen = await renderTable(client)
    await expect.element(screen.getByText('user.disabled')).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Go to next page' })
    )
    await expect.poll(() => lastUrl(seen).searchParams.get('offset')).toBe('20')
    expect(searchState().page).toBe(2)
  })

  it('each filter control sends its param', async () => {
    const { client, seen } = fakeApi(() => page())
    const screen = await renderTable(client)
    await expect.element(screen.getByText('user.disabled')).toBeVisible()

    const pick = async (label: string, option: string) => {
      await userEvent.click(screen.getByLabelText(label))
      await userEvent.click(screen.getByRole('option', { name: option }))
    }
    await pick('Action', 'user.disabled')
    await expect
      .poll(() => lastUrl(seen).searchParams.get('action'))
      .toBe('user.disabled')
    await pick('Target type', 'User')
    await expect
      .poll(() => lastUrl(seen).searchParams.get('target_type'))
      .toBe('user')
    await pick('Outcome', 'Denied')
    await expect
      .poll(() => lastUrl(seen).searchParams.get('outcome'))
      .toBe('denied')
    await pick('Actor kind', 'System')
    await expect
      .poll(() => lastUrl(seen).searchParams.get('actor_kind'))
      .toBe('system')

    await userEvent.fill(screen.getByLabelText('App key'), 'admin')
    await expect
      .poll(() => lastUrl(seen).searchParams.get('app_key'))
      .toBe('admin')
    await userEvent.fill(screen.getByLabelText('Actor user ID'), ID)
    await expect
      .poll(() => lastUrl(seen).searchParams.get('actor_user_id'))
      .toBe(ID)
    await userEvent.fill(screen.getByLabelText('Target ID'), ID)
    await expect
      .poll(() => lastUrl(seen).searchParams.get('target_id'))
      .toBe(ID)
  })

  it('from and to days become local-day instants', async () => {
    const { client, seen } = fakeApi(() => page())
    await renderTable(client, { from: '2026-11-03', to: '2026-11-05' })
    await expect.poll(() => seen.length).toBeGreaterThan(0)
    const { from, to } = toAuditRange('2026-11-03', '2026-11-05')
    expect(lastUrl(seen).searchParams.get('from')).toBe(from)
    expect(lastUrl(seen).searchParams.get('to')).toBe(to)
  })

  it('changing a filter resets page', async () => {
    const { client } = fakeApi(() => page(ROWS, 45))
    const screen = await renderTable(client, { page: 2 })
    await expect.element(screen.getByText('user.disabled')).toBeVisible()
    await userEvent.click(screen.getByLabelText('Outcome'))
    await userEvent.click(screen.getByRole('option', { name: 'Denied' }))
    await expect.poll(() => searchState().outcome).toBe('denied')
    expect(searchState().page).toBeUndefined()
  })

  it('invalid actor id or app key shows an inline error and is not sent', async () => {
    const { client, seen } = fakeApi(() => page())
    const screen = await renderTable(client)
    await expect.element(screen.getByText('user.disabled')).toBeVisible()
    const input = screen.getByLabelText('Actor user ID')
    await userEvent.fill(input, 'alice@example.com')
    await expect.element(input).toHaveAttribute('aria-invalid', 'true')
    await expect
      .element(screen.getByText('Enter a user ID (UUID).'))
      .toBeVisible()
    await userEvent.fill(screen.getByLabelText('App key'), 'Bad Key')
    await expect
      .element(screen.getByLabelText('App key'))
      .toHaveAttribute('aria-invalid', 'true')
    await new Promise((r) => setTimeout(r, 500))
    expect(seen).toHaveLength(1)
    expect(JSON.stringify(searchState())).not.toContain('@')
    expect(seen.every((r) => !r.url.includes('%40'))).toBe(true)
  })

  it('a ?target=&targetType=user deep link sends target_id and target_type and shows the values', async () => {
    const { client, seen } = fakeApi(() => page())
    const screen = await renderTable(client, { targetType: 'user', target: ID })
    await expect.poll(() => seen.length).toBeGreaterThan(0)
    expect(lastUrl(seen).searchParams.get('target_id')).toBe(ID)
    expect(lastUrl(seen).searchParams.get('target_type')).toBe('user')
    await expect.element(screen.getByLabelText('Target ID')).toHaveValue(ID)
    await expect
      .element(screen.getByLabelText('Target type'))
      .toHaveTextContent('User')
  })

  it('date pickers show the local time zone note', async () => {
    const { client } = fakeApi(() => page())
    const screen = await renderTable(client)
    const note = screen.getByText(/Dates use your time zone/)
    await expect.element(note).toBeVisible()
    await expect
      .element(note)
      .toHaveTextContent(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it('from after to shows an inline error and sends no request', async () => {
    const { client, seen } = fakeApi(() => page())
    const screen = await renderTable(client, {
      from: '2026-11-05',
      to: '2026-11-03',
    })
    await expect
      .element(
        screen.getByText('Start date must be on or before the end date.')
      )
      .toBeVisible()
    await new Promise((r) => setTimeout(r, 200))
    expect(seen).toHaveLength(0)
  })

  it('Reset clears every filter key and page', async () => {
    const { client } = fakeApi(() => page())
    const screen = await renderTable(client, {
      page: 2,
      outcome: 'denied',
      app: 'admin',
      actor: ID,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await expect.poll(() => searchState().outcome).toBeUndefined()
    const s = searchState()
    expect(s.app).toBeUndefined()
    expect(s.actor).toBeUndefined()
    expect(s.page).toBeUndefined()
    await expect.element(screen.getByLabelText('App key')).toHaveValue('')
  })

  it('has no export button and no sortable headers', async () => {
    const { client } = fakeApi(() => page())
    const screen = await renderTable(client)
    await expect.element(screen.getByText('user.disabled')).toBeVisible()
    expect(
      screen.getByRole('button', { name: /export|csv/i }).elements()
    ).toHaveLength(0)
    const headers = document.querySelectorAll('thead th button')
    expect(headers).toHaveLength(0)
  })

  it('View button opens the detail sheet (keyboard: Enter)', async () => {
    const { client } = fakeApi(() => page())
    const screen = await renderTable(client)
    await expect.element(screen.getByText('user.disabled')).toBeVisible()
    const view = screen.getByRole('button', { name: /^View user\.disabled at/ })
    ;((await view.element()) as HTMLElement).focus()
    await userEvent.keyboard('{Enter}')
    await expect
      .element(
        screen.getByRole('dialog').getByRole('heading', { name: 'Changes' })
      )
      .toBeVisible()
  })
})
