// Copy and helpers for the Sessions tab (USR-10). The revoke copy must not
// overclaim: revoking stops NEW access tokens only (pinned by sessions.test.ts).

export const SESSIONS_NOTE =
  'IP and browser are recorded when the browser first signed in and are shared by every account on that browser. Browser last seen updates at most hourly. Revoking stops new access tokens only; tokens already issued stay valid for up to 12 hours.'

export const REVOKE_ONE_EFFECT =
  "That browser can't get new access tokens for this account. Tokens it already holds stay valid for up to 12 hours, so apps already open there (including this admin app) can keep working until then. This is not a password change: they can sign in again with their password. To lock the account, disable it instead."

export const REVOKE_ALL_EFFECT =
  'No browser can get new access tokens for this account. Tokens already issued stay valid for up to 12 hours, so open apps can keep working until then. Other accounts on the same browsers stay signed in. This is not a password change: they can sign in again with their password. To lock the account, disable it instead.'

/**
 * The user agent is client-controlled text. React escapes it; this also strips
 * control and bidi characters so it cannot reorder or hide surrounding text (R6).
 */
export function sanitizeUserAgent(s: string): string {
  return (
    s
      // eslint-disable-next-line no-control-regex -- stripping controls is the point
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
      .replace(/[؜‎‏‪-‮⁦-⁩]/g, '')
      .trim()
  )
}
