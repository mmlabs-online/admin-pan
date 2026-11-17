import { expect, test as base } from '@playwright/test'
import {
  API_ORIGIN,
  EMAIL,
  type FakeApi,
  PASSWORD,
  installFakeApi,
} from './fake-api'

const LOCAL_ORIGIN = 'http://localhost:4173'

type Fixtures = {
  api: FakeApi
  noStrayRequests: void
  signIn: (path?: string) => Promise<void>
}

export const test = base.extend<Fixtures>({
  api: async ({ context }, provide) => {
    await provide(await installFakeApi(context))
  },

  noStrayRequests: [
    async ({ context, page, api }, provide) => {
      const stray: string[] = []
      const errors: string[] = []
      await context.route(
        (url) => url.origin !== LOCAL_ORIGIN && url.origin !== API_ORIGIN,
        (route) => {
          stray.push(new URL(route.request().url()).origin)
          return route.abort()
        }
      )
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('console', (m) => {
        // Chromium logs every 4xx response; the tests trigger those on purpose.
        if (
          m.type() === 'error' &&
          !m.text().startsWith('Failed to load resource')
        )
          errors.push(`console.error: ${m.text()}`)
      })
      await provide()
      expect(
        api.unmatched,
        'unmatched or unauthenticated API requests'
      ).toEqual([])
      expect(stray, 'requests to non-local origins').toEqual([])
      expect(errors, 'page errors').toEqual([])
    },
    { auto: true },
  ],

  // The real form is the only way in (ADR 0003: no mock sign-in, no storage seeding).
  signIn: async ({ page }, provide) => {
    await provide(async (path = '/') => {
      await page.goto(`/sign-in?redirect=${encodeURIComponent(path)}`)
      await page.getByLabel('Email').fill(EMAIL)
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'))
    })
  },
})

export { expect }
