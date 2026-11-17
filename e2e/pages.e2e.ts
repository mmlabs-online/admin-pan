import type { Page } from '@playwright/test'
import { expectNoSeriousA11y } from './support/a11y'
import { expect, test } from './support/fixtures'

test.use({ viewport: { width: 1280, height: 800 } })

const heading = (page: Page, name: string) =>
  page.getByRole('heading', { name, exact: true }).first()

async function openAndCancelDialog(page: Page, button: string) {
  await page.getByRole('button', { name: button }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
}

async function selectTab(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
}

const pages: {
  id: string
  path: string
  heading: string
  action?: (page: Page) => Promise<void>
}[] = [
  {
    id: 'dashboard',
    path: '/',
    heading: 'Dashboard',
    action: (p) => selectTab(p, 'Activity'),
  },
  {
    id: 'reports',
    path: '/reports',
    heading: 'Reports',
    action: (p) => selectTab(p, 'Overview'),
  },
  {
    id: 'organizations',
    path: '/organizations',
    heading: 'Organizations',
    action: (p) => openAndCancelDialog(p, 'New organization'),
  },
  {
    id: 'apps',
    path: '/apps',
    heading: 'Apps',
    action: (p) => openAndCancelDialog(p, 'Register app'),
  },
  {
    id: 'roles',
    path: '/roles',
    heading: 'Roles',
    action: (p) => openAndCancelDialog(p, 'New role'),
  },
  { id: 'settings-profile', path: '/settings', heading: 'Settings' },
  { id: 'settings-account', path: '/settings/account', heading: 'Settings' },
  { id: 'settings-display', path: '/settings/display', heading: 'Settings' },
  {
    id: 'settings-appearance',
    path: '/settings/appearance',
    heading: 'Settings',
    action: async (p) => {
      const html = p.locator('html')
      await p.getByRole('radio', { name: 'Dark' }).check({ force: true })
      await p.getByRole('button', { name: 'Update preferences' }).click()
      await expect(html).toHaveClass(/dark/)
      await p.getByRole('radio', { name: 'Light' }).check({ force: true })
      await p.getByRole('button', { name: 'Update preferences' }).click()
      await expect(html).not.toHaveClass(/dark/)
    },
  },
]

for (const p of pages) {
  test(`${p.id}: opens, does its safe action, passes axe`, async ({
    page,
    signIn,
  }) => {
    await signIn(p.path)
    await expect(heading(page, p.heading)).toBeVisible()
    await p.action?.(page)
    await expectNoSeriousA11y(page, p.id)
  })
}

for (const [id, path] of [
  ['forgot-password', '/forgot-password'],
  ['verify-email', '/verify-email'],
  ['reset-password', '/reset-password'],
]) {
  test(`${id}: opens signed out and passes axe`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoSeriousA11y(page, id)
  })
}

test('users: server-side email filter, disable dialog cancels without PATCH', async ({
  page,
  api,
  signIn,
}) => {
  await signIn('/users')
  await expect(heading(page, 'Users')).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(4)
  await expectNoSeriousA11y(page, 'users')

  const fragment = 'bob'
  const request = page.waitForRequest(
    (r) =>
      new URL(r.url()).pathname === '/api/v1/users' &&
      new URL(r.url()).searchParams.get('email') === fragment
  )
  await page.getByLabel('Filter by email...').fill(fragment)
  await request
  await expect(page.getByRole('row')).toHaveCount(2)
  expect(
    api.calls.filter(
      (c) => c.path === '/api/v1/users' && c.query.get('email') === fragment
    )
  ).toHaveLength(1)

  const trigger = page.getByRole('button', { name: /Open actions for bob@/ })
  await trigger.click()
  await page.getByRole('menuitem', { name: /^Disable/ }).click()
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
  await expect(dialog).toContainText('bob@people.e2e.test')
  await expectNoSeriousA11y(page, 'users-confirm-dialog')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0)
})

test('organizations: list from the API; suspend and delete dialogs cancel without writes', async ({
  page,
  api,
  signIn,
}) => {
  await signIn('/organizations')
  await expect(heading(page, 'Organizations')).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(4)

  await page.getByRole('button', { name: 'Actions for Acme Corp' }).click()
  await page.getByRole('menuitem', { name: 'Suspend' }).click()
  const suspend = page.getByRole('alertdialog')
  await expect(suspend).toContainText('acme')
  await expectNoSeriousA11y(page, 'organizations-suspend-dialog')
  await suspend.getByRole('button', { name: 'Cancel' }).click()
  await expect(suspend).toBeHidden()

  await page.getByRole('button', { name: 'Actions for Acme Corp' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const del = page.getByRole('alertdialog')
  const confirm = del.getByRole('button', { name: 'Delete' })
  await expect(confirm).toBeDisabled()
  await del.getByLabel('Type acme to confirm').fill('acm')
  await expect(confirm).toBeDisabled()
  await del.getByLabel('Type acme to confirm').fill('acme')
  await expect(confirm).toBeEnabled()
  await expectNoSeriousA11y(page, 'organizations-delete-dialog')
  await del.getByRole('button', { name: 'Cancel' }).click()
  await expect(del).toBeHidden()

  expect(
    api.calls.filter(
      (c) =>
        c.path.startsWith('/api/v1/organizations') &&
        ['PATCH', 'POST', 'DELETE'].includes(c.method)
    )
  ).toHaveLength(0)
})

test('audit-log: detail sheet with raw JSON passes axe', async ({
  page,
  signIn,
}) => {
  await signIn('/audit-log')
  await expect(heading(page, 'Audit log')).toBeVisible()
  const view = page.getByRole('button', { name: /^View / }).first()
  await expect(view).toBeVisible()
  await expectNoSeriousA11y(page, 'audit-log')
  await view.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await sheet.getByText('Raw JSON').click()
  await expectNoSeriousA11y(page, 'audit-log-sheet')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
})

test('sidebar lists every main page', async ({ page, signIn }) => {
  await signIn('/')
  for (const name of [
    'Dashboard',
    'Reports',
    'Users',
    'Organizations',
    'Apps',
    'Roles',
    'Audit log',
  ]) {
    await expect(
      page.getByRole('link', { name, exact: true }).first()
    ).toBeVisible()
  }
  await page.getByRole('button', { name: 'Settings' }).first().click()
  for (const name of ['Profile', 'Account', 'Appearance', 'Display']) {
    await expect(
      page.getByRole('link', { name, exact: true }).first()
    ).toBeVisible()
  }
  await page.getByRole('link', { name: 'Users', exact: true }).first().click()
  await expect(heading(page, 'Users')).toBeVisible()
})
