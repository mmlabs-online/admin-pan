import { WithPermissions } from '@/test-utils/permissions'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { MOCK_ORGS } from './test-data'
import { OrganizationsHarness } from './test-fixtures'

describe('OrganizationsTable', () => {
  it('renders a row per organization with name, slug and status', async () => {
    const screen = await render(<OrganizationsHarness />)
    const table = screen.getByRole('table', { name: 'Organizations' })

    // header row + 3 data rows
    await expect.element(table.getByRole('row').nth(3)).toBeInTheDocument()
    expect(table.getByRole('row').elements()).toHaveLength(MOCK_ORGS.length + 1)

    await expect
      .element(table.getByText('Acme Corp', { exact: true }))
      .toBeInTheDocument()
    await expect
      .element(table.getByText('acme', { exact: true }))
      .toBeInTheDocument()
    await expect.element(table.getByText('Suspended')).toBeInTheDocument()
    await expect.element(table.getByText('No description')).toBeInTheDocument()
  })

  it('filters by name or slug', async () => {
    const screen = await render(<OrganizationsHarness />)
    const search = screen.getByPlaceholder('Filter by name or slug...')

    await userEvent.fill(search, 'glob')
    await expect
      .element(screen.getByText('Globex', { exact: true }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .not.toBeInTheDocument()

    await userEvent.fill(search, 'initech')
    await expect
      .element(screen.getByText('Initech', { exact: true }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Globex', { exact: true }))
      .not.toBeInTheDocument()

    await userEvent.fill(search, 'nothing-matches')
    await expect
      .element(screen.getByText('No organizations found.'))
      .toBeInTheDocument()
  })

  it('filters by status facet', async () => {
    const screen = await render(<OrganizationsHarness />)

    await userEvent.click(screen.getByRole('button', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: /Suspended/ }))

    await expect
      .element(screen.getByText('Globex', { exact: true }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Acme Corp', { exact: true }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText('Initech', { exact: true }))
      .not.toBeInTheDocument()
  })

  it('with only admin:organizations:read the row menu and New organization are hidden/disabled; with write they are shown', async () => {
    const readOnly = await render(
      <WithPermissions granted={['admin:organizations:read']}>
        <OrganizationsHarness />
      </WithPermissions>
    )
    await expect
      .element(readOnly.getByRole('button', { name: 'New organization' }))
      .toBeDisabled()
    await expect
      .element(readOnly.getByText('Requires admin:organizations:write'))
      .toBeVisible()
    await expect
      .element(readOnly.getByRole('button', { name: /^Actions for/ }))
      .not.toBeInTheDocument()
    await readOnly.unmount()

    const writer = await render(
      <WithPermissions granted={['admin:organizations:write']}>
        <OrganizationsHarness />
      </WithPermissions>
    )
    await expect
      .element(writer.getByRole('button', { name: 'New organization' }))
      .toBeEnabled()
    await expect
      .element(writer.getByRole('button', { name: 'Actions for Acme Corp' }))
      .toBeInTheDocument()
  })
})
