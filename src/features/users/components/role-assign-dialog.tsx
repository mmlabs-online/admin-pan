import { useRef, useState } from 'react'
import { z } from 'zod'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { type ApiClient, type components } from '@/api'
import { toast } from 'sonner'
import { queryView } from '@/lib/query-view'
import {
  useActionPermission,
  usePermissionSource,
  useSelfUserId,
} from '@/context/permission-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { appsListQueryOptions } from '@/features/apps/api/queries'
import { ADMIN_APP_KEY, type App } from '@/features/apps/data/app-schema'
import { message, type AppAlert } from '@/features/apps/data/errors'
import { allRoleDefinitionsQueryOptions } from '@/features/roles/api/queries'
import {
  SUPER_ADMIN_ROLE_KEY,
  type RoleDefinition,
} from '@/features/roles/data/role-schema'
import { useAssignRoleMutation } from '../api/queries'
import {
  assignmentEffect,
  toExpiresAt,
  zoneLabel,
  type AssignmentCreate,
} from '../data/assignments'
import { formatDateTimeZone, userLabel } from '../data/data'
import { assignRoleError } from '../data/errors'
import { type User } from '../data/schema'
import { OrgPicker, UserPicker } from './assign-pickers'

type Organization = components['schemas']['OrganizationRead']

export type AssignTarget =
  | { kind: 'user'; user: User }
  | { kind: 'role'; app: App; role: RoleDefinition }

type AssignDone =
  | { result: 'success'; app: string; roleKey: string }
  | { result: 'cancel' }

type Props = {
  api: ApiClient
  target: AssignTarget
  onDone: (result: AssignDone) => void
}

const formSchema = z.object({
  appKey: z.string().min(1, 'Choose an app.'),
  roleId: z.string().min(1, 'Choose a role.'),
  expiresLocal: z.string(),
})
type FormValues = z.infer<typeof formSchema>

const roleLabel = (r: RoleDefinition) => `${r.name} (${r.key})`

// POST /api/v1/users/{id}/role-assignments — admin:roles:assign. The user is
// fixed (user sheet) or picked explicitly (holders sheet). The privileged and
// self hints are advisory: the API decides and every 403 is shown (R4). Never
// optimistic, never retried; privileged and admin-app grants confirm first (R9).
export function RoleAssignDialog({ api, target, onDone }: Props) {
  const assign = useAssignRoleMutation(api)
  const source = usePermissionSource()
  const selfId = useSelfUserId()
  const usersPermission = useActionPermission('users.view')
  const orgsPermission = useActionPermission('organizations.view')
  const inFlight = useRef(false)
  const [phase, setPhase] = useState<'form' | 'confirm'>('form')
  const [alert, setAlert] = useState<AppAlert | null>(null)
  const [pickedUser, setPickedUser] = useState<User | null>(null)
  const [orgScope, setOrgScope] = useState<'app' | 'org'>('app')
  const [pickedOrg, setPickedOrg] = useState<Organization | null>(null)
  const [orgError, setOrgError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      appKey: target.kind === 'role' ? target.app.key : '',
      roleId: target.kind === 'role' ? target.role.id : '',
      expiresLocal: '',
    },
  })
  const [appKey, roleId, expiresLocal] = useWatch({
    control: form.control,
    name: ['appKey', 'roleId', 'expiresLocal'],
  })

  const apps = useQuery({
    ...appsListQueryOptions({ limit: 100, offset: 0 }, api),
    enabled: target.kind === 'user',
  })
  const roles = useQuery({
    ...allRoleDefinitionsQueryOptions(appKey, api),
    enabled: target.kind === 'user' && appKey !== '',
  })
  const appsView = queryView(apps)
  const rolesView = queryView(roles)

  const app =
    target.kind === 'role'
      ? target.app
      : apps.data?.items.find((a) => a.key === appKey)
  const role =
    target.kind === 'role'
      ? target.role
      : roles.data?.find((r) => r.id === roleId)
  const user = target.kind === 'user' ? target.user : pickedUser
  const adminDenied = source.check('admin:*') === 'denied'
  const privileged = !!role && (role.privileged || appKey === ADMIN_APP_KEY)
  const needsAdminWildcard = !!role?.privileged && adminDenied
  const isSelf =
    appKey === ADMIN_APP_KEY &&
    selfId !== undefined &&
    user !== null &&
    selfId.toLowerCase() === user.id.toLowerCase()
  const noExpiry = role?.key === SUPER_ADMIN_ROLE_KEY
  const showOrg = !!app && app.org_mode !== 'none'
  const orgChosen = orgScope === 'app' || pickedOrg !== null
  const ready =
    !assign.isPending &&
    !!user &&
    !!role &&
    !isSelf &&
    !needsAdminWildcard &&
    orgChosen
  const expiry = toExpiresAt(noExpiry ? '' : expiresLocal)

  const scope =
    showOrg && orgScope === 'org' && pickedOrg ? pickedOrg.name : 'app-wide'
  const summary =
    user && role && app ? (
      <>
        Grant {roleLabel(role)} in {app.key} to <bdi>{userLabel(user)}</bdi> (
        <bdi>{user.email}</bdi>),{' '}
        {scope === 'app-wide' ? scope : <bdi>{scope}</bdi>}
        {expiry.ok && expiry.value
          ? `, until ${formatDateTimeZone(expiry.value)}`
          : ''}
        .
      </>
    ) : null

  const send = (expiresAt: string | null) => {
    if (inFlight.current || !user || !role) return
    inFlight.current = true
    setAlert(null)
    setOrgError(null)
    const body: AssignmentCreate = {
      role_id: role.id,
      ...(showOrg && orgScope === 'org' && pickedOrg
        ? { org_id: pickedOrg.id }
        : {}),
      ...(expiresAt ? { expires_at: expiresAt } : {}),
    }
    assign.mutate(
      { userId: user.id, app: role.app, body },
      {
        onSuccess: () => {
          // No email in the toast (R5).
          toast.success(`Role ${role.key} granted in ${role.app}.`)
          onDone({ result: 'success', app: role.app, roleKey: role.key })
        },
        onError: (error) => {
          const mapped = assignRoleError(error)
          setPhase('form')
          let next = mapped.alert
          const field = (name: keyof FormValues, text: string, focus = false) =>
            form.setError(name, { message: text }, { shouldFocus: focus })
          if (mapped.fields.org) setOrgError(mapped.fields.org)
          if (mapped.fields.expires_at)
            field('expiresLocal', mapped.fields.expires_at, true)
          if (mapped.fields.role) {
            if (target.kind === 'user') {
              form.setValue('roleId', '')
              field('roleId', mapped.fields.role)
            } else next = message(mapped.fields.role)
          }
          if (mapped.fields.user) next = message(mapped.fields.user)
          setAlert(next)
        },
        onSettled: () => {
          inFlight.current = false
        },
      }
    )
  }

  const onSubmit = () => {
    if (!ready) return
    if (!expiry.ok) {
      form.setError(
        'expiresLocal',
        { message: expiry.error },
        { shouldFocus: true }
      )
      return
    }
    if (phase === 'form' && privileged) {
      setPhase('confirm')
      return
    }
    send(expiry.value)
  }

  const resetBelowApp = () => {
    form.setValue('roleId', '')
    form.setValue('expiresLocal', '')
    form.clearErrors()
    setOrgScope('app')
    setPickedOrg(null)
    setOrgError(null)
  }

  const submitLabel = assign.isPending
    ? 'Granting…'
    : phase === 'confirm'
      ? 'Grant role'
      : privileged
        ? 'Review grant'
        : 'Grant role'

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (next || assign.isPending) return
        onDone({ result: 'cancel' })
      }}
    >
      <DialogContent
        className='max-h-[90vh] overflow-y-auto sm:max-w-lg'
        // The opener decides where focus goes (it may have changed).
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className='text-start'>
          {target.kind === 'user' ? (
            <>
              <DialogTitle>
                Assign a role to <bdi>{userLabel(target.user)}</bdi>
              </DialogTitle>
              <DialogDescription>
                <bdi>{target.user.email}</bdi>
              </DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle>
                Assign {target.role.name} ({target.role.key})
              </DialogTitle>
              <DialogDescription>in {target.app.name}</DialogDescription>
            </>
          )}
        </DialogHeader>

        {user?.status === 'disabled' && (
          <p className='text-sm text-muted-foreground'>
            This account is disabled; they can&apos;t sign in until it is
            re-enabled.
          </p>
        )}

        {phase === 'confirm' ? (
          <div className='space-y-2 text-sm'>
            <p>{summary}</p>
            <p>
              This role gives admin-level access. Granting it needs admin:*.
            </p>
            <p className='text-muted-foreground'>{assignmentEffect(appKey)}</p>
          </div>
        ) : (
          <Form {...form}>
            <form
              id='role-assign-form'
              onSubmit={(e) => {
                void form.handleSubmit(onSubmit)(e)
              }}
              className='space-y-4'
              noValidate
            >
              {target.kind === 'role' && (
                <UserPicker
                  api={api}
                  selected={pickedUser}
                  onSelect={setPickedUser}
                  unavailable={
                    usersPermission === 'denied'
                      ? 'Searching users needs admin:users:read.'
                      : undefined
                  }
                />
              )}

              {target.kind === 'user' && (
                <>
                  <FormField
                    control={form.control}
                    name='appKey'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>App</FormLabel>
                        {appsView.status === 'forbidden' ? (
                          <ForbiddenPanel
                            variant='inline'
                            copy={appsView.copy}
                          />
                        ) : appsView.status === 'error' ? (
                          <div role='alert' className='space-y-2 text-sm'>
                            <p>Couldn&apos;t load apps.</p>
                            <Button
                              type='button'
                              size='sm'
                              onClick={() => void apps.refetch()}
                            >
                              Retry
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Select
                              value={field.value}
                              onValueChange={(v) => {
                                field.onChange(v)
                                resetBelowApp()
                              }}
                            >
                              <FormControl>
                                <SelectTrigger className='w-full'>
                                  <SelectValue
                                    placeholder={
                                      appsView.status === 'pending'
                                        ? 'Loading apps…'
                                        : 'Choose an app'
                                    }
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {(appsView.status === 'success'
                                  ? appsView.data.items
                                  : []
                                ).map((a) => (
                                  <SelectItem key={a.key} value={a.key}>
                                    {a.name} ({a.key})
                                    {a.status === 'disabled'
                                      ? ' — disabled'
                                      : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {appsView.status === 'success' &&
                              appsView.data.total >
                                appsView.data.items.length && (
                                <p className='text-sm text-muted-foreground'>
                                  Showing the first {appsView.data.items.length}{' '}
                                  apps.
                                </p>
                              )}
                          </>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='roleId'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        {appKey === '' ? (
                          <p className='text-sm text-muted-foreground'>
                            Choose an app first.
                          </p>
                        ) : rolesView.status === 'forbidden' ? (
                          <ForbiddenPanel
                            variant='inline'
                            copy={rolesView.copy}
                          />
                        ) : rolesView.status === 'error' ? (
                          <div role='alert' className='space-y-2 text-sm'>
                            <p>Couldn&apos;t load roles.</p>
                            <Button
                              type='button'
                              size='sm'
                              onClick={() => void roles.refetch()}
                            >
                              Retry
                            </Button>
                          </div>
                        ) : (
                          <Select
                            value={field.value}
                            onValueChange={(v) => {
                              field.onChange(v)
                              form.clearErrors('roleId')
                            }}
                          >
                            <FormControl>
                              <SelectTrigger className='w-full'>
                                <SelectValue
                                  placeholder={
                                    rolesView.status === 'pending'
                                      ? 'Loading roles…'
                                      : 'Choose a role'
                                  }
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(rolesView.status === 'success'
                                ? rolesView.data
                                : []
                              ).map((r) => (
                                <SelectItem
                                  key={r.id}
                                  value={r.id}
                                  disabled={r.privileged && adminDenied}
                                >
                                  {roleLabel(r)}
                                  {r.privileged ? ' — needs admin:*' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {needsAdminWildcard && (
                <p className='text-sm text-muted-foreground'>
                  Needs admin:* to grant this role.
                </p>
              )}

              {showOrg && (
                <fieldset className='space-y-2'>
                  <legend className='text-sm font-medium'>Scope</legend>
                  <label className='flex items-center gap-2 text-sm'>
                    <input
                      type='radio'
                      name='org-scope'
                      checked={orgScope === 'app'}
                      onChange={() => {
                        setOrgScope('app')
                        setPickedOrg(null)
                        setOrgError(null)
                      }}
                    />
                    App-wide
                  </label>
                  <label className='flex items-center gap-2 text-sm'>
                    <input
                      type='radio'
                      name='org-scope'
                      checked={orgScope === 'org'}
                      onChange={() => setOrgScope('org')}
                    />
                    One organization
                  </label>
                  {orgScope === 'org' && (
                    <OrgPicker
                      api={api}
                      selected={pickedOrg}
                      onSelect={(o) => {
                        setPickedOrg(o)
                        setOrgError(null)
                      }}
                      unavailable={
                        orgsPermission === 'denied'
                          ? 'Searching organizations needs admin:organizations:read. Use app-wide.'
                          : undefined
                      }
                    />
                  )}
                  {orgError && (
                    <p role='alert' className='text-sm text-destructive'>
                      {orgError}
                    </p>
                  )}
                </fieldset>
              )}

              <FormField
                control={form.control}
                name='expiresLocal'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expires (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type='datetime-local'
                        disabled={noExpiry}
                        {...field}
                        value={noExpiry ? '' : field.value}
                      />
                    </FormControl>
                    <FormDescription>
                      {noExpiry
                        ? "admin:super-admin can't expire."
                        : `Your time zone: ${zoneLabel()}. Leave empty for no expiry.`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isSelf && (
                <p className='text-sm text-muted-foreground'>
                  You can&apos;t change your own admin roles.
                </p>
              )}
              {summary && (
                <div aria-live='polite' className='space-y-1 text-sm'>
                  <p>{summary}</p>
                  <p className='text-muted-foreground'>
                    {assignmentEffect(appKey)}
                  </p>
                </div>
              )}
            </form>
          </Form>
        )}

        {alert &&
          (alert.kind === 'forbidden' ? (
            <ForbiddenPanel variant='inline' copy={alert.copy} />
          ) : (
            <p role='alert' className='text-sm text-destructive'>
              {alert.text}
            </p>
          ))}
        <p role='status' aria-live='polite' className='sr-only'>
          {assign.isPending ? 'Granting…' : ''}
        </p>

        <DialogFooter>
          {phase === 'confirm' ? (
            <>
              <Button
                type='button'
                variant='outline'
                aria-disabled={assign.isPending || undefined}
                onClick={() => {
                  if (!assign.isPending) setPhase('form')
                }}
              >
                Back
              </Button>
              <Button
                type='button'
                aria-disabled={assign.isPending || undefined}
                className={assign.isPending ? 'opacity-50' : undefined}
                onClick={() => {
                  if (assign.isPending) return
                  if (expiry.ok) send(expiry.value)
                }}
              >
                {submitLabel}
              </Button>
            </>
          ) : (
            <Button
              type='submit'
              form='role-assign-form'
              aria-disabled={!ready || undefined}
              className='aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
            >
              {submitLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
