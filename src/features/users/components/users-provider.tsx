import React, { useState } from 'react'
import { getApi, type ApiClient } from '@/api'
import useDialogState from '@/hooks/use-dialog-state'
import { type User } from '../data/schema'

type UsersDialogType = 'view' | 'status'

type UsersContextType = {
  api: ApiClient
  open: UsersDialogType | null
  setOpen: (str: UsersDialogType | null) => void
  /** List-row snapshot: names the target and seeds the sheet; never the source of truth. */
  currentRow: User | null
  setCurrentRow: React.Dispatch<React.SetStateAction<User | null>>
}

const UsersContext = React.createContext<UsersContextType | null>(null)

type UsersProviderProps = {
  children: React.ReactNode
  /** Injected in tests; production uses the shared client. */
  api?: ApiClient
}

export function UsersProvider({ children, api }: UsersProviderProps) {
  const [open, setOpen] = useDialogState<UsersDialogType>(null)
  const [currentRow, setCurrentRow] = useState<User | null>(null)

  return (
    <UsersContext
      value={{
        api: api ?? getApi(),
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
