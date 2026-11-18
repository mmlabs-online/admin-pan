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
    action: async (p) => {
      await p.getByText('Show data as table').first().click()
      await expect(
        p.getByRole('cell', { name: 'Nov 2026 (partial)' })
      ).toBeVisible()
    },
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

  await page.getByLabel('Search organizations').fill('glob')
  await expect(page.getByRole('row')).toHaveCount(2)
  await expect(
    page.getByRole('cell', { name: 'Globex', exact: true })
  ).toBeVisible()
  expect(
    api.calls.filter(
      (c) => c.path === '/api/v1/organizations' && c.query.get('q') === 'glob'
    )
  ).toHaveLength(1)
  await page.getByLabel('Search organizations').fill('')
  await expect(page.getByRole('row')).toHaveCount(4)
  await page.getByRole('combobox', { name: 'Status' }).click()
  await page.getByRole('option', { name: 'Suspended' }).click()
  await expect(page.getByRole('row')).toHaveCount(2)
  expect(
    api.calls.some(
      (c) =>
        c.path === '/api/v1/organizations' &&
        c.query.get('status') === 'suspended'
    )
  ).toBe(true)
  await expectNoSeriousA11y(page, 'organizations-list-toolbar')
  await page.getByRole('button', { name: 'Reset filters' }).click()
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

  await page.getByLabel('Search apps').fill('stok')
  await expect(page.getByRole('row')).toHaveCount(2)
  expect(
    api.calls.some(
      (c) => c.path === '/api/v1/apps' && c.query.get('q') === 'stok'
    )
  ).toBe(true)
  await page.getByLabel('Search apps').fill('')
  await expect(page.getByRole('row')).toHaveCount(4)
  await page.getByRole('combobox', { name: 'Join policy' }).click()
  await page.getByRole('option', { name: 'Closed' }).click()
  // The seeded admin app is always listed.
  await expect(
    page.getByRole('cell', { name: 'Admin console', exact: true })
  ).toBeVisible()
  expect(
    api.calls.some(
      (c) =>
        c.path === '/api/v1/apps' && c.query.get('join_policy') === 'closed'
    )
  ).toBe(true)
  await expectNoSeriousA11y(page, 'apps-list-toolbar')
  await page.getByRole('button', { name: 'Reset filters' }).click()
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

test('roles: calechip by default; switch to stoktok; permissions dialog and delete confirm pass axe; Cancel sends no writes', async ({
  page,
  api,
  signIn,
}) => {
  await signIn('/roles')
  await expect(heading(page, 'Roles')).toBeVisible()
  await expect(page.getByText('calechip:member')).toBeVisible()

  await page.getByRole('combobox', { name: 'App' }).click()
  await page.getByRole('option', { name: 'Stoktok (stoktok)' }).click()
  await expect(page).toHaveURL(/app=stoktok/)
  await expect(page.getByText('stoktok:operator')).toBeVisible()

  await page
    .getByRole('button', { name: 'Actions for stoktok:operator' })
    .click()
  await page.getByRole('menuitem', { name: 'Permissions' }).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('checkbox', { name: 'stoktok:orders:write' })
  ).toBeChecked()
  await expectNoSeriousA11y(page, 'roles-permissions')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page
    .getByRole('button', { name: 'Actions for stoktok:operator' })
    .click()
  await page.getByRole('menuitem', { name: /Delete/ }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('stoktok:operator')
  await expectNoSeriousA11y(page, 'roles-delete-confirm')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toBeHidden()

  expect(
    api.calls.filter(
      (c) =>
        c.path.startsWith('/api/v1/apps') &&
        ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.method)
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

test('apps join requests: stoktok tab lists pending, passes axe; reject confirm names requester and app, Cancel sends no POST and focus returns to Reject; approve sends one POST with no body, the row leaves the pending list, focus on the heading; Approved filter shows it; no email in any request URL', async ({
  page,
  api,
  signIn,
}) => {
  await signIn('/apps')
  await expect(heading(page, 'Apps')).toBeVisible()
  await page.getByRole('button', { name: 'View stoktok' }).click()
  const sheet = page.getByRole('dialog')
  await selectTab(page, 'Join requests')
  await expect(sheet.getByText('Ada Lovelace')).toBeVisible()
  await expectNoSeriousA11y(page, 'apps-join-requests')

  const reject = sheet.getByRole('button', { name: 'Reject Ada Lovelace' })
  await reject.click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Ada Lovelace')
  await expect(dialog).toContainText('Stoktok')
  await expectNoSeriousA11y(page, 'apps-join-request-reject')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(reject).toBeFocused()
  expect(
    api.calls.filter(
      (c) => c.method === 'POST' && c.path.includes('/join-requests/')
    )
  ).toHaveLength(0)

  await sheet.getByRole('button', { name: 'Approve Ada Lovelace' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Approve', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  const posts = api.calls.filter(
    (c) => c.method === 'POST' && c.path.includes('/join-requests/')
  )
  expect(posts).toHaveLength(1)
  expect(posts[0].path).toMatch(
    /^\/api\/v1\/apps\/stoktok\/join-requests\/[0-9a-f-]+\/approve$/
  )
  expect(posts[0].body).toBeUndefined()
  await expect(
    sheet.getByRole('heading', { name: 'Join requests' })
  ).toBeFocused()
  await expect(sheet.getByText('Ada Lovelace')).toBeHidden()
  await expect(sheet.getByText('bob@people.e2e.test')).toBeVisible()

  await sheet.getByRole('combobox', { name: 'Status' }).click()
  await page.getByRole('option', { name: 'Approved' }).click()
  await expect(sheet.getByText('Ada Lovelace')).toBeVisible()
  await expect(sheet.getByText(/\(by you\)/)).toBeVisible()

  expect(
    api.calls.every(
      (c) =>
        !c.path.includes('@') &&
        ![...c.query.values()].some((v) => v.includes('@'))
    )
  ).toBe(true)
})

test('role assignments: ada sheet -> Assign role stoktok:viewer (one POST, exact body, effect note, axe); revoke confirm names ada and the role, Cancel sends no DELETE, Confirm sends one; roles -> stoktok:viewer -> Assignments sheet passes axe; no email in a request URL other than /users?email=', async ({
  page,
  api,
  signIn,
}) => {
  const VIEWER_ID = 'd1000001-0000-4000-8000-000000000001'
  const posts = () =>
    api.calls.filter(
      (c) => c.method === 'POST' && c.path.endsWith('/role-assignments')
    )
  const deletes = () => api.calls.filter((c) => c.method === 'DELETE')
  await signIn('/users')
  await expect(heading(page, 'Users')).toBeVisible()
  await page
    .getByRole('button', { name: /Open actions for ada@people\.e2e\.test/ })
    .click()
  await page.getByRole('menuitem', { name: /View details/ }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('No role assignments.')).toBeVisible()

  await sheet.getByRole('button', { name: 'Assign role' }).click()
  const assign = page.getByRole('dialog', { name: /Assign a role to/ })
  await assign.getByRole('combobox', { name: 'App' }).click()
  await page.getByRole('option', { name: /Stoktok/ }).click()
  await assign.getByRole('combobox', { name: 'Role' }).click()
  await page.getByRole('option', { name: /Viewer \(stoktok:viewer\)/ }).click()
  // Stoktok has org mode none: no scope field.
  await expect(assign.getByRole('radio', { name: 'App-wide' })).toHaveCount(0)
  await expectNoSeriousA11y(page, 'users-role-assign')
  await assign.getByRole('button', { name: 'Grant role' }).click()
  await expect(assign).toBeHidden()
  expect(posts()).toHaveLength(1)
  expect(posts()[0].path).toMatch(
    /^\/api\/v1\/users\/[0-9a-f-]+\/role-assignments$/
  )
  expect(posts()[0].body).toEqual({ role_id: VIEWER_ID })
  await expect(sheet.getByRole('row', { name: /stoktok:viewer/ })).toBeVisible()
  await expect(
    sheet.getByText(/Granted stoktok:viewer in stoktok\./)
  ).toContainText('up to 12 hours')
  await expectNoSeriousA11y(page, 'users-role-assignments')

  const rowRevoke = sheet.getByRole('button', {
    name: 'Revoke stoktok:viewer in stoktok',
  })
  // The sheet is aria-hidden while the dialog is open: grab the handle first.
  const trigger = await rowRevoke.elementHandle()
  await rowRevoke.click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('ada@people.e2e.test')
  await expect(dialog).toContainText('stoktok:viewer')
  await expect(dialog).toContainText('App-wide')
  await expectNoSeriousA11y(page, 'users-role-revoke')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  expect(deletes()).toHaveLength(0)
  expect(
    await page.evaluate((el) => document.activeElement === el, trigger)
  ).toBe(true)
  await rowRevoke.click()
  await dialog.getByRole('button', { name: 'Revoke role' }).click()
  await expect(dialog).toBeHidden()
  expect(deletes()).toHaveLength(1)
  expect(deletes()[0].path).toMatch(
    /^\/api\/v1\/users\/[0-9a-f-]+\/role-assignments\/eeeeeee1-eeee-4eee-8eee-eeeeeeeeeeee$/
  )
  await expect(sheet.getByText('No role assignments.')).toBeVisible()

  await page.goto('/roles?app=stoktok')
  await expect(heading(page, 'Roles')).toBeVisible()
  await page.getByRole('button', { name: 'Actions for stoktok:viewer' }).click()
  await page.getByRole('menuitem', { name: /Assignments/ }).click()
  const holders = page.getByRole('dialog')
  await expect(
    holders.getByRole('heading', {
      name: 'Assignments of Viewer (stoktok:viewer)',
    })
  ).toBeVisible()
  await expect(holders.getByText('No one holds this role.')).toBeVisible()
  await expectNoSeriousA11y(page, 'roles-holders')

  expect(
    api.calls.every(
      (c) =>
        c.path === '/api/v1/users' ||
        (!c.path.includes('@') &&
          ![...c.query.values()].some((v) => v.includes('@')))
    )
  ).toBe(true)
})

test('users sessions: Sessions tab lists ada sessions and passes axe; revoke one: confirm names ada, Cancel sends no DELETE and focus returns to the row Revoke; Confirm sends one DELETE, the row leaves, focus on the heading; revoke all: Cancel returns focus to Revoke all, Confirm sends one DELETE and shows No active sessions; no IP or user agent in any request URL', async ({
  page,
  api,
  signIn,
}) => {
  const deletes = () => api.calls.filter((c) => c.method === 'DELETE')
  await signIn('/users')
  await expect(heading(page, 'Users')).toBeVisible()
  await page
    .getByRole('button', { name: /Open actions for ada@people\.e2e\.test/ })
    .click()
  await page.getByRole('menuitem', { name: /View details/ }).click()
  const sheet = page.getByRole('dialog')
  await selectTab(page, 'Sessions')
  const sessionsHeading = sheet.getByRole('heading', {
    name: 'Active sessions',
  })
  await expect(sessionsHeading).toBeVisible()
  await expect(sheet.getByRole('row')).toHaveCount(3)
  await expectNoSeriousA11y(page, 'users-sessions')

  const rowRevoke = sheet.getByRole('button', {
    name: /^Revoke session created/,
  })
  // The sheet is aria-hidden while the dialog is open: grab the handle first.
  const trigger = await rowRevoke.first().elementHandle()
  await rowRevoke.first().click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('ada@people.e2e.test')
  await expect(dialog).toContainText('up to 12 hours')
  await expectNoSeriousA11y(page, 'users-session-revoke')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  expect(deletes()).toHaveLength(0)
  expect(
    await page.evaluate((el) => document.activeElement === el, trigger)
  ).toBe(true)

  await rowRevoke.first().click()
  await dialog.getByRole('button', { name: 'Revoke session' }).click()
  await expect(dialog).toBeHidden()
  expect(deletes()).toHaveLength(1)
  expect(deletes()[0].path).toMatch(
    /^\/api\/v1\/users\/[0-9a-f-]+\/sessions\/aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa$/
  )
  await expect(sheet.getByRole('row')).toHaveCount(2)
  await expect(sessionsHeading).toBeFocused()

  const revokeAll = sheet.getByRole('button', { name: 'Revoke all' })
  await revokeAll.click()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(revokeAll).toBeFocused()
  expect(deletes()).toHaveLength(1)
  await revokeAll.click()
  await dialog.getByRole('button', { name: 'Revoke all sessions' }).click()
  await expect(dialog).toBeHidden()
  expect(deletes()).toHaveLength(2)
  expect(deletes()[1].path).toMatch(/^\/api\/v1\/users\/[0-9a-f-]+\/sessions$/)
  await expect(sheet.getByText('No active sessions.')).toBeVisible()
  await expect(sessionsHeading).toBeFocused()

  expect(
    api.calls.every(
      (c) =>
        !`${c.path}?${c.query.toString()}`.includes('203.0.113.7') &&
        !`${c.path}?${c.query.toString()}`.includes('Mozilla')
    )
  ).toBe(true)
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
