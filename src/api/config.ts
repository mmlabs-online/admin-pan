import { ApiError } from './errors'

type Env = { prod: boolean; dev: boolean }

/**
 * Validates VITE_API_BASE_URL: an origin only (no path, query, hash or
 * credentials). Generated OpenAPI paths already carry the /api/v1 prefix.
 * https always; http only for localhost/127.0.0.1 in dev.
 */
export function parseApiBaseUrl(raw: string | undefined, { dev }: Env): string {
  const invalid = (why: string) =>
    new ApiError({
      kind: 'config',
      status: 0,
      code: 'config_error',
      message: `Invalid VITE_API_BASE_URL: ${why}`,
    })
  if (!raw) throw invalid('missing')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw invalid('not a URL')
  }
  if (
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw invalid('must be an origin only (scheme, host, optional port)')
  }
  const localHttp =
    url.protocol === 'http:' &&
    dev &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  if (url.protocol !== 'https:' && !localHttp) {
    throw invalid('https is required')
  }
  return url.origin
}

export function apiBaseUrl(): string {
  return parseApiBaseUrl(import.meta.env.VITE_API_BASE_URL, {
    prod: import.meta.env.PROD,
    dev: import.meta.env.DEV,
  })
}

/** VITE_APP_KEY: sent as X-MM-App; same shape as an app key in the API. */
export function parseAppKey(raw: string | undefined): string {
  if (!raw || !/^[a-z][a-z0-9-]*$/.test(raw)) {
    throw new ApiError({
      kind: 'config',
      status: 0,
      code: 'config_error',
      message: 'Invalid VITE_APP_KEY',
    })
  }
  return raw
}

export function appKey(): string {
  return parseAppKey(import.meta.env.VITE_APP_KEY)
}
