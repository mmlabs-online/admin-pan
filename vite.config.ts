import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { playwright } from '@vitest/browser-playwright'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Never inline fonts as data: URLs; the CSP font-src is 'self' only.
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
  server: {
    // Dev only (not part of dist/, so not a BFF): admin Bearer paths have no CORS yet.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:8000',
      },
    },
  },
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
    silent: 'passed-only',
    unstubEnvs: true,
    css: { include: [/@fontsource-variable\//] },
    browser: {
      enabled: true,
      // Set PLAYWRIGHT_CHROMIUM_PATH to use a preinstalled Chromium (e.g. cloud
      // sandboxes); CI installs its own with `pnpm test:browser:install`.
      provider: playwright(
        process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? {
              launchOptions: {
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
              },
            }
          : {}
      ),
      instances: [{ browser: 'chromium' }],
    },
    coverage: {
      // include: ['src/**/*.{js,jsx,ts,tsx}'], // Uncomment to expand the report to all src/**/* so untested modules appear as 0% coverage.
      exclude: [
        'src/components/ui/**',
        'src/assets/**',
        'src/tanstack-table.d.ts',
        'src/routeTree.gen.ts',
        'src/test-utils/**',
        'src/routes/**',
      ],
    },
  },
})
