import React, { useState } from 'react'
import { getApi, type ApiClient } from '@/api'
import useDialogState from '@/hooks/use-dialog-state'
import { type Organization } from '../data/schema'

type OrganizationsDialogType = 'create' | 'edit' | 'status' | 'delete'

type OrganizationsContextType = {
  api: ApiClient
  open: OrganizationsDialogType | null
  setOpen: (value: OrganizationsDialogType | null) => void
  /** List-row snapshot: names the target; never the source of truth. */
  currentRow: Organization | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Organization | null>>
}

const OrganizationsContext =
  React.createContext<OrganizationsContextType | null>(null)

type OrganizationsProviderProps = {
  children: React.ReactNode
  /** Injected in tests; production uses the shared client. */
  api?: ApiClient
}

export function OrganizationsProvider({
  children,
  api,
}: OrganizationsProviderProps) {
  const [open, setOpen] = useDialogState<OrganizationsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Organization | null>(null)

  return (
    <OrganizationsContext
      value={{ api: api ?? getApi(), open, setOpen, currentRow, setCurrentRow }}
    >
      {children}
    </OrganizationsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useOrganizations = () => {
  const context = React.useContext(OrganizationsContext)
  if (!context) {
    throw new Error(
      'useOrganizations has to be used within <OrganizationsProvider>'
    )
  }
  return context
}
