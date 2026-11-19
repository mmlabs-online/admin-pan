import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getApi,
  isApiError,
  unwrap,
  type ApiClient,
  type components,
} from '@/api'
import { type MutationSuccessOptions } from '@/lib/mutation-success'
import { isUnknownOutcome } from '@/features/apps/data/errors'
import { organizationsKeys } from './queries'

type EntitlementCreate = components['schemas']['EntitlementCreate']
type EntitlementUpdate = components['schemas']['EntitlementUpdate']

// The count is bounded by the apps with org_mode=required; no pager (PAN-019).
export const ENTITLEMENTS_PAGE_SIZE = 100

export type EntitlementsParams = { limit: number; offset: number }

// Nested under the org detail key: org mutations and a 404/409 on the org
// refresh the entitlements too.
export const entitlementsKeys = {
  all: (orgId: string) =>
    [...organizationsKeys.detail(orgId), 'entitlements'] as const,
  list: (orgId: string, p: EntitlementsParams) =>
    [
      ...entitlementsKeys.all(orgId),
      { limit: p.limit, offset: p.offset },
    ] as const,
}

/** GET /api/v1/organizations/{org_id}/entitlements — admin:entitlements:read. */
export function orgEntitlementsQueryOptions(
  orgId: string,
  params: EntitlementsParams,
  api: ApiClient = getApi()
) {
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return queryOptions({
    queryKey: entitlementsKeys.list(orgId, params),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/api/v1/organizations/{org_id}/entitlements', {
          params: { path: { org_id: orgId }, query: params },
          signal,
        })
      ),
  })
}

// Never optimistic (R9): the dialogs show errors themselves.
function useEntitlementMutationOptions<TVars = unknown>(
  orgId: string,
  extra?: MutationSuccessOptions<unknown, TVars>
) {
  const queryClient = useQueryClient()
  const invalidate = (key: readonly unknown[]) =>
    void queryClient.invalidateQueries({ queryKey: key })
  return {
    meta: { handlesOwnErrors: true },
    onSuccess: (data: unknown, vars: TVars) => {
      invalidate(entitlementsKeys.all(orgId))
      extra?.onSuccess?.(data, vars)
    },
    onError: (error: unknown) => {
      if (isApiError(error, 404) || isApiError(error, 409))
        invalidate(organizationsKeys.detail(orgId))
      else if (isUnknownOutcome(error)) invalidate(entitlementsKeys.all(orgId))
    },
  }
}

/** POST /api/v1/organizations/{org_id}/entitlements (201) — admin:entitlements:write. */
export function useGrantEntitlementMutation(
  orgId: string,
  api: ApiClient = getApi()
) {
  return useMutation({
    // `enabled` is omitted on purpose (the API default is true); the
    // generated type marks it required because of that default.
    mutationFn: async (body: Omit<EntitlementCreate, 'enabled'>) =>
      unwrap(
        await api.POST('/api/v1/organizations/{org_id}/entitlements', {
          params: { path: { org_id: orgId } },
          body: body as EntitlementCreate,
        })
      ),
    // A retry could grant twice.
    retry: false,
    ...useEntitlementMutationOptions(orgId),
  })
}

/** PATCH /api/v1/organizations/{org_id}/entitlements/{entitlement_id} — admin:entitlements:write. */
export function useUpdateEntitlementMutation(
  orgId: string,
  api: ApiClient = getApi(),
  options?: MutationSuccessOptions<
    unknown,
    { entitlementId: string; body: EntitlementUpdate }
  >
) {
  return useMutation({
    mutationFn: async ({
      entitlementId,
      body,
    }: {
      entitlementId: string
      body: EntitlementUpdate
    }) =>
      unwrap(
        await api.PATCH(
          '/api/v1/organizations/{org_id}/entitlements/{entitlement_id}',
          {
            params: {
              path: { org_id: orgId, entitlement_id: entitlementId },
            },
            body,
          }
        )
      ),
    ...useEntitlementMutationOptions(orgId, options),
  })
}
