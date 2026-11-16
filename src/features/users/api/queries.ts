import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { getApi, isApiError, toPageParams, unwrap, type ApiClient } from '@/api'
import { type UserStatus } from '../data/schema'

type ListParams = {
  limit: number
  offset: number
  email?: string
  status?: UserStatus
}

const ASSIGNMENTS_PAGE = { limit: 100, offset: 0 }

export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'list'] as const,
  list: (p: ListParams) =>
    [
      ...usersKeys.lists(),
      {
        limit: p.limit,
        offset: p.offset,
        ...(p.email ? { email: p.email } : {}),
        ...(p.status ? { status: p.status } : {}),
      },
    ] as const,
  detail: (id: string) => [...usersKeys.all, 'detail', id] as const,
  roleAssignments: (id: string, p: { limit: number; offset: number }) =>
    [...usersKeys.detail(id), 'role-assignments', p] as const,
}

/**
 * Table state -> `GET /api/v1/users` params. An empty `email=` is a 422, so it
 * is omitted. `status` is sent only when exactly one value is selected: both
 * or none mean "no filter".
 */
export function toUsersListParams({
  pagination,
  status,
  email,
}: {
  pagination: { pageIndex: number; pageSize: number }
  status: readonly UserStatus[]
  email: string
}): ListParams {
  const trimmed = email.trim()
  return {
    ...toPageParams(pagination),
    ...(trimmed ? { email: trimmed } : {}),
    ...(status.length === 1 ? { status: status[0] } : {}),
  }
}

// The injected client is a dependency, not cache data (tests only).
export function usersListQueryOptions(
  params: ListParams,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: usersKeys.list(params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/users', { params: { query: params }, signal })
      ),
    placeholderData: keepPreviousData,
  })
}

export function userQueryOptions(id: string, api: ApiClient = getApi()) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: usersKeys.detail(id),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/users/{user_id}', {
          params: { path: { user_id: id } },
          signal,
        })
      ),
  })
}

export function userRoleAssignmentsQueryOptions(
  id: string,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: usersKeys.roleAssignments(id, ASSIGNMENTS_PAGE),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/users/{user_id}/role-assignments', {
          params: { path: { user_id: id }, query: ASSIGNMENTS_PAGE },
          signal,
        })
      ),
  })
}

/** PATCH status; never optimistic (R9). The dialog shows errors itself. */
export function useSetUserStatusMutation(api: ApiClient = getApi()) {
  const queryClient = useQueryClient()
  const refetchUsers = () =>
    queryClient.invalidateQueries({ queryKey: usersKeys.all })
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: UserStatus }) =>
      unwrap(
        await api.PATCH('/api/v1/users/{user_id}', {
          params: { path: { user_id: id } },
          body: { status },
        })
      ),
    meta: { handlesOwnErrors: true },
    onSuccess: refetchUsers,
    // The state changed elsewhere: refetch (no cache write).
    onError: (error) => {
      if (isApiError(error, 404) || isApiError(error, 409)) {
        void refetchUsers()
      }
    },
  })
}
