// Copy for the Sessions tab (USR-10, USR-14). Revoking stops new tokens; it ends
// this admin app's access on the next admin request; other apps' tokens run to
// expiry. Do not overclaim (pinned by sessions.test.ts).

export const SESSIONS_NOTE =
  'IP and browser are recorded when the browser first signed in and are shared by every account on that browser. Browser last seen updates at most hourly. Revoking stops new access tokens and ends access to this admin app on the next admin request. Tokens already issued to other apps stay valid until they expire, up to 12 hours. Revoking is not a password change; to lock the account, disable it.'

export const REVOKE_ONE_EFFECT =
  "That browser can't get new access tokens for this account, and its access to this admin app ends on its next admin request. Tokens it already holds for other apps stay valid until they expire, up to 12 hours. Other accounts on that browser are not affected. This is not a password change: they can sign in again with their password. To lock the account, disable it instead."

export const REVOKE_ALL_EFFECT =
  'No browser can get new access tokens for this account, and its access to this admin app ends on the next admin request. Tokens already issued to other apps stay valid until they expire, up to 12 hours. Other accounts on the same browsers stay signed in. This is not a password change: they can sign in again with their password. To lock the account, disable it instead.'

/**
 * The user agent is client-controlled text. React escapes it; this also strips
 * control and bidi characters so it cannot reorder or hide surrounding text (R6).
 */
export function sanitizeUserAgent(s: string): string {
  return (
    s
      // eslint-disable-next-line no-control-regex -- stripping controls is the point
      .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ')
      .replace(
        /[\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\uFFF9-\uFFFB\u{E0000}-\u{E007F}]/gu,
        ''
      )
      .trim()
  )
}
