import { create } from 'zustand'

// Rule R3: the access token lives in memory only. Nothing here is written to
// cookies, localStorage or sessionStorage; a page reload means signing in again
// (until @mmlabs/auth-client restores the session from its own device cookie).

interface AuthUser {
  accountNo: string
  email: string
  role: string[]
  exp: number
}

interface AuthState {
  auth: {
    user: AuthUser | null
    setUser: (user: AuthUser | null) => void
    accessToken: string
    setAccessToken: (accessToken: string) => void
    resetAccessToken: () => void
    reset: () => void
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  auth: {
    user: null,
    setUser: (user) => set((state) => ({ auth: { ...state.auth, user } })),
    accessToken: '',
    setAccessToken: (accessToken) =>
      set((state) => ({ auth: { ...state.auth, accessToken } })),
    resetAccessToken: () =>
      set((state) => ({ auth: { ...state.auth, accessToken: '' } })),
    reset: () =>
      set((state) => ({
        auth: { ...state.auth, user: null, accessToken: '' },
      })),
  },
}))
