import { APP_TOKEN_MAX_HOURS } from './assignments'

// Copy for the enable/disable confirmation (BUG-001 wording). Disabling
// revokes sessions and refuses sign-in, but tokens already issued to other apps
// run to expiry; admin access ends on the next admin request. Do not
// overclaim (pinned by status.test.ts).

export const DISABLE_EFFECT = `They can't sign in or get new access tokens for any mmlabs app until re-enabled, and their access to this admin app ends on their next admin request. Tokens already issued to other apps stay valid until they expire, up to ${APP_TOKEN_MAX_HOURS} hours. All their sessions are revoked, pending join requests are cancelled, and any password-reset or verification links stop working.`

export const ENABLE_EFFECT =
  'They will be able to sign in to mmlabs apps again. Revoked sessions and old password-reset or verification links stay ended.'
