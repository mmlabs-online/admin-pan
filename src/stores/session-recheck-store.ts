import { create } from 'zustand'

// Bridge from the API client's final 401 to the auth gate. Holds no token.
type SessionRecheck = { generation: number; request: () => void }

export const useSessionRecheck = create<SessionRecheck>()((set) => ({
  generation: 0,
  request: () => set((s) => ({ generation: s.generation + 1 })),
}))
