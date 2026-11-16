import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fakeApi, apiError, json } from '@/test-utils/api'
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import {
  toUsersListParams,
  userQueryOptions,
  userRoleAssignmentsQueryOptions,
  usersKeys,
  useSetUserStatusMutation,
  usersListQueryOptions,
} from './queries'

const ID = '0b9c6a2e-3f5d-4c1a-9a7e-1d2f3a4b5c01'
const page = { items: [], total: 0, limit: 10, offset: 20 }

describe('usersKeys', () => {
  it('list normalises params (undefined/empty keys dropped; equal filters -> equal key)', () => {
    expect(
      usersKeys.list({ limit: 10, offset: 0, email: '', status: undefined })
    ).toEqual(usersKeys.list({ limit: 10, offset: 0 }))
    expect(usersKeys.list({ limit: 10, offset: 0, status: 'active' })).toEqual([
      'users',
      'list',
      { limit: 10, offset: 0, status: 'active' },
    ])
  })
})

describe('toUsersListParams', () => {
  const base = { status: [] as ('active' | 'disabled')[], email: '' }
  it('page 3 / size 10 -> limit=10, offset=20; size capped at 100', () => {
    expect(
      toUsersListParams({ ...base, pagination: { pageIndex: 2, pageSize: 10 } })
    ).toEqual({ limit: 10, offset: 20 })
    expect(
      toUsersListParams({
        ...base,
        pagination: { pageIndex: 0, pageSize: 500 },
      })
    ).toEqual({ limit: 100, offset: 0 })
  })
  it('trims the email and omits an empty/whitespace one', () => {
    const pagination = { pageIndex: 0, pageSize: 10 }
    expect(
      toUsersListParams({ ...base, pagination, email: '  bob@x.io ' }).email
    ).toBe('bob@x.io')
    expect(toUsersListParams({ ...base, pagination, email: '   ' })).toEqual({
      limit: 10,
      offset: 0,
    })
  })
  it('sends status only when exactly one value is selected', () => {
    const pagination = { pageIndex: 0, pageSize: 10 }
    expect(
      toUsersListParams({ ...base, pagination, status: ['disabled'] }).status
    ).toBe('disabled')
    expect(
      toUsersListParams({ ...base, pagination, status: ['active', 'disabled'] })
    ).not.toHaveProperty('status')
    expect(toUsersListParams({ ...base, pagination })).not.toHaveProperty(
      'status'
    )
  })
})

describe('users queries', () => {
  it('usersListQueryOptions sends limit/offset/email/status and returns the Page', async () => {
    const { client, seen } = fakeApi(() => json(page))
    const data = await new QueryClient().fetchQuery(
      usersListQueryOptions(
        { limit: 10, offset: 20, email: 'a@b.c', status: 'disabled' },
        client
      )
    )
    expect(data).toEqual(page)
    const url = new URL(seen[0].url)
    expect(seen[0].method).toBe('GET')
    expect(url.pathname).toBe('/api/v1/users')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '10',
      offset: '20',
      email: 'a@b.c',
      status: 'disabled',
    })
  })

  it('userQueryOptions sends GET /api/v1/users/{id}; a 404 rejects with ApiError 404', async () => {
    const ok = fakeApi(() => json({ id: ID }))
    await new QueryClient().fetchQuery(userQueryOptions(ID, ok.client))
    expect(ok.seen[0].url).toBe(`https://api.test/api/v1/users/${ID}`)

    const missing = fakeApi(() => apiError(404, 'not_found'))
    await expect(
      new QueryClient().fetchQuery(userQueryOptions(ID, missing.client))
    ).rejects.toMatchObject({ name: 'ApiError', status: 404 })
  })

  it('userRoleAssignmentsQueryOptions sends GET .../role-assignments?limit=100&offset=0', async () => {
    const { client, seen } = fakeApi(() => json(page))
    await new QueryClient().fetchQuery(
      userRoleAssignmentsQueryOptions(ID, client)
    )
    expect(seen[0].url).toBe(
      `https://api.test/api/v1/users/${ID}/role-assignments?limit=100&offset=0`
    )
  })

  it('list 403 surfaces ApiError 403', async () => {
    const { client } = fakeApi(() => apiError(403, 'permission_denied'))
    await expect(
      new QueryClient().fetchQuery(
        usersListQueryOptions({ limit: 10, offset: 0 }, client)
      )
    ).rejects.toMatchObject({ name: 'ApiError', status: 403 })
  })
})

describe('useSetUserStatusMutation', () => {
  it('sends PATCH {"status":"disabled"} and invalidates [users] on success', async () => {
    const { client, seen } = fakeApi(() => json({ id: ID, status: 'disabled' }))
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = await renderHook(
      () => useSetUserStatusMutation(client),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      }
    )
    await result.current.mutateAsync({ id: ID, status: 'disabled' })
    expect(seen[0].method).toBe('PATCH')
    expect(seen[0].url).toBe(`https://api.test/api/v1/users/${ID}`)
    expect(await seen[0].json()).toEqual({ status: 'disabled' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
  })
})
