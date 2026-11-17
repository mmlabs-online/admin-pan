import React, { useState } from 'react'
import { getApi, type ApiClient } from '@/api'
import useDialogState from '@/hooks/use-dialog-state'
import { type App } from '../data/app-schema'

type AppsDialogType = 'create' | 'edit' | 'status' | 'view'

type AppsContextType = {
  api: ApiClient
  open: AppsDialogType | null
  setOpen: (str: AppsDialogType | null) => void
  /** List-row snapshot: names the target; never the source of truth. */
  currentRow: App | null
  setCurrentRow: React.Dispatch<React.SetStateAction<App | null>>
}

const AppsContext = React.createContext<AppsContextType | null>(null)

type AppsProviderProps = {
  children: React.ReactNode
  /** Injected in tests; production uses the shared client. */
  api?: ApiClient
}

export function AppsProvider({ children, api }: AppsProviderProps) {
  const [open, setOpen] = useDialogState<AppsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<App | null>(null)

  return (
    <AppsContext
      value={{ api: api ?? getApi(), open, setOpen, currentRow, setCurrentRow }}
    >
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
