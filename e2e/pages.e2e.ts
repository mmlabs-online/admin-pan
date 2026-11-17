import type { Page } from '@playwright/test'
import { FAKE_CREDENTIAL } from '../src/test-utils/fake-credential'
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

test('apps: list from the API; detail sheet and permissions pass axe; disable dialog cancels without writes', async ({
  page,
  api,
  signIn,
}) => {
  await signIn('/apps')
  await expect(heading(page, 'Apps')).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(4)

  await page.getByRole('button', { name: 'View stoktok' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await selectTab(page, 'Permissions')
  await expect(sheet.getByText('stoktok:orders:read')).toBeVisible()
  await expectNoSeriousA11y(page, 'apps-sheet')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  await page.getByRole('button', { name: 'Actions for stoktok' }).click()
  await page.getByRole('menuitem', { name: 'Disable' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('stoktok')
  await expectNoSeriousA11y(page, 'apps-disable-dialog')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()

  expect(
    api.calls.filter(
      (c) =>
        c.path.startsWith('/api/v1/apps') &&
        ['POST', 'PATCH', 'DELETE'].includes(c.method)
    )
  ).toHaveLength(0)
})

test('apps credentials: list, issue shows the value once (masked, Show), close; second issue hits the limit inline; revoke confirm names the key id; no value in storage or URL; axe on tab and dialogs', async ({
  page,
  api,
  signIn,
}) => {
  await signIn('/apps')
  await expect(heading(page, 'Apps')).toBeVisible()
  await page.getByRole('button', { name: 'View stoktok' }).click()
  const sheet = page.getByRole('dialog')
  await selectTab(page, 'Credentials')
  await expect(sheet.getByText('e2e0000000000001')).toBeVisible()
  await expectNoSeriousA11y(page, 'apps-credentials')

  await sheet.getByRole('button', { name: 'Issue credential' }).click()
  const dialog = page.getByRole('dialog', { name: 'Issue credential' })
  await expect(dialog).toContainText('stoktok')
  await dialog.getByRole('button', { name: 'Issue credential' }).click()
  const issued = page.getByRole('dialog', { name: 'Credential issued' })
  await expect(issued).toBeVisible()
  const field = issued.getByLabel('Credential', { exact: true })
  await expect(field).not.toHaveValue(FAKE_CREDENTIAL)
  await expectNoSeriousA11y(page, 'apps-credential-issued')
  await issued.getByRole('button', { name: 'Show' }).click()
  await expect(field).toHaveValue(FAKE_CREDENTIAL)
  await issued.getByRole('button', { name: "I've saved it" }).click()
  await expect(issued).toBeHidden()

  expect(await page.content()).not.toContain(FAKE_CREDENTIAL)
  const stored = await page.evaluate(() =>
    JSON.stringify([
      Object.entries(localStorage),
      Object.entries(sessionStorage),
    ])
  )
  expect(stored).not.toContain(FAKE_CREDENTIAL)
  expect(page.url()).not.toContain(FAKE_CREDENTIAL)
  expect(api.count('POST /api/v1/apps/stoktok/credentials')).toBe(1)

  await sheet.getByRole('button', { name: 'Issue credential' }).click()
  const again = page.getByRole('dialog', { name: 'Issue credential' })
  await again.getByRole('button', { name: 'Issue credential' }).click()
  await expect(again).toContainText('already has 2 active credentials')
  await again.getByRole('button', { name: 'Cancel' }).click()
  await expect(again).toBeHidden()

  await sheet.getByRole('button', { name: 'Revoke e2e0000000000001' }).click()
  const revoke = page.getByRole('alertdialog')
  await expect(revoke).toContainText('e2e0000000000001')
  await expectNoSeriousA11y(page, 'apps-credential-revoke')
  await revoke.getByRole('button', { name: 'Cancel' }).click()
  await expect(revoke).toBeHidden()
  expect(api.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0)

  await sheet.getByRole('button', { name: 'Revoke e2e0000000000001' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Revoke', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  expect(api.calls.filter((c) => c.method === 'DELETE')).toHaveLength(1)
  await expect(
    sheet.getByRole('row', { name: /e2e0000000000001/ })
  ).toContainText('Revoked')
})

test('organizations entitlements: sheet and tab pass axe; grant calechip to Acme (one POST, exact body); disable confirm names Acme Corp and calechip, Cancel sends no PATCH, confirm sends one; suspended Globex shows Inactive', async ({
  page,
  api,
  signIn,
}) => {
  const acme = '44444441-4444-4444-8444-444444444444'
  await signIn('/organizations')
  await expect(heading(page, 'Organizations')).toBeVisible()
  await page.getByRole('button', { name: 'View Acme Corp' }).click()
  const sheet = page.getByRole('dialog', { name: /Acme Corp/ })
  await selectTab(page, 'Entitlements')
  await expect(sheet.getByText('No products granted yet.')).toBeVisible()
  await expectNoSeriousA11y(page, 'organizations-entitlements')

  await sheet.getByRole('button', { name: 'Grant product' }).click()
  const grant = page.getByRole('dialog', { name: 'Grant product' })
  await grant.getByRole('combobox', { name: 'App' }).click()
  await page.getByRole('option', { name: 'Calechip (calechip)' }).click()
  await grant.getByLabel('Plan').fill('pro')
  await grant.getByRole('button', { name: 'Add limit' }).click()
  await grant.getByLabel('Limit name, row 1').fill('seats')
  await grant.getByLabel('Value, row 1').fill('10')
  await expectNoSeriousA11y(page, 'organizations-entitlement-grant')
  await grant.getByRole('button', { name: 'Grant', exact: true }).click()
  await expect(grant).toBeHidden()
  await expect(
    sheet.getByRole('button', { name: 'Grant product' })
  ).toBeFocused()
  const post = `POST /api/v1/organizations/${acme}/entitlements`
  expect(api.count(post)).toBe(1)
  expect(api.calls.find((c) => `${c.method} ${c.path}` === post)?.body).toEqual(
    { app_key: 'calechip', plan: 'pro', limits: { seats: 10 } }
  )
  const row = sheet.getByRole('row', { name: /calechip/ })
  await expect(row).toContainText('seats: 10')
  await expect(row).toContainText('Active')

  const patches = () => api.calls.filter((c) => c.method === 'PATCH')
  await sheet.getByRole('switch', { name: 'calechip enabled' }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('Acme Corp')
  await expect(confirm).toContainText('calechip')
  await expectNoSeriousA11y(page, 'organizations-entitlement-disable')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toBeHidden()
  await expect(
    sheet.getByRole('switch', { name: 'calechip enabled' })
  ).toBeFocused()
  expect(patches()).toHaveLength(0)

  await sheet.getByRole('button', { name: 'Edit calechip' }).click()
  const edit = page.getByRole('dialog', { name: /^Edit calechip/ })
  await expect(edit).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(edit).toBeHidden()
  await expect(
    sheet.getByRole('button', { name: 'Edit calechip' })
  ).toBeFocused()

  await sheet.getByRole('switch', { name: 'calechip enabled' }).click()
  await confirm.getByRole('button', { name: 'Disable', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expect(
    sheet.getByRole('switch', { name: 'calechip enabled' })
  ).toBeFocused()
  expect(patches()).toHaveLength(1)
  expect(patches()[0].body).toEqual({ enabled: false })
  await expect(row).toContainText('Disabled')

  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'View Acme Corp' })
  ).toBeFocused()
  // closeWithRow clears the current row 500 ms after closing; opening another
  // row sooner would be unmounted by that timer (follow-up in impl-log).
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'View Globex' }).click()
  const globex = page.getByRole('dialog', { name: /Globex/ })
  await selectTab(page, 'Entitlements')
  await expect(globex.getByRole('row', { name: /calechip/ })).toContainText(
    'Inactive'
  )
  await expect(globex.getByText(/This organization is suspended/)).toBeVisible()
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
