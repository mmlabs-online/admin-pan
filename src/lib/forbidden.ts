// Copy for permission 403s, chosen by `code` (org-admin-api app/core/errors.py).
// The server `message` is never shown. Gate 403s (kind 'auth': not_member,
// email_unverified) stay with AuthGate (ADR 0003).
import { isApiError } from '@/api'
import {
  ADMIN_PERMISSION_PATTERN,
  type AdminPermission,
} from '@/lib/permissions/registry'

export type ForbiddenCopy = {
  title: string
  description: string
  required?: string
}

export function isForbidden(e: unknown): boolean {
  return isApiError(e, 403) && e.kind === 'http'
}

const GENERIC_TITLE = "You don't have permission to do this"

export function forbiddenCopy(e: unknown): ForbiddenCopy {
  const code = isApiError(e) ? e.code : ''
  const details = isApiError(e) ? e.details : null
  const required =
    details && typeof details === 'object' && 'required' in details
      ? (details as { required: unknown }).required
      : undefined
  const safeRequired =
    typeof required === 'string' && ADMIN_PERMISSION_PATTERN.test(required)
      ? required
      : undefined

  switch (code) {
    case 'permission_denied':
      return {
        title: GENERIC_TITLE,
        description:
          "Your admin role doesn't include the permission this needs.",
        required: safeRequired,
      }
    case 'admin_wildcard_required':
      return {
        title: 'Only super admins can do this',
        description: 'This action needs the admin:* permission.',
      }
    case 'self_assignment_forbidden':
      return {
        title: "You can't change your own roles",
        description:
          'Ask another administrator to change your role assignments.',
      }
    case 'self_status_change_forbidden':
      return {
        title: "You can't change your own account status",
        description: 'Ask another administrator to do this.',
      }
    case 'self_session_change_forbidden':
      return {
        title: "You can't manage your own sessions",
        description:
          'Ask another administrator, or use Sign out to end your own session.',
      }
    default:
      return {
        title: GENERIC_TITLE,
        description: 'The server refused this request.',
        required: safeRequired,
      }
  }
}

export function routeForbiddenCopy(permission: AdminPermission): ForbiddenCopy {
  return {
    title: "You don't have access to this page",
    description: "Your admin role doesn't include the permission this needs.",
    required: permission,
  }
}
