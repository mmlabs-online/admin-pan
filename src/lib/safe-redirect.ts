const MAX_LENGTH = 2048
// Pages of the auth flows: sending a user back to them would loop.
const AUTH_PAGES = [
  '/sign-in',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
]
const ORIGIN = 'http://redirect.invalid'

/**
 * The only way a `redirect` value is produced or consumed. Returns a same-origin
 * path (pathname + search, never the hash), or "/" for anything else.
 */
export function safeRedirect(raw: unknown): string {
  if (typeof raw !== 'string' || raw === '' || raw.length > MAX_LENGTH)
    return '/'
  // control characters (tab and newline are stripped by URL parsers) and backslashes
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  let url: URL
  try {
    url = new URL(raw, ORIGIN)
  } catch {
    return '/'
  }
  // "/..//evil.com" normalises to "//evil.com"
  if (url.origin !== ORIGIN || url.pathname.startsWith('//')) return '/'
  if (
    AUTH_PAGES.some(
      (p) => url.pathname === p || url.pathname.startsWith(`${p}/`)
    )
  )
    return '/'
  return url.pathname + url.search
}
