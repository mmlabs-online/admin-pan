import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { SlugConflictError } from '../data/errors'
import { organizations as mockOrganizations } from '../data/organizations'
import { type Organization, type OrganizationStatus } from '../data/schema'

type OrganizationsDialogType = 'create' | 'edit' | 'status' | 'delete'

export type CreateOrganizationInput = {
  slug: string
  name: string
  description: string | null
}

export type UpdateOrganizationInput = {
  name?: string
  description?: string | null
  status?: OrganizationStatus
}

type OrganizationsContextType = {
  organizations: Organization[]
  open: OrganizationsDialogType | null
  setOpen: (value: OrganizationsDialogType | null) => void
  currentRow: Organization | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Organization | null>>
  createOrganization: (input: CreateOrganizationInput) => Organization
  updateOrganization: (
    id: string,
    input: UpdateOrganizationInput
  ) => Organization | undefined
  deleteOrganization: (id: string) => void
}

const OrganizationsContext =
  React.createContext<OrganizationsContextType | null>(null)

type OrganizationsProviderProps = {
  children: React.ReactNode
  /** Initial list; defaults to the mock data. */
  initialData?: Organization[]
}

// In-memory state only (no persistence). Later replaced by TanStack Query
// hooks over org-admin-api.
export function OrganizationsProvider({
  children,
  initialData = mockOrganizations,
}: OrganizationsProviderProps) {
  const [organizations, setOrganizations] =
    useState<Organization[]>(initialData)
  const [open, setOpen] = useDialogState<OrganizationsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Organization | null>(null)

  // POST /api/v1/organizations — admin:orgs:write (planned name)
  const createOrganization = (input: CreateOrganizationInput) => {
    if (organizations.some((org) => org.slug === input.slug)) {
      throw new SlugConflictError(input.slug)
    }
    const now = new Date().toISOString()
    const created: Organization = {
      id: crypto.randomUUID(),
      slug: input.slug,
      name: input.name,
      description: input.description,
      status: 'active',
      created_by: null,
      created_at: now,
      updated_at: now,
    }
    setOrganizations((prev) => [created, ...prev])
    return created
  }

  // PATCH /api/v1/organizations/{id} — admin:orgs:write (planned name)
  const updateOrganization = (id: string, input: UpdateOrganizationInput) => {
    const existing = organizations.find((org) => org.id === id)
    if (!existing) return undefined
    const updated: Organization = {
      ...existing,
      ...input,
      updated_at: new Date().toISOString(),
    }
    setOrganizations((prev) =>
      prev.map((org) => (org.id === id ? updated : org))
    )
    return updated
  }

  // DELETE /api/v1/organizations/{id} — admin:orgs:delete (planned name)
  const deleteOrganization = (id: string) => {
    setOrganizations((prev) => prev.filter((org) => org.id !== id))
  }

  return (
    <OrganizationsContext
      value={{
        organizations,
        open,
        setOpen,
        currentRow,
        setCurrentRow,
        createOrganization,
        updateOrganization,
        deleteOrganization,
      }}
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
