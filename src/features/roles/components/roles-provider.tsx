import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'

type RolesDialogType = 'create' | 'edit' | 'delete' | 'assignments'

type RolesContextType = {
  open: RolesDialogType | null
  setOpen: (str: RolesDialogType | null) => void
  // Id rather than row: dialogs read the latest row from the store.
  currentId: string | null
  setCurrentId: React.Dispatch<React.SetStateAction<string | null>>
}

const RolesContext = React.createContext<RolesContextType | null>(null)

export function RolesProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<RolesDialogType>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)

  return (
    <RolesContext value={{ open, setOpen, currentId, setCurrentId }}>
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
