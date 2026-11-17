import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isApiError } from '@/api'
import { toast } from 'sonner'
import { handleServerError } from '@/lib/handle-server-error'
import { createPermissionRefresher } from '@/lib/permissions/permission-refresh'

function isTransient(error: unknown) {
  return (
    isApiError(error) &&
    (error.kind === 'network' ||
      error.kind === 'timeout' ||
      error.status >= 500)
  )
}

export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
  { dev }: { dev: boolean }
) {
  if (dev) return false
  if (isApiError(error) && !isTransient(error)) return false
  return failureCount < 3
}

/** Drops cached server data on every auth event, so one account never sees another's. */
export function clearOnAuthChange(
  queryClient: QueryClient,
  subscribe: (listener: () => void) => () => void
) {
  return subscribe(() => {
    void queryClient.cancelQueries()
    queryClient.clear()
  })
}

export function createQueryClient() {
  const refresh = createPermissionRefresher(() => client)
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          shouldRetryQuery(failureCount, error, { dev: import.meta.env.DEV }),
        refetchOnWindowFocus: import.meta.env.PROD,
        staleTime: 10 * 1000, // 10s
      },
      mutations: { retry: false },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        refresh(error, query?.queryKey)
        // 401 is handled once by the API client's hook; 403 is left to the caller (queryView + ForbiddenPanel, ADR 0004).
        if (isTransient(error)) toast.error('Server or network error')
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        refresh(error)
        if (mutation.meta?.handlesOwnErrors) return
        handleServerError(error)
      },
    }),
  })
  return client
}
