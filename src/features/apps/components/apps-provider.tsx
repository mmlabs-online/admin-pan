import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'

type AppsDialogType = 'create' | 'edit' | 'status' | 'view'

type AppsContextType = {
  open: AppsDialogType | null
  setOpen: (str: AppsDialogType | null) => void
  // Id rather than row: dialogs read the latest row from the store.
  currentId: string | null
  setCurrentId: React.Dispatch<React.SetStateAction<string | null>>
}

const AppsContext = React.createContext<AppsContextType | null>(null)

export function AppsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<AppsDialogType>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)

  return (
    <AppsContext value={{ open, setOpen, currentId, setCurrentId }}>
      {children}
    </AppsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApps = () => {
  const appsContext = React.useContext(AppsContext)
  if (!appsContext) {
    throw new Error('useApps has to be used within <AppsProvider>')
  }
  return appsContext
}
