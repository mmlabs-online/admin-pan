import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fakeApi, apiError, json } from '@/test-utils/api'
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { rolesKeys } from '@/features/roles/api/queries'
import {
  PICKER_GC_TIME_MS,
  SESSIONS_GC_TIME_MS,
  orgPickerQueryOptions,
  toUsersListParams,
  useAssignRoleMutation,
  useRevokeAssignmentMutation,
  userPickerQueryOptions,
  userQueryOptions,
  userRoleAssignmentsQueryOptions,
  userSessionsQueryOptions,
  useRevokeAllUserSessionsMutation,
  useRevokeUserSessionMutation,
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

  it("userRoleAssignmentsQueryOptions sends GET …/role-assignments?limit=20&offset=40; key ['users','detail',id,'role-assignments',{limit,offset}]", async () => {
    const { client, seen } = fakeApi(() => json(page))
    const options = userRoleAssignmentsQueryOptions(
      ID,
      { limit: 20, offset: 40 },
      client
    )
    await new QueryClient().fetchQuery(options)
    expect(seen[0].url).toBe(
      `https://api.test/api/v1/users/${ID}/role-assignments?limit=20&offset=40`
    )
    expect(options.queryKey).toEqual([
      'users',
      'detail',
      ID,
      'role-assignments',
      { limit: 20, offset: 40 },
    ])
    const placeholder = options.placeholderData as (
      prev: unknown,
      q: { queryKey: readonly unknown[] } | undefined
    ) => unknown
    expect(placeholder('p', { queryKey: options.queryKey })).toBe('p')
    expect(
      placeholder('p', {
        queryKey: usersKeys.roleAssignments('other', { limit: 20, offset: 0 }),
      })
    ).toBeUndefined()
  })

  it('userPickerQueryOptions: GET /users?email=ann&limit=10&offset=0; no placeholderData; gcTime 5000', async () => {
    const { client, seen } = fakeApi(() => json(page))
    const options = userPickerQueryOptions('ann', client)
    await new QueryClient().fetchQuery(options)
    expect(seen[0].url).toBe(
      'https://api.test/api/v1/users?email=ann&limit=10&offset=0'
    )
    expect(options.placeholderData).toBeUndefined()
    expect(options.gcTime).toBe(PICKER_GC_TIME_MS)
    expect(PICKER_GC_TIME_MS).toBe(5000)
  })

  it("orgPickerQueryOptions: GET /organizations?q=ac&limit=10&offset=0; key under ['organizations']", async () => {
    const { client, seen } = fakeApi(() => json(page))
    const options = orgPickerQueryOptions('ac', client)
    await new QueryClient().fetchQuery(options)
    const url = new URL(seen[0].url)
    expect(url.pathname).toBe('/api/v1/organizations')
    expect(url.searchParams.get('q')).toBe('ac')
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('offset')).toBe('0')
    expect(options.queryKey[0]).toBe('organizations')
    expect(options.placeholderData).toBeUndefined()
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

const SID = '9f9f9f9f-9999-4999-8999-999999999999'

function mutationHarness<T>(hook: () => T) {
  const queryClient = new QueryClient()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  return {
    invalidate,
    render: () =>
      renderHook(hook, {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      }),
  }
}

describe('user sessions queries', () => {
  it('usersKeys.sessions nests under detail(id) and holds only {limit, offset}', () => {
    expect(usersKeys.sessions(ID, { limit: 20, offset: 40 })).toEqual([
      'users',
      'detail',
      ID,
      'sessions',
      { limit: 20, offset: 40 },
    ])
    expect(usersKeys.sessionsAll(ID).slice(0, 3)).toEqual(usersKeys.detail(ID))
  })

  it('userSessionsQueryOptions sends GET /api/v1/users/{id}/sessions?limit=20&offset=0; gcTime ≤ 5000; placeholderData keepPreviousData', async () => {
    const { client, seen } = fakeApi(() => json(page))
    const options = userSessionsQueryOptions(
      ID,
      { limit: 20, offset: 0 },
      client
    )
    await new QueryClient().fetchQuery(options)
    expect(seen[0].method).toBe('GET')
    expect(seen[0].url).toBe(
      `https://api.test/api/v1/users/${ID}/sessions?limit=20&offset=0`
    )
    expect(options.gcTime).toBe(SESSIONS_GC_TIME_MS)
    expect(options.gcTime).toBeLessThanOrEqual(5000)
    expect(typeof options.placeholderData).toBe('function')
  })
})

describe('session revoke mutations', () => {
  it('revoke one sends DELETE …/sessions/{sid}, invalidates sessionsAll on success; on 404 invalidates detail(id); on 500 invalidates sessionsAll', async () => {
    let res = () => new Response(null, { status: 204 })
    const { client, seen } = fakeApi(() => res())
    const h = mutationHarness(() => useRevokeUserSessionMutation(ID, client))
    const { result } = await h.render()
    await result.current.mutateAsync(SID)
    expect(seen[0].method).toBe('DELETE')
    expect(seen[0].url).toBe(
      `https://api.test/api/v1/users/${ID}/sessions/${SID}`
    )
    expect(h.invalidate).toHaveBeenLastCalledWith({
      queryKey: usersKeys.sessionsAll(ID),
    })

    res = () => apiError(404, 'not_found')
    await expect(result.current.mutateAsync(SID)).rejects.toMatchObject({
      status: 404,
    })
    expect(h.invalidate).toHaveBeenLastCalledWith({
      queryKey: usersKeys.detail(ID),
    })

    res = () => apiError(500, 'internal_error')
    await expect(result.current.mutateAsync(SID)).rejects.toMatchObject({
      status: 500,
    })
    expect(h.invalidate).toHaveBeenLastCalledWith({
      queryKey: usersKeys.sessionsAll(ID),
    })
  })

  it('revoke all sends DELETE …/sessions with no body and invalidates sessionsAll', async () => {
    const { client, seen } = fakeApi(() => new Response(null, { status: 204 }))
    const h = mutationHarness(() =>
      useRevokeAllUserSessionsMutation(ID, client)
    )
    const { result } = await h.render()
    await result.current.mutateAsync()
    expect(seen[0].method).toBe('DELETE')
    expect(seen[0].url).toBe(`https://api.test/api/v1/users/${ID}/sessions`)
    expect(await seen[0].text()).toBe('')
    expect(h.invalidate).toHaveBeenCalledWith({
      queryKey: usersKeys.sessionsAll(ID),
    })
  })
})

describe('assignment mutations', () => {
  const APP = 'stoktok'
  const ROLE = 'd1000001-0000-4000-8000-000000000001'
  const AID = 'e0000001-0000-4000-8000-000000000001'
  const assignmentsKey = usersKeys.roleAssignmentsAll(ID)
  const holdersKey = rolesKeys.holdersOf(APP)
  const calls = (h: { invalidate: { mock: { calls: unknown[][] } } }) =>
    h.invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey)
  const has = (keys: unknown[], key: readonly unknown[]) =>
    keys.some((k) => JSON.stringify(k) === JSON.stringify(key))

  it('assign POSTs exactly {role_id} or {role_id, org_id, expires_at} to the given user id; retry false (a 500 is sent once)', async () => {
    let res = () => json({ id: AID }, 201)
    const { client, seen } = fakeApi(() => res())
    const h = mutationHarness(() => useAssignRoleMutation(client))
    const { result } = await h.render()
    await result.current.mutateAsync({
      userId: ID,
      app: APP,
      body: { role_id: ROLE },
    })
    expect(seen[0].method).toBe('POST')
    expect(seen[0].url).toBe(
      `https://api.test/api/v1/users/${ID}/role-assignments`
    )
    expect(await seen[0].json()).toEqual({ role_id: ROLE })
    const body = {
      role_id: ROLE,
      org_id: 'c0000001-0000-4000-8000-000000000001',
      expires_at: '2099-01-02T03:04:00.000Z',
    }
    await result.current.mutateAsync({ userId: ID, app: APP, body })
    expect(await seen[1].json()).toEqual(body)

    res = () => apiError(500, 'internal_error')
    await expect(
      result.current.mutateAsync({ userId: ID, app: APP, body })
    ).rejects.toMatchObject({ status: 500 })
    expect(seen).toHaveLength(3)
  })

  it('assign success invalidates the user assignments and the app holders, not the user detail or me/permissions', async () => {
    const { client } = fakeApi(() => json({ id: AID }, 201))
    const h = mutationHarness(() => useAssignRoleMutation(client))
    const { result } = await h.render()
    await result.current.mutateAsync({
      userId: ID,
      app: 'admin',
      body: { role_id: ROLE },
    })
    const keys = calls(h)
    expect(has(keys, assignmentsKey)).toBe(true)
    expect(has(keys, rolesKeys.holdersOf('admin'))).toBe(true)
    expect(has(keys, usersKeys.detail(ID))).toBe(false)
    expect(has(keys, ['me', 'permissions'])).toBe(false)
  })

  it('assign 409 / 404 / unknown outcome invalidate the same keys; 422 unknown_role also invalidates the app roles', async () => {
    let res = () => apiError(409, 'conflict')
    const { client } = fakeApi(() => res())
    const h = mutationHarness(() => useAssignRoleMutation(client))
    const { result } = await h.render()
    const vars = { userId: ID, app: APP, body: { role_id: ROLE } }
    for (const make of [
      () => apiError(409, 'conflict'),
      () => apiError(404, 'not_found'),
      () => apiError(503, 'unavailable'),
    ]) {
      h.invalidate.mockClear()
      res = make
      await expect(result.current.mutateAsync(vars)).rejects.toBeDefined()
      expect(has(calls(h), assignmentsKey)).toBe(true)
      expect(has(calls(h), holdersKey)).toBe(true)
    }
    h.invalidate.mockClear()
    res = () =>
      apiError(422, 'unprocessable', [
        { field: 'role_id', reason: 'unknown_role' },
      ])
    await expect(result.current.mutateAsync(vars)).rejects.toBeDefined()
    expect(has(calls(h), rolesKeys.all(APP))).toBe(true)
  })

  it('revoke DELETEs …/role-assignments/{aid} with retry false; success, 404, 409 and unknown outcome invalidate assignments + holders; 404 also the user detail', async () => {
    let res = () => new Response(null, { status: 204 })
    const { client, seen } = fakeApi(() => res())
    const h = mutationHarness(() => useRevokeAssignmentMutation(client))
    const { result } = await h.render()
    const vars = { userId: ID, app: APP, assignmentId: AID }
    await result.current.mutateAsync(vars)
    expect(seen[0].method).toBe('DELETE')
    expect(seen[0].url).toBe(
      `https://api.test/api/v1/users/${ID}/role-assignments/${AID}`
    )
    expect(has(calls(h), assignmentsKey)).toBe(true)
    expect(has(calls(h), holdersKey)).toBe(true)

    for (const [make, detail] of [
      [() => apiError(404, 'not_found'), true],
      [() => apiError(409, 'last_super_admin'), false],
      [() => apiError(500, 'internal_error'), false],
    ] as const) {
      h.invalidate.mockClear()
      res = make as typeof res
      const before = seen.length
      await expect(result.current.mutateAsync(vars)).rejects.toBeDefined()
      expect(seen.length).toBe(before + 1)
      expect(has(calls(h), assignmentsKey)).toBe(true)
      expect(has(calls(h), holdersKey)).toBe(true)
      expect(has(calls(h), usersKeys.detail(ID))).toBe(detail)
    }
  })

  it('useRevokeAssignmentMutation options.onSuccess runs after the invalidations, not on error', async () => {
    let res = () => new Response(null, { status: 204 })
    const { client } = fakeApi(() => res())
    const h = mutationHarness(() =>
      useRevokeAssignmentMutation(client, onSuccessOpts)
    )
    const order: string[] = []
    const onSuccessOpts = {
      onSuccess: vi.fn(() => order.push('callback')),
    }
    h.invalidate.mockImplementation((() => {
      order.push('invalidate')
      return Promise.resolve()
    }) as never)
    const { result } = await h.render()
    const vars = { userId: ID, app: APP, assignmentId: AID }
    await result.current.mutateAsync(vars)
    expect(onSuccessOpts.onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccessOpts.onSuccess).toHaveBeenCalledWith(undefined, vars)
    expect(has(calls(h), assignmentsKey)).toBe(true)
    expect(order[order.length - 1]).toBe('callback')
    expect(order.slice(0, -1).every((e) => e === 'invalidate')).toBe(true)

    res = (() => apiError(409, 'last_super_admin')) as typeof res
    await expect(result.current.mutateAsync(vars)).rejects.toBeDefined()
    expect(onSuccessOpts.onSuccess).toHaveBeenCalledTimes(1)
  })

  it('revoke writes nothing to the cache before success (no optimistic update)', async () => {
    let release: (r: Response) => void = () => {}
    const { client } = fakeApi(
      () => new Promise<Response>((resolve) => (release = resolve))
    )
    const queryClient = new QueryClient()
    queryClient.setQueryData(
      usersKeys.roleAssignments(ID, { limit: 20, offset: 0 }),
      {
        items: [{ id: AID }],
        total: 1,
      }
    )
    const { result } = await renderHook(
      () => useRevokeAssignmentMutation(client),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      }
    )
    const p = result.current.mutateAsync({
      userId: ID,
      app: APP,
      assignmentId: AID,
    })
    await vi.waitFor(() => expect(result.current.isPending).toBe(true))
    expect(
      queryClient.getQueryData(
        usersKeys.roleAssignments(ID, { limit: 20, offset: 0 })
      )
    ).toEqual({ items: [{ id: AID }], total: 1 })
    release(new Response(null, { status: 204 }))
    await p
  })
})
