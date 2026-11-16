import { WithPermissions } from '@/test-utils/permissions'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { unknownPermissionSource } from '@/lib/permissions/source'
import { PermissionProvider } from '@/context/permission-provider'
import { RoutePermissionGate } from './route-permission-guard'

const gate = (routeId: string) => (
  <RoutePermissionGate
    routeId={routeId}
    fallback={(copy) => <p>Denied: {copy.required}</p>}
  >
    <p>The page</p>
  </RoutePermissionGate>
)

describe('RoutePermissionGate', () => {
  it('a denied route renders the fallback with the required permission, not the page', async () => {
    const screen = await render(
      <WithPermissions granted={[]}>
        {gate('/_authenticated/users/')}
      </WithPermissions>
    )
    await expect
      .element(screen.getByText('Denied: admin:users:read'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('The page')).not.toBeInTheDocument()
  })

  it('an unknown or granted route renders the page', async () => {
    const unknown = await render(
      <PermissionProvider source={unknownPermissionSource}>
        {gate('/_authenticated/users/')}
      </PermissionProvider>
    )
    await expect.element(unknown.getByText('The page')).toBeInTheDocument()
    await unknown.unmount()

    const granted = await render(
      <WithPermissions granted={['admin:users:read']}>
        {gate('/_authenticated/users/')}
      </WithPermissions>
    )
    await expect.element(granted.getByText('The page')).toBeInTheDocument()
  })

  it('a none or pending route renders under a deny-all source', async () => {
    for (const id of [
      '/_authenticated/settings/account',
      '/_authenticated/',
      '/_authenticated/reports/',
      '/_authenticated/audit-log/',
    ]) {
      const screen = await render(
        <WithPermissions granted={[]}>{gate(id)}</WithPermissions>
      )
      await expect.element(screen.getByText('The page')).toBeInTheDocument()
      await screen.unmount()
    }
  })
})
