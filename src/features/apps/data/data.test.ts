import { describe, expect, it, test } from 'vitest'
import openapi from '@/api/openapi.json?raw'
import { APP_CREDENTIAL_SCOPES } from './app-schema'
import {
  credentialScopeHints,
  credentialScopeOptions,
  formatDate,
  isRuntimeScope,
} from './data'

test('formatDate returns em dash for null and en-US date otherwise', () => {
  expect(formatDate(null)).toBe('—')
  expect(formatDate('2026-03-20T12:00:00Z')).toBe('Mar 20, 2026')
})

describe('credential scopes', () => {
  it('credentialScopeOptions: admin -> [releases]; calechip -> manifest, releases, org-members:read, usage:read, usage:write; never limits:write', () => {
    expect(credentialScopeOptions('admin')).toEqual(['releases'])
    expect(credentialScopeOptions('calechip')).toEqual([
      'manifest',
      'releases',
      'org-members:read',
      'usage:read',
      'usage:write',
    ])
    expect(credentialScopeOptions('calechip')).not.toContain('limits:write')
  })

  it("isRuntimeScope true only for org-members:read, usage:read, usage:write, limits:write; every runtime hint says 'Backend deploy environment only, never CI or browser code'; every scope has a hint", () => {
    for (const scope of APP_CREDENTIAL_SCOPES) {
      const runtime = [
        'org-members:read',
        'usage:read',
        'usage:write',
        'limits:write',
      ].includes(scope)
      expect(isRuntimeScope(scope), scope).toBe(runtime)
      expect(credentialScopeHints[scope], scope).toBeTruthy()
      if (runtime && scope !== 'limits:write')
        expect(credentialScopeHints[scope]).toContain(
          'Backend deploy environment only, never CI or browser code'
        )
    }
  })

  it('APP_CREDENTIAL_SCOPES equals the AppCredentialScope enum in openapi.json', () => {
    const spec = JSON.parse(openapi) as {
      components: { schemas: { AppCredentialScope: { enum: string[] } } }
    }
    expect([...APP_CREDENTIAL_SCOPES]).toEqual(
      spec.components.schemas.AppCredentialScope.enum
    )
  })
})
