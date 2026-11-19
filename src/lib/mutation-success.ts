/**
 * Optional success callback a screen passes to a mutation hook. It runs from
 * the hook-level `onSuccess`, after the invalidations, so it still fires when
 * the dialog that started the mutation has unmounted. Used for toasts: the
 * copy lives in the screen, never in the API layer.
 */
export type MutationSuccessOptions<TData, TVars> = {
  onSuccess?: (data: TData, vars: TVars) => void
}
