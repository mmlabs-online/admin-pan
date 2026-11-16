import globals from 'globals'
import js from '@eslint/js'
import pluginQuery from '@tanstack/eslint-plugin-query'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

const httpPaths = [
  { name: 'axios', message: 'HTTP only via src/api (R2)' },
  { name: 'openapi-fetch', message: 'HTTP only via src/api (R2)' },
]
const httpPatterns = [
  {
    group: ['ky', 'ofetch', 'axios/*', 'openapi-fetch/*'],
    message: 'HTTP only via src/api (R2)',
  },
]

export default defineConfig(
  { ignores: ['dist', 'src/components/ui', 'src/api/schema.d.ts'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      ...pluginQuery.configs['flat/recommended'],
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-console': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // Enforce type-only imports for TypeScript types
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      // Prevent duplicate imports from the same module
      'no-duplicate-imports': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...httpPaths,
            {
              name: '@mmlabs/auth-client',
              message: 'Only src/api uses the auth client core (R2/R3)',
            },
            {
              name: '@mmlabs/auth-client/react',
              importNames: ['useAccessToken'],
              message:
                'fetchWithToken bypasses src/api; only the auth gate may use useAccessToken (R2)',
            },
          ],
          patterns: httpPatterns,
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map(
          (name) => ({ name, message: 'HTTP only via src/api (R2)' })
        ),
      ],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis', 'self'].map((object) => ({
          object,
          property: 'fetch',
          message: 'HTTP only via src/api (R2)',
        })),
        {
          object: 'navigator',
          property: 'sendBeacon',
          message: 'HTTP only via src/api (R2)',
        },
      ],
    },
  },
  {
    // test-utils builds real auth clients
    files: ['src/test-utils/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: httpPaths, patterns: httpPatterns },
      ],
    },
  },
  {
    // The gate may use useAccessToken (token check), but not the core client.
    files: ['src/features/auth/gate/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...httpPaths,
            {
              name: '@mmlabs/auth-client',
              message: 'Only src/api uses the auth client core (R2/R3)',
            },
          ],
          patterns: httpPatterns,
        },
      ],
    },
  },
  {
    files: ['src/api/**', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
    },
  }
)
