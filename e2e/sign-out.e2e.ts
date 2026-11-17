import { EMAIL } from './support/fake-api'
import { expect, test } from './support/fixtures'

test.use({ viewport: { width: 1280, height: 800 } })

test('sign out confirms, calls logout once and returns to sign-in', async ({
  page,
  api,
  signIn,
}) => {
  await signIn('/')
  await page
    .getByRole('button', { name: new RegExp(EMAIL.replace('.', '\\.')) })
    .click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
  await expect(dialog).toContainText(EMAIL)
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-in/)
  expect(api.count('POST /api/v1/auth/logout')).toBe(1)

  await page.goto('/users')
  await page.waitForURL(/\/sign-in\?redirect=/)
})
