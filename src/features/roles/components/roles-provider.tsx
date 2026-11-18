import React, { useState } from 'react'
import { getApi, type ApiClient } from '@/api'
import useDialogState from '@/hooks/use-dialog-state'
import { type App } from '@/features/apps/data/app-schema'
import { type RoleDefinition } from '../data/role-schema'

type RolesDialogType =
  | 'create'
  | 'rename'
  | 'permissions'
  | 'delete'
  | 'default'

type RolesContextType = {
  api: ApiClient
  /** The app whose roles are shown; null until the apps list resolves. */
  app: App | null
  open: RolesDialogType | null
  setOpen: (str: RolesDialogType | null) => void
  /** List-row snapshot: names the target; never the source of truth. */
  currentRow: RoleDefinition | null
  setCurrentRow: React.Dispatch<React.SetStateAction<RoleDefinition | null>>
}

const RolesContext = React.createContext<RolesContextType | null>(null)

type RolesProviderProps = {
  children: React.ReactNode
  app: App | null
  /** Injected in tests; production uses the shared client. */
  api?: ApiClient
}

export function RolesProvider({ children, app, api }: RolesProviderProps) {
  const [open, setOpen] = useDialogState<RolesDialogType>(null)
  const [currentRow, setCurrentRow] = useState<RoleDefinition | null>(null)

  return (
    <RolesContext
      value={{
        api: api ?? getApi(),
        app,
        open,
        setOpen,
        currentRow,
        setCurrentRow,
      }}
    >
      {children}
    </RolesContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useRoles = () => {
  const rolesContext = React.useContext(RolesContext)
  if (!rolesContext) {
    throw new Error('useRoles has to be used within <RolesProvider>')
  }
  return rolesContext
}
