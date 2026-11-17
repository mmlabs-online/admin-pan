import { describe, expect, it } from 'vitest'
import openapi from '@/api/openapi.json?raw'
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  SLUG_MAX,
  SLUG_PATTERN,
  organizationFormSchema,
  organizationsSearchSchema,
} from './schema'

const form = (over: Partial<Record<'slug' | 'name' | 'description', string>>) =>
  organizationFormSchema.safeParse({
    slug: 'acme',
    name: 'Acme',
    description: '',
    ...over,
  })

describe('organizationFormSchema', () => {
  it("slug: accepts a, a-b, 63 chars; rejects '', -a, a-, A, a_b, 64 chars", () => {
    for (const ok of ['a', 'a-b', 'a'.repeat(63), '9a9'])
      expect(form({ slug: ok }).success, ok).toBe(true)
    for (const bad of ['', '-a', 'a-', 'A', 'a_b', 'a'.repeat(64)])
      expect(form({ slug: bad }).success, bad).toBe(false)
  })

  it('name: trims, rejects whitespace-only, accepts 255 and rejects 256; description accepts 5000 and rejects 5001', () => {
    expect(form({ name: '  Acme  ' }).data?.name).toBe('Acme')
    expect(form({ name: '   ' }).success).toBe(false)
    expect(form({ name: 'n'.repeat(255) }).success).toBe(true)
    expect(form({ name: 'n'.repeat(256) }).success).toBe(false)
    expect(form({ description: 'd'.repeat(5000) }).success).toBe(true)
    expect(form({ description: 'd'.repeat(5001) }).success).toBe(false)
  })

  it('SLUG_PATTERN.source and the max lengths equal OrganizationCreate in openapi.json', () => {
    const create =
      JSON.parse(openapi).components.schemas.OrganizationCreate.properties
    expect(create.slug.pattern).toBe(SLUG_PATTERN.source)
    expect(create.slug.maxLength).toBe(SLUG_MAX)
    expect(create.name.maxLength).toBe(NAME_MAX)
    const description = create.description.anyOf.find(
      (a: { type: string }) => a.type === 'string'
    )
    expect(description.maxLength).toBe(DESCRIPTION_MAX)
  })
})

describe('organizationsSearchSchema', () => {
  it('keeps page/pageSize and drops filter/status', () => {
    expect(
      organizationsSearchSchema.parse({
        page: 2,
        pageSize: 20,
        filter: 'acme',
        status: ['active'],
      })
    ).toEqual({ page: 2, pageSize: 20 })
  })
})
