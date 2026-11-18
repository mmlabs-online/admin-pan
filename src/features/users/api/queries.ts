import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { getApi, isApiError, toPageParams, unwrap, type ApiClient } from '@/api'
import { firstReason, isUnknownOutcome } from '@/features/apps/data/errors'
import { organizationsKeys } from '@/features/organizations/api/queries'
import { rolesKeys } from '@/features/roles/api/queries'
import { type AssignmentCreate } from '../data/assignments'
import { type UserStatus } from '../data/schema'

type ListParams = {
  limit: number
  offset: number
  email?: string
  status?: UserStatus
}

export const ASSIGNMENTS_PAGE_SIZE = 20
export const PICKER_PAGE_SIZE = 10
// Picker results hold emails: drop them from memory soon after the dialog closes.
export const PICKER_GC_TIME_MS = 5_000
export const SESSIONS_PAGE_SIZE = 20
// Sessions hold IP and user agent: drop them from memory soon after the tab closes.
export const SESSIONS_GC_TIME_MS = 5_000

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
  roleAssignmentsAll: (id: string) =>
    [...usersKeys.detail(id), 'role-assignments'] as const,
  roleAssignments: (id: string, p: { limit: number; offset: number }) =>
    [...usersKeys.roleAssignmentsAll(id), p] as const,
  // The typed email is in the key (as in the list); the short gcTime bounds it.
  picker: (email: string) =>
    [
      ...usersKeys.all,
      'picker',
      { email, limit: PICKER_PAGE_SIZE, offset: 0 },
    ] as const,
  sessionsAll: (id: string) => [...usersKeys.detail(id), 'sessions'] as const,
  sessions: (id: string, p: { limit: number; offset: number }) =>
    [...usersKeys.sessionsAll(id), p] as const,
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

/** GET /api/v1/users/{id}/role-assignments — admin:users:read. Newest first. */
export function userRoleAssignmentsQueryOptions(
  id: string,
  params: { limit: number; offset: number },
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: usersKeys.roleAssignments(id, params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/users/{user_id}/role-assignments', {
          params: { path: { user_id: id }, query: params },
          signal,
        })
      ),
    // Keep the previous page within one user only.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[2] === id ? prev : undefined,
  })
}

/**
 * GET /api/v1/users?email= (case-insensitive substring) for the user picker.
 * No placeholder data: a stale result must never look like the current one.
 */
export function userPickerQueryOptions(
  email: string,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: usersKeys.picker(email),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/users', {
          params: {
            query: { email, limit: PICKER_PAGE_SIZE, offset: 0 },
          },
          signal,
        })
      ),
    gcTime: PICKER_GC_TIME_MS,
  })
}

/** GET /api/v1/organizations?q= for the org picker (key under ['organizations']). */
export function orgPickerQueryOptions(q: string, api: ApiClient = getApi()) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: [...organizationsKeys.all, 'picker', { q }] as const,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/organizations', {
          params: {
            query: { q, limit: PICKER_PAGE_SIZE, offset: 0, sort: 'name' },
          },
          signal,
        })
      ),
    gcTime: PICKER_GC_TIME_MS,
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

/** GET /api/v1/users/{id}/sessions — admin:*. Active sessions, newest first. */
export function userSessionsQueryOptions(
  id: string,
  params: { limit: number; offset: number },
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: usersKeys.sessions(id, params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/users/{user_id}/sessions', {
          params: { path: { user_id: id }, query: params },
          signal,
        })
      ),
    placeholderData: keepPreviousData,
    gcTime: SESSIONS_GC_TIME_MS,
  })
}

// Never optimistic (R9). A 404 means the user (or session) is gone: refetch the
// whole detail. An unknown outcome may have committed: refetch the sessions.
function useSessionRevokeOptions(userId: string) {
  const queryClient = useQueryClient()
  const invalidate = (queryKey: readonly unknown[]) =>
    void queryClient.invalidateQueries({ queryKey })
  return {
    meta: { handlesOwnErrors: true },
    retry: false,
    onSuccess: () => invalidate(usersKeys.sessionsAll(userId)),
    onError: (error: unknown) => {
      if (isApiError(error, 404)) invalidate(usersKeys.detail(userId))
      else if (isUnknownOutcome(error))
        invalidate(usersKeys.sessionsAll(userId))
    },
  }
}

/** DELETE /api/v1/users/{id}/sessions/{session_id} (204) — admin:*. */
export function useRevokeUserSessionMutation(
  userId: string,
  api: ApiClient = getApi()
) {
  return useMutation({
    mutationFn: async (sessionId: string) =>
      unwrap(
        await api.DELETE('/api/v1/users/{user_id}/sessions/{session_id}', {
          params: { path: { user_id: userId, session_id: sessionId } },
        })
      ),
    ...useSessionRevokeOptions(userId),
  })
}

/** DELETE /api/v1/users/{id}/sessions (204) — admin:*. */
export function useRevokeAllUserSessionsMutation(
  userId: string,
  api: ApiClient = getApi()
) {
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await api.DELETE('/api/v1/users/{user_id}/sessions', {
          params: { path: { user_id: userId } },
        })
      ),
    ...useSessionRevokeOptions(userId),
  })
}

type AssignmentVars = { userId: string; app: string }

// Never optimistic (R9), never retried (a retry could grant or revoke twice).
// The list and the holders of the app are refetched on success and whenever
// the state may have changed elsewhere (404, 409, unknown outcome).
function useAssignmentMutationOptions() {
  const queryClient = useQueryClient()
  const invalidate = (queryKey: readonly unknown[]) =>
    void queryClient.invalidateQueries({ queryKey })
  const refetchAssignments = ({ userId, app }: AssignmentVars) => {
    invalidate(usersKeys.roleAssignmentsAll(userId))
    invalidate(rolesKeys.holdersOf(app))
  }
  return {
    meta: { handlesOwnErrors: true },
    retry: false as const,
    onSuccess: (_data: unknown, vars: AssignmentVars) =>
      refetchAssignments(vars),
    onError: (error: unknown, vars: AssignmentVars) => {
      if (
        isApiError(error, 404) ||
        isApiError(error, 409) ||
        isUnknownOutcome(error)
      )
        refetchAssignments(vars)
      if (isApiError(error, 422) && firstReason(error) === 'unknown_role')
        invalidate(rolesKeys.all(vars.app))
    },
  }
}

/** POST /api/v1/users/{id}/role-assignments (201) — admin:roles:assign. */
export function useAssignRoleMutation(api: ApiClient = getApi()) {
  const options = useAssignmentMutationOptions()
  return useMutation({
    mutationFn: async ({
      userId,
      body,
    }: AssignmentVars & { body: AssignmentCreate }) =>
      unwrap(
        await api.POST('/api/v1/users/{user_id}/role-assignments', {
          params: { path: { user_id: userId } },
          body,
        })
      ),
    ...options,
  })
}

/** DELETE /api/v1/users/{id}/role-assignments/{assignment_id} (204) — admin:roles:assign. */
export function useRevokeAssignmentMutation(api: ApiClient = getApi()) {
  const options = useAssignmentMutationOptions()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      userId,
      assignmentId,
    }: AssignmentVars & { assignmentId: string }) =>
      unwrap(
        await api.DELETE(
          '/api/v1/users/{user_id}/role-assignments/{assignment_id}',
          {
            params: {
              path: { user_id: userId, assignment_id: assignmentId },
            },
          }
        )
      ),
    ...options,
    // The user may be gone too.
    onError: (error: unknown, vars) => {
      options.onError(error, vars)
      if (isApiError(error, 404))
        void queryClient.invalidateQueries({
          queryKey: usersKeys.detail(vars.userId),
        })
    },
  })
}
