import { describe, expect, expectTypeOf, it } from 'vitest'
import { toPageParams, type Page } from './page'
import type { components } from './schema'

describe('page', () => {
  it('toPageParams maps pageIndex/pageSize to limit/offset', () => {
    expect(toPageParams({ pageIndex: 2, pageSize: 20 })).toEqual({
      limit: 20,
      offset: 40,
    })
  })

  it('toPageParams clamps limit to 1..100 and offset to >= 0', () => {
    expect(toPageParams({ pageIndex: 1, pageSize: 500 })).toEqual({
      limit: 100,
      offset: 100,
    })
    expect(toPageParams({ pageIndex: -3, pageSize: 0 })).toEqual({
      limit: 1,
      offset: 0,
    })
  })

  it('Page<T> matches the generated Page_OrganizationRead_', () => {
    type Org = components['schemas']['OrganizationRead']
    expectTypeOf<Page<Org>>().toEqualTypeOf<
      components['schemas']['Page_OrganizationRead_']
    >()
  })
})
