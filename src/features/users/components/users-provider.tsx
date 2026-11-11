import React, { useCallback, useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { type User, type UserStatus } from '../data/schema'
import { users as mockUsers } from '../data/users'

type UsersDialogType = 'view' | 'status'

type UsersContextType = {
  users: User[]
  /**
   * Local stand-in for `PATCH /api/v1/users/{id} {status}` (admin:users:write).
   * Updates the in-memory list only; no persistence.
   */
  setUsersStatus: (ids: string[], status: UserStatus) => void
  open: UsersDialogType | null
  setOpen: (str: UsersDialogType | null) => void
  currentRow: User | null
  setCurrentRow: React.Dispatch<React.SetStateAction<User | null>>
}

const UsersContext = React.createContext<UsersContextType | null>(null)

type UsersProviderProps = {
  children: React.ReactNode
  /** Override the mock list (used by tests). */
  initialUsers?: User[]
}

export function UsersProvider({
  children,
  initialUsers = mockUsers,
}: UsersProviderProps) {
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [open, setOpen] = useDialogState<UsersDialogType>(null)
  const [currentRow, setCurrentRow] = useState<User | null>(null)

  const setUsersStatus = useCallback((ids: string[], status: UserStatus) => {
    const idSet = new Set(ids)
    const now = new Date().toISOString()
    const update = (u: User): User =>
      idSet.has(u.id) && u.status !== status
        ? { ...u, status, updated_at: now }
        : u
    setUsers((prev) => prev.map(update))
    // Keep the details sheet in sync with the list.
    setCurrentRow((prev) => (prev ? update(prev) : prev))
  }, [])

  return (
    <UsersContext
      value={{
        users,
        setUsersStatus,
        open,
        setOpen,
        currentRow,
        setCurrentRow,
      }}
    >
      {children}
    </UsersContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useUsers = () => {
  const usersContext = React.useContext(UsersContext)

  if (!usersContext) {
    throw new Error('useUsers has to be used within <UsersContext>')
  }

  return usersContext
}
