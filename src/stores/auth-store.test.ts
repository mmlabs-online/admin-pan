import { beforeEach, describe, expect, it } from 'vitest'

async function importAuthStore() {
  const { useAuthStore } = await import('./auth-store')
  return useAuthStore
}

const sampleUser = {
  accountNo: 'ACC-1',
  email: 'user@example.com',
  role: ['admin:*'],
  exp: 1_700_000_000,
}

describe('useAuthStore', () => {
  beforeEach(async () => {
    localStorage.clear()
    sessionStorage.clear()
    ;(await importAuthStore()).getState().auth.reset()
  })

  it('starts signed out', async () => {
    const useAuthStore = await importAuthStore()

    expect(useAuthStore.getState().auth.accessToken).toBe('')
    expect(useAuthStore.getState().auth.user).toBeNull()
  })

  it('keeps the access token in memory only (R3)', async () => {
    const useAuthStore = await importAuthStore()
    useAuthStore.getState().auth.setAccessToken('session-token')

    expect(useAuthStore.getState().auth.accessToken).toBe('session-token')
    expect(document.cookie).not.toContain('session-token')
    expect(JSON.stringify({ ...localStorage })).not.toContain('session-token')
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('session-token')
  })

  it('resetAccessToken clears the token', async () => {
    const useAuthStore = await importAuthStore()
    useAuthStore.getState().auth.setAccessToken('to-clear')
    useAuthStore.getState().auth.resetAccessToken()

    expect(useAuthStore.getState().auth.accessToken).toBe('')
  })

  it('updates the signed-in user via setUser', async () => {
    const useAuthStore = await importAuthStore()
    useAuthStore.getState().auth.setUser({ ...sampleUser })

    expect(useAuthStore.getState().auth.user).toEqual(sampleUser)
  })

  it('reset clears user and access token', async () => {
    const useAuthStore = await importAuthStore()
    useAuthStore.getState().auth.setUser({ ...sampleUser })
    useAuthStore.getState().auth.setAccessToken('t')
    useAuthStore.getState().auth.reset()

    expect(useAuthStore.getState().auth.user).toBeNull()
    expect(useAuthStore.getState().auth.accessToken).toBe('')
  })
})
