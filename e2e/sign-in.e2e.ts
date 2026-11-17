import { expectNoSeriousA11y } from './support/a11y'
import { PASSWORD, TOKEN } from './support/fake-api'
import { expect, test } from './support/fixtures'

test.use({ viewport: { width: 1280, height: 800 } })

test('signs in through the real form and lands on the dashboard', async ({
  page,
  api,
  signIn,
}) => {
  await signIn()
  await expect(
    page.getByRole('heading', { name: 'Dashboard', exact: true })
  ).toBeVisible()
  expect(page.url()).not.toContain('/sign-in')
  expect(api.count('POST /api/v1/auth/login')).toBe(1)
  expect(api.count('POST /api/v1/auth/token')).toBeGreaterThanOrEqual(1)
})

test('wrong password shows an error and stays on sign-in', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill('staff@e2e.test')
  const password = page.getByLabel('Password', { exact: true })
  await password.fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Email or password is incorrect.'
  )
  await expect(password).toHaveValue('')
  expect(new URL(page.url()).pathname).toBe('/sign-in')
})

test('a protected URL redirects to sign-in and back after login', async ({
  page,
  signIn,
}) => {
  await page.goto('/users')
  await page.waitForURL(/\/sign-in\?redirect=/)
  await signIn('/users')
  await expect(page).toHaveURL(/\/users$/)
  await expect(
    page.getByRole('heading', { name: 'Users', exact: true })
  ).toBeVisible()
})

test('sign-in page has no serious or critical axe violations', async ({
  page,
}) => {
  await page.goto('/sign-in')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expectNoSeriousA11y(page, 'sign-in')
  await page.getByLabel('Email').fill('staff@e2e.test')
  await page.getByLabel('Password', { exact: true }).fill('wrong')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expectNoSeriousA11y(page, 'sign-in-error')
})

test('session survives a reload (token in memory, re-fetched)', async ({
  page,
  api,
  signIn,
}) => {
  await signIn('/users')
  await expect(
    page.getByRole('heading', { name: 'Users', exact: true })
  ).toBeVisible()
  const accounts = api.count('GET /api/v1/auth/accounts')
  const tokens = api.count('POST /api/v1/auth/token')
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Users', exact: true })
  ).toBeVisible()
  expect(api.count('GET /api/v1/auth/accounts')).toBeGreaterThan(accounts)
  expect(api.count('POST /api/v1/auth/token')).toBeGreaterThan(tokens)

  const stored = await page.evaluate(() =>
    JSON.stringify([
      { ...localStorage },
      { ...sessionStorage },
      document.cookie,
    ])
  )
  expect(stored).not.toContain(TOKEN)
  expect(stored).not.toContain(PASSWORD)
})
