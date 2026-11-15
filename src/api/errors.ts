// Hand-written: the envelope is not in org-admin-api OpenAPI (errors.py, R6);
// see follow-up in work/tickets/PAN-009/plan.md. The single flagged exception
// to R2's "never hand-written copies".
import { z } from 'zod'

export type ValidationErrorDetail = {
  type: string
  loc: (string | number)[]
  msg: string
}
export type UnprocessableDetail = { field: string; reason: string }

export type ApiErrorKind =
  | 'http'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'invalid_response'
  | 'config'

type ApiErrorInit = {
  kind: ApiErrorKind
  status: number
  code: string
  message: string
  details?: unknown
  retryAfter?: number
}

/** The one error type of the API client. Holds no request, headers, URL or body. */
export class ApiError extends Error {
  override name = 'ApiError'
  readonly kind: ApiErrorKind
  readonly status: number
  readonly code: string
  readonly details: unknown
  readonly retryAfter?: number

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.kind = init.kind
    this.status = init.status
    this.code = init.code
    this.details = init.details ?? null
    this.retryAfter = init.retryAfter
  }
}

export function isApiError(e: unknown, status?: number): e is ApiError {
  return e instanceof ApiError && (status === undefined || e.status === status)
}

const envelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown(),
  }),
})

function retryAfterOf(res: Response, details: unknown): number | undefined {
  const header = res.headers.get('retry-after')
  if (header && /^\d+$/.test(header)) return Number(header)
  if (details && typeof details === 'object' && 'retry_after' in details) {
    const v = (details as { retry_after: unknown }).retry_after
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return undefined
}

export async function errorFromResponse(res: Response): Promise<ApiError> {
  if (res.headers.get('content-type')?.includes('application/json')) {
    const parsed = envelope.safeParse(await res.json().catch(() => null))
    if (parsed.success) {
      const { code, message, details } = parsed.data.error
      return new ApiError({
        kind: 'http',
        status: res.status,
        code,
        message,
        details,
        retryAfter: retryAfterOf(res, details),
      })
    }
  }
  return new ApiError({
    kind: 'http',
    status: res.status,
    code: 'http_error',
    message: `Request failed (${res.status})`,
    retryAfter: retryAfterOf(res, null),
  })
}

export function errorFromFetchFailure(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  const name = e instanceof Error ? e.name : ''
  if (name === 'TimeoutError') {
    return new ApiError({
      kind: 'timeout',
      status: 0,
      code: 'timeout',
      message: 'The request timed out',
    })
  }
  if (name === 'AbortError') {
    return new ApiError({
      kind: 'aborted',
      status: 0,
      code: 'aborted',
      message: 'The request was cancelled',
    })
  }
  return new ApiError({
    kind: 'network',
    status: 0,
    code: 'network_error',
    message: 'Network error',
  })
}
