import { describe, expect, it } from 'vitest'
import raw from '@/api/openapi.json?raw'
import {
  PERMISSION_KEYS_MAX,
  ROLE_KEY_PATTERN,
  ROLE_NAME_MAX,
  roleCreateSchema,
  roleRenameSchema,
  rolesSearchSchema,
} from './role-schema'

type Schemas = Record<
  string,
  { properties: Record<string, Record<string, unknown>> }
>
const schemas = (JSON.parse(raw) as { components: { schemas: Schemas } })
  .components.schemas

describe('role limits', () => {
  it('match openapi.json', () => {
    const create = schemas.RoleCreate.properties
    expect(ROLE_KEY_PATTERN.source).toBe(create.key.pattern)
    expect(ROLE_NAME_MAX).toBe(create.name.maxLength)
    const replace = schemas.RolePermissionsReplace.properties.permission_keys
    expect(PERMISSION_KEYS_MAX).toBe(replace.maxItems)
  })
})

describe('roleCreateSchema', () => {
  const ok = (segment: string) =>
    roleCreateSchema.safeParse({ segment, name: 'Viewer' }).success

  it('accepts a, a-1, 48 chars; rejects empty, 1a, A, a_b, a:b, 49 chars', () => {
    for (const s of ['a', 'a-1', 'a'.repeat(48)]) {
      expect(ok(s), s).toBe(true)
      expect(ROLE_KEY_PATTERN.test(`stoktok:${s}`), s).toBe(true)
    }
    for (const s of ['', '1a', 'A', 'a_b', 'a:b', 'a'.repeat(49)])
      expect(ok(s), s).toBe(false)
  })

  it('trims the name, rejects blank, accepts 255 and rejects 256', () => {
    const parse = (n: string) =>
      roleRenameSchema.safeParse({ name: n }) as {
        success: boolean
        data?: { name: string }
      }
    expect(parse('  Viewer ').data?.name).toBe('Viewer')
    expect(parse('   ').success).toBe(false)
    expect(parse('x'.repeat(255)).success).toBe(true)
    expect(parse('x'.repeat(256)).success).toBe(false)
  })
})

describe('rolesSearchSchema', () => {
  it('keeps app, page and pageSize and drops filter and app[] (old URLs)', () => {
    expect(
      rolesSearchSchema.parse({ app: 'stoktok', page: 2, pageSize: 20 })
    ).toEqual({ app: 'stoktok', page: 2, pageSize: 20 })
    const old = rolesSearchSchema.parse({ filter: 'x', app: ['a'], page: 3 })
    expect(old).not.toHaveProperty('filter')
    expect(old.app).toBeUndefined()
    expect(old.page).toBe(3)
  })
})

describe('the Roles screen', () => {
  it('has no mock store under features/apps or features/roles', () => {
    const files = import.meta.glob('../../{apps,roles}/**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const named = /(^|\/)(access-store|mock-data|data-table-view)\.tsx?$/
    const mock =
      /from '[^']*(access-store|mock-data|data-table-view|data\/schema|\.\/schema)'/
    expect(Object.keys(files).filter((f) => named.test(f))).toEqual([])
    const offenders = Object.entries(files)
      .filter(([f]) => !/role-schema\.test\.ts$/.test(f))
      .filter(([, src]) => mock.test(src))
      .map(([f]) => f)
    expect(offenders).toEqual([])
  })
})
