import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { OrganizationsHarness } from './test-fixtures'

describe('Organization create/edit dialog', () => {
  it('validates required fields and the slug format', async () => {
    const screen = await render(<OrganizationsHarness />)
    await userEvent.click(
      screen.getByRole('button', { name: 'New organization' })
    )
    const dialog = screen.getByRole('dialog', { name: 'New organization' })
    await expect.element(dialog).toBeInTheDocument()

    await userEvent.click(
      dialog.getByRole('button', { name: 'Create organization' })
    )
    await expect
      .element(dialog.getByText('Name is required.'))
      .toBeInTheDocument()
    await expect
      .element(dialog.getByText('Slug is required.'))
      .toBeInTheDocument()

    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Slug' }),
      'Bad Slug!'
    )
    await userEvent.click(
      dialog.getByRole('button', { name: 'Create organization' })
    )
    await expect
      .element(
        dialog.getByText('Use only lowercase letters, digits and hyphens.')
      )
      .toBeInTheDocument()
    await expect
      .element(dialog.getByRole('textbox', { name: 'Slug' }))
      .toHaveAttribute('aria-invalid', 'true')
  })

  it('shows a conflict error for a duplicate slug', async () => {
    const screen = await render(<OrganizationsHarness />)
    await userEvent.click(
      screen.getByRole('button', { name: 'New organization' })
    )
    const dialog = screen.getByRole('dialog', { name: 'New organization' })

    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Name' }),
      'Acme 2'
    )
    await userEvent.fill(dialog.getByRole('textbox', { name: 'Slug' }), 'acme')
    await userEvent.click(
      dialog.getByRole('button', { name: 'Create organization' })
    )

    await expect
      .element(
        dialog.getByText('An organization with slug "acme" already exists.')
      )
      .toBeInTheDocument()
    await expect.element(dialog).toBeInTheDocument()
  })

  it('creates an organization and adds it to the table', async () => {
    const screen = await render(<OrganizationsHarness />)
    await userEvent.click(
      screen.getByRole('button', { name: 'New organization' })
    )
    const dialog = screen.getByRole('dialog', { name: 'New organization' })

    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Name' }),
      'Umbrella'
    )
    await userEvent.fill(
      dialog.getByRole('textbox', { name: 'Slug' }),
      'umbrella'
    )
    await userEvent.click(
      dialog.getByRole('button', { name: 'Create organization' })
    )

    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('table').getByText('Umbrella', { exact: true }))
      .toBeInTheDocument()
  })

  it('edits an organization; slug is read-only', async () => {
    const screen = await render(<OrganizationsHarness />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Acme Corp' })
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))

    const dialog = screen.getByRole('dialog', { name: 'Edit organization' })
    const slug = dialog.getByRole('textbox', { name: 'Slug' })
    await expect.element(slug).toHaveValue('acme')
    await expect.element(slug).toHaveAttribute('readonly')

    const name = dialog.getByRole('textbox', { name: 'Name' })
    await userEvent.fill(name, '')
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await expect
      .element(dialog.getByText('Name is required.'))
      .toBeInTheDocument()

    await userEvent.fill(name, 'Acme Holdings')
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .element(
        screen.getByRole('table').getByText('Acme Holdings', { exact: true })
      )
      .toBeInTheDocument()
  })
})
