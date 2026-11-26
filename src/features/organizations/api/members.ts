import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { getApi, unwrap, type ApiClient, type paths } from '@/api'
import { organizationsKeys } from './queries'

export const MEMBERS_PAGE_SIZE = 20
export const INVITATIONS_PAGE_SIZE = 20

type InvitationsQuery = NonNullable<
  paths['/api/v1/organizations/{org_id}/invitations']['get']['parameters']['query']
>

export type MembersParams = { limit: number; offset: number }
// `status` is left out for "all statuses".
export type InvitationsParams = MembersParams & {
  status?: NonNullable<InvitationsQuery['status']>
}

// Nested under the org detail key: org mutations and a 404 on the org refresh
// these too.
export const orgMembersKeys = {
  all: (orgId: string) =>
    [...organizationsKeys.detail(orgId), 'members'] as const,
  list: (orgId: string, p: MembersParams) =>
    [
      ...orgMembersKeys.all(orgId),
      { limit: p.limit, offset: p.offset },
    ] as const,
}

export const orgInvitationsKeys = {
  all: (orgId: string) =>
    [...organizationsKeys.detail(orgId), 'invitations'] as const,
  list: (orgId: string, p: InvitationsParams) =>
    [
      ...orgInvitationsKeys.all(orgId),
      { limit: p.limit, offset: p.offset, status: p.status },
    ] as const,
}

/** GET /api/v1/organizations/{org_id}/members — admin:users:read. */
export function orgMembersQueryOptions(
  orgId: string,
  params: MembersParams,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: orgMembersKeys.list(orgId, params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/organizations/{org_id}/members', {
          params: { path: { org_id: orgId }, query: params },
          signal,
        })
      ),
    placeholderData: keepPreviousData,
  })
}

/** GET /api/v1/organizations/{org_id}/invitations — admin:organizations:read. */
export function orgInvitationsQueryOptions(
  orgId: string,
  params: InvitationsParams,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: orgInvitationsKeys.list(orgId, params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/organizations/{org_id}/invitations', {
          params: { path: { org_id: orgId }, query: params },
          signal,
        })
      ),
    placeholderData: keepPreviousData,
  })
}
