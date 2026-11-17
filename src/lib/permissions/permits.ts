/**
 * Port of org-admin-api `app/modules/rbac/authz.py`: a granted set permits a
 * key when it holds that exact key or the app wildcard `<app>:*`. No prefix or
 * global wildcards, case-sensitive. A UI hint only; the API enforces (ADR 0004).
 */
export function permits(
  granted: ReadonlySet<string>,
  required: string
): boolean {
  const i = required.indexOf(':')
  if (i <= 0 || i === required.length - 1) return false
  return granted.has(required) || granted.has(`${required.slice(0, i)}:*`)
}
