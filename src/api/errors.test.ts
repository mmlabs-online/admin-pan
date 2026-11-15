import { describe, expect, it } from 'vitest'
import {
  ApiError,
  errorFromFetchFailure,
  errorFromResponse,
  isApiError,
} from './errors'

const envelope = (
  status: number,
  code: string,
  details: unknown = null,
  headers: Record<string, string> = {}
) =>
  new Response(
    JSON.stringify({ error: { code, message: `msg ${code}`, details } }),
    {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    }
  )

describe('errorFromResponse', () => {
  it('parses the envelope for 401 unauthorized (details null)', async () => {
    const e = await errorFromResponse(envelope(401, 'unauthorized'))
    expect(e).toMatchObject({
      status: 401,
      code: 'unauthorized',
      kind: 'http',
      details: null,
    })
  })

  it('parses 403 permission_denied and keeps details.required', async () => {
    const e = await errorFromResponse(
      envelope(403, 'permission_denied', {
        required: 'admin:organizations:read',
      })
    )
    expect(e.status).toBe(403)
    expect(e.details).toEqual({ required: 'admin:organizations:read' })
  })

  it('parses 404 not_found and 409 conflict', async () => {
    expect((await errorFromResponse(envelope(404, 'not_found'))).code).toBe(
      'not_found'
    )
    expect((await errorFromResponse(envelope(409, 'conflict'))).code).toBe(
      'conflict'
    )
  })

  it('parses 422 validation_error details [{type, loc, msg}]', async () => {
    const details = [
      { type: 'missing', loc: ['body', 'name'], msg: 'Field required' },
    ]
    const e = await errorFromResponse(
      envelope(422, 'validation_error', details)
    )
    expect(e.details).toEqual(details)
  })

  it('parses 422 unprocessable details [{field, reason}]', async () => {
    const details = [{ field: 'slug', reason: 'taken' }]
    const e = await errorFromResponse(envelope(422, 'unprocessable', details))
    expect(e.details).toEqual(details)
  })

  it('reads retryAfter from the Retry-After header, falling back to details.retry_after', async () => {
    const h = await errorFromResponse(
      envelope(429, 'rate_limited', { retry_after: 9 }, { 'retry-after': '7' })
    )
    expect(h.retryAfter).toBe(7)
    const d = await errorFromResponse(
      envelope(429, 'rate_limited', { retry_after: 9 })
    )
    expect(d.retryAfter).toBe(9)
  })

  it('maps an HTML 502 to code http_error with a generic message and never includes the body', async () => {
    const e = await errorFromResponse(
      new Response('<html>secret-body</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      })
    )
    expect(e).toMatchObject({
      code: 'http_error',
      message: 'Request failed (502)',
    })
    expect(JSON.stringify(e)).not.toContain('secret-body')
  })

  it('maps an empty body and malformed JSON to code http_error', async () => {
    const json = { 'content-type': 'application/json' }
    expect(
      (
        await errorFromResponse(
          new Response('', { status: 500, headers: json })
        )
      ).code
    ).toBe('http_error')
    expect(
      (
        await errorFromResponse(
          new Response('{oops', { status: 500, headers: json })
        )
      ).code
    ).toBe('http_error')
  })

  it('maps JSON that is not an envelope to code http_error', async () => {
    const e = await errorFromResponse(
      new Response('{"detail":"x"}', {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    )
    expect(e.code).toBe('http_error')
  })
})

describe('errorFromFetchFailure', () => {
  it('maps a fetch TypeError to kind network, status 0, code network_error', () => {
    expect(
      errorFromFetchFailure(new TypeError('Failed to fetch'))
    ).toMatchObject({
      kind: 'network',
      status: 0,
      code: 'network_error',
    })
  })

  it('maps a TimeoutError to kind timeout and an AbortError to kind aborted', () => {
    expect(
      errorFromFetchFailure(new DOMException('t', 'TimeoutError')).kind
    ).toBe('timeout')
    expect(
      errorFromFetchFailure(new DOMException('a', 'AbortError')).kind
    ).toBe('aborted')
  })
})

describe('ApiError', () => {
  it('String(err) and JSON.stringify(err) never contain the bearer token', async () => {
    const token = 'tok-secret-123'
    const res = envelope(401, 'unauthorized')
    const e = await errorFromResponse(res)
    expect(String(e) + JSON.stringify(e)).not.toContain(token)
    expect(Object.keys(e)).not.toContain('request')
  })

  it('isApiError narrows and optionally matches a status', () => {
    const e = new ApiError({
      kind: 'http',
      status: 403,
      code: 'x',
      message: 'm',
    })
    expect(isApiError(e)).toBe(true)
    expect(isApiError(e, 403)).toBe(true)
    expect(isApiError(e, 404)).toBe(false)
    expect(isApiError(new Error('x'))).toBe(false)
  })
})
