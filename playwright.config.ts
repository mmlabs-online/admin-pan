import { defineConfig } from '@playwright/test'

const CI = !!process.env.CI
const PORT = 4173

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    // Set PLAYWRIGHT_CHROMIUM_PATH to use a preinstalled Chromium (e.g. cloud
    // sandboxes); CI installs its own with `pnpm test:browser:install`.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // Production bundle with the fake https API origin from .env.e2e (ADR 0006).
    command: `pnpm exec vite build --mode e2e --outDir dist-e2e && pnpm exec vite preview --mode e2e --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: !CI,
  },
})
