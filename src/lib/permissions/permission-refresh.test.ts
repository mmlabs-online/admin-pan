import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api'
import { describe, expect, it, vi } from 'vitest'
import { createPermissionRefresher } from './permission-refresh'

const err = (status: number, code: string, kind: 'http' | 'auth' = 'http') =>
  new ApiError({ kind, status, code, message: 'm' })

function setup(now = () => 0) {
  const qc = new QueryClient()
  const spy = vi.spyOn(qc, 'invalidateQueries')
  return { qc, spy, refresh: createPermissionRefresher(() => qc, { now }) }
}

describe('createPermissionRefresher', () => {
  it('403 permission_denied and admin_wildcard_required invalidate [me, permissions]', () => {
    for (const code of ['permission_denied', 'admin_wildcard_required']) {
      const { spy, refresh } = setup()
      refresh(err(403, code))
      expect(spy).toHaveBeenCalledWith({
        queryKey: ['me', 'permissions'],
        refetchType: 'active',
      })
    }
  })

  it('self_status_change_forbidden, self_assignment_forbidden, kind auth not_member, 401, 404, 500 do nothing', () => {
    const { spy, refresh } = setup()
    refresh(err(403, 'self_status_change_forbidden'))
    refresh(err(403, 'self_assignment_forbidden'))
    refresh(err(403, 'not_member', 'auth'))
    refresh(err(401, 'permission_denied'))
    refresh(err(404, 'permission_denied'))
    refresh(err(500, 'permission_denied'))
    refresh(new Error('x'))
    expect(spy).not.toHaveBeenCalled()
  })

  it('self_session_change_forbidden does not refresh permissions', () => {
    const { spy, refresh } = setup()
    refresh(err(403, 'self_session_change_forbidden'))
    expect(spy).not.toHaveBeenCalled()
  })

  it('an error from the me/permissions query itself does nothing', () => {
    const { spy, refresh } = setup()
    refresh(err(403, 'permission_denied'), ['me', 'permissions', 'acc'])
    expect(spy).not.toHaveBeenCalled()
  })

  it('second matching error inside 5 s does nothing; after 5 s it invalidates again', () => {
    let t = 1_000
    const { spy, refresh } = setup(() => t)
    refresh(err(403, 'permission_denied'))
    t += 4_999
    refresh(err(403, 'permission_denied'))
    expect(spy).toHaveBeenCalledTimes(1)
    t += 1
    refresh(err(403, 'permission_denied'))
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('skips while the permission query is already fetching', () => {
    const { qc, spy, refresh } = setup()
    void qc.fetchQuery({
      queryKey: ['me', 'permissions', 'acc'],
      queryFn: () => new Promise(() => {}),
    })
    refresh(err(403, 'permission_denied'))
    expect(spy).not.toHaveBeenCalled()
  })
})
