import { useCallback, useEffect, useRef, useState } from 'react'
import { authFailure } from '@/api'
import { useAccessToken, useAuth } from '@mmlabs/auth-client/react'
import { useSessionRecheck } from '@/stores/session-recheck-store'

export type AccessState =
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'not_member' }
  | { kind: 'email_unverified' }
  | { kind: 'rate_limited'; retryAfter?: number }
  | { kind: 'network' }
  | { kind: 'config'; requestId?: string }
  | { kind: 'rejected' }

const CHECKING: AccessState = { kind: 'checking' }
// A second 401 signal this soon after a re-check means the API rejects the session.
const RECHECK_WINDOW_MS = 60_000

/**
 * Checks that the chosen account can get an `aud=admin` token (membership, verified email).
 * The token is only awaited, never stored: it stays inside the auth library.
 */
export function useAccessCheck(accountId: string) {
  const { getToken } = useAccessToken()
  const { reload } = useAuth()
  const [result, setResult] = useState<{
    accountId: string
    state: AccessState
  }>()
  const seq = useRef(0)
  const lastSignalAt = useRef<number | null>(null)

  const evaluate = useCallback(
    async (forceRefresh: boolean): Promise<AccessState> => {
      const n = ++seq.current
      let state: AccessState
      try {
        await getToken({ accountId, forceRefresh })
        state = { kind: 'ok' }
      } catch (e) {
        const f = authFailure(e)
        switch (f.kind) {
          case 'not_member':
          case 'email_unverified':
          case 'network':
            state = { kind: f.kind }
            break
          case 'rate_limited':
            state = { kind: 'rate_limited', retryAfter: f.retryAfter }
            break
          case 'session_invalid':
          case 'account_changed':
          case 'no_account_selected':
            // The accounts list is stale: list again; the provider re-renders the gate.
            void reload()
            state = CHECKING
            break
          case 'config':
          case 'unknown':
            state = { kind: 'config', requestId: f.requestId }
            break
          default:
            state = { kind: 'config' }
        }
      }
      if (n === seq.current) setResult({ accountId, state })
      return state
    },
    [accountId, getToken, reload]
  )

  useEffect(() => {
    void evaluate(false)
  }, [evaluate])

  // The API client saw a final 401: list the accounts and fetch a fresh token.
  useEffect(
    () =>
      useSessionRecheck.subscribe((s, prev) => {
        if (s.generation === prev.generation) return
        const now = Date.now()
        if (
          lastSignalAt.current !== null &&
          now - lastSignalAt.current < RECHECK_WINDOW_MS
        ) {
          seq.current++
          setResult({ accountId, state: { kind: 'rejected' } })
          return
        }
        lastSignalAt.current = now
        seq.current++
        setResult({ accountId, state: CHECKING })
        void reload().then(() => evaluate(true))
      }),
    [accountId, evaluate, reload]
  )

  const state = result?.accountId === accountId ? result.state : CHECKING
  const recheck = useCallback(
    (forceRefresh: boolean) => evaluate(forceRefresh),
    [evaluate]
  )
  return { state, recheck }
}
