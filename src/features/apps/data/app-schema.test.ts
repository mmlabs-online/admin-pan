import { describe, expect, it } from 'vitest'
import openapi from '@/api/openapi.json?raw'
import {
  APP_KEY_MAX,
  APP_KEY_PATTERN,
  DESCRIPTION_MAX,
  NAME_MAX,
  ORIGINS_MAX,
  PERMISSION_SEGMENT_PATTERN,
  appFormSchema,
  appsSearchSchema,
  permissionFormSchema,
} from './app-schema'

const form = (over: Record<string, unknown>) =>
  appFormSchema.safeParse({
    key: 'stoktok',
    name: 'Stoktok',
    join_policy: 'approval',
    org_mode: 'none',
    origins: [],
    ...over,
  })
const origins = (...values: string[]) => values.map((value) => ({ value }))

describe('appFormSchema', () => {
  it('app key: accepts ab, a-1, 32 chars; rejects a, 1a, A, a_b, 33 chars', () => {
    for (const ok of ['ab', 'a-1', 'a'.repeat(32)])
      expect(form({ key: ok }).success, ok).toBe(true)
    for (const bad of ['', 'a', '1a', 'A', 'a_b', 'a'.repeat(33)])
      expect(form({ key: bad }).success, bad).toBe(false)
  })

  it('name trims; rejects whitespace-only; 255 ok, 256 rejected', () => {
    expect(form({ name: '  Stoktok ' }).data?.name).toBe('Stoktok')
    expect(form({ name: '   ' }).success).toBe(false)
    expect(form({ name: 'n'.repeat(255) }).success).toBe(true)
    expect(form({ name: 'n'.repeat(256) }).success).toBe(false)
  })

  it('origins: <= 20 entries; each non-empty, <= 255; duplicates (case-insensitive, trailing / ignored) rejected on the second entry; http://localhost:5173 accepted', () => {
    expect(form({ origins: origins('http://localhost:5173') }).success).toBe(
      true
    )
    expect(
      form({
        origins: origins(
          ...Array.from({ length: 20 }, (_, i) => `https://a${i}.mmlabs.online`)
        ),
      }).success
    ).toBe(true)
    expect(
      form({
        origins: origins(
          ...Array.from({ length: 21 }, (_, i) => `https://a${i}.mmlabs.online`)
        ),
      }).success
    ).toBe(false)
    expect(form({ origins: origins('  ') }).success).toBe(false)
    expect(form({ origins: origins('h'.repeat(256)) }).success).toBe(false)

    const dup = form({
      origins: origins('https://A.mmlabs.online', 'https://a.mmlabs.online/'),
    })
    expect(dup.success).toBe(false)
    expect(dup.error?.issues[0].path).toEqual(['origins', 1, 'value'])
  })
})

describe('permissionFormSchema', () => {
  const perm = (over: Record<string, unknown>) =>
    permissionFormSchema.safeParse({
      resource: 'orders',
      action: 'read',
      description: '',
      is_admin: false,
      ...over,
    })

  it('resource/action: 1..48 chars [a-z][a-z0-9-]*; description <= 500, optional', () => {
    for (const ok of ['a', 'a-1', 'a'.repeat(48)])
      expect(perm({ resource: ok, action: ok }).success, ok).toBe(true)
    for (const bad of ['', '1a', 'A', 'a_b', 'a:b', 'a'.repeat(49)]) {
      expect(perm({ resource: bad }).success, bad).toBe(false)
      expect(perm({ action: bad }).success, bad).toBe(false)
    }
    expect(perm({ description: 'd'.repeat(500) }).success).toBe(true)
    expect(perm({ description: 'd'.repeat(501) }).success).toBe(false)
  })
})

describe('drift against openapi.json', () => {
  const schemas = JSON.parse(openapi).components.schemas

  it('APP_KEY_PATTERN/APP_KEY_MAX/NAME_MAX equal AppCreate, ORIGINS_MAX equals its maxItems, and the built permission key pattern equals PermissionCreate.key.pattern', () => {
    const create = schemas.AppCreate.properties
    expect(create.key.pattern).toBe(APP_KEY_PATTERN.source)
    expect(create.key.maxLength).toBe(APP_KEY_MAX)
    expect(create.name.maxLength).toBe(NAME_MAX)
    expect(create.origins.maxItems).toBe(ORIGINS_MAX)

    const permission = schemas.PermissionCreate.properties
    const segment = PERMISSION_SEGMENT_PATTERN.source.slice(1, -1)
    const app = APP_KEY_PATTERN.source.slice(1, -1)
    expect(permission.key.pattern).toBe(`^${app}:(${segment}:${segment}|\\*)$`)
    const description = permission.description.anyOf.find(
      (a: { type: string }) => a.type === 'string'
    )
    expect(description.maxLength).toBe(DESCRIPTION_MAX)
  })
})

describe('appsSearchSchema', () => {
  it('keeps page/pageSize and drops filter/join_policy', () => {
    expect(
      appsSearchSchema.parse({
        page: 2,
        pageSize: 20,
        filter: 'stok',
        join_policy: ['open'],
      })
    ).toEqual({ page: 2, pageSize: 20 })
  })
})

describe('the apps feature', () => {
  it('imports no mock store', () => {
    const files = import.meta.glob('../**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const allowed = /(^|\/)(access-store|mock-data|schema)\.ts$/
    const mock =
      /from '(\.\/|\.\.\/data\/|\.\.\/)?(access-store|mock-data|schema)'/
    const offenders = Object.entries(files)
      .filter(([f]) => !allowed.test(f) && !/app-schema\.test\.ts$/.test(f))
      .filter(([, src]) => mock.test(src))
      .map(([f]) => f)
    expect(offenders).toEqual([])
  })
})
