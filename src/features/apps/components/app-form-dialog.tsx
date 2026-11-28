import { useEffect, useId, useRef, useState } from 'react'
import {
  useFieldArray,
  useForm,
  useWatch,
  type UseFormReturn,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { useActionPermission } from '@/context/permission-provider'
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
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { SelectDropdown } from '@/components/select-dropdown'
import { allRoleDefinitionsQueryOptions } from '@/features/roles/api/queries'
import { useCreateAppMutation, useUpdateAppMutation } from '../api/queries'
import {
  ADMIN_APP_KEY,
  APP_ROLE_FIELDS,
  ROLE_NONE,
  type App,
  type AppForm,
  type AppRoleField,
  type AppUpdate,
  appFormSchema,
} from '../data/app-schema'
import {
  ADMIN_APP_NOTE,
  ROLE_FIELD_LABELS,
  appUpdateDiff,
  joinPolicyOptions,
  orgModeOptions,
  roleChanges,
  roleSelectItems,
  superAdminNotAlone,
} from '../data/data'
import { appFormError, type AppAlert } from '../data/errors'
import { useApps } from './apps-provider'

type AppFormDialogProps = {
  currentRow?: App
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Radix returns focus only to a `Trigger`; the opener returns it by hand. */
  returnFocus: () => void
}

const PRIVILEGED_HINT =
  'Roles marked privileged hold admin-only permissions or are the super-admin role; the API refuses them here.'
const SUPER_ADMIN_DENIED =
  'Requires admin:*. Only super admins can change the super-admin role.'
const SUPER_ADMIN_ALONE =
  'Save the super-admin role on its own: undo your other changes, or save them first.'

type RolesQuery = {
  status: 'pending' | 'error' | 'success'
}

function roleHint(
  field: AppRoleField,
  roles: RolesQuery,
  denied: boolean
): string {
  if (roles.status === 'pending') return 'Loading roles…'
  if (roles.status === 'error')
    return "Couldn't load this app's roles. Role fields can't be changed."
  if (field === 'super_admin_role_id')
    return denied
      ? SUPER_ADMIN_DENIED
      : 'Lets staff super-admins who hold it open any organization of this app. Needs admin:*.'
  return field === 'org_owner_role_id'
    ? `${PRIVILEGED_HINT} Must stay set while org mode is Required for org creation and invitations.`
    : PRIVILEGED_HINT
}

function RoleSelect({
  form,
  name,
  roles,
  items,
  disabled,
  denied,
}: {
  form: UseFormReturn<AppForm>
  name: AppRoleField
  roles: RolesQuery
  items: { value: string; label: string }[]
  disabled: boolean
  denied: boolean
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{ROLE_FIELD_LABELS[name]}</FormLabel>
          <SelectDropdown
            isControlled
            defaultValue={field.value}
            onValueChange={field.onChange}
            triggerRef={field.ref}
            items={items}
            disabled={disabled}
            className='w-full'
          />
          <FormDescription>{roleHint(name, roles, denied)}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// Register: POST /api/v1/apps; edit: PATCH /api/v1/apps/{key} with the changed
// fields only. Both need admin:apps:write (the API adds admin:* for the admin
// app and decides). Never optimistic (R9).
export function AppFormDialog({
  currentRow,
  open,
  onOpenChange,
  returnFocus,
}: AppFormDialogProps) {
  const isEdit = !!currentRow
  const { api } = useApps()
  const create = useCreateAppMutation(api)
  const update = useUpdateAppMutation(api)
  const pending = isEdit ? update.isPending : create.isPending
  const inFlight = useRef(false)
  const [alert, setAlert] = useState<AppAlert | null>(null)
  const originsErrorId = useId()
  const [phase, setPhase] = useState<'form' | 'review'>('form')
  const [pendingBody, setPendingBody] = useState<AppUpdate | null>(null)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const showRoles = !!currentRow && currentRow.key !== ADMIN_APP_KEY
  const rolesQ = useQuery({
    ...allRoleDefinitionsQueryOptions(currentRow?.key ?? '', api),
    enabled: open && showRoles,
  })
  const superState = useActionPermission('apps.setSuperAdminRole')

  const form = useForm<AppForm>({
    resolver: zodResolver(appFormSchema),
    defaultValues: currentRow
      ? {
          key: currentRow.key,
          name: currentRow.name,
          join_policy: currentRow.join_policy,
          org_mode: currentRow.org_mode,
          origins: currentRow.origins.map((value) => ({ value })),
          default_role_id: currentRow.default_role_id ?? ROLE_NONE,
          org_owner_role_id: currentRow.org_owner_role_id ?? ROLE_NONE,
          super_admin_role_id: currentRow.super_admin_role_id ?? ROLE_NONE,
        }
      : {
          key: '',
          name: '',
          join_policy: 'approval',
          org_mode: 'none',
          origins: [],
          default_role_id: ROLE_NONE,
          org_owner_role_id: ROLE_NONE,
          super_admin_role_id: ROLE_NONE,
        },
  })
  const orgMode = useWatch({ control: form.control, name: 'org_mode' })
  const superDenied = superState === 'denied'
  // A role field is sent only once the roles loaded and the field is usable.
  const editable: AppRoleField[] =
    showRoles && rolesQ.isSuccess
      ? [
          'default_role_id',
          ...(orgMode === 'required'
            ? (['org_owner_role_id'] as const)
            : ([] as const)),
          ...(orgMode === 'required' && !superDenied
            ? (['super_admin_role_id'] as const)
            : ([] as const)),
        ]
      : []
  const byId = new Map((rolesQ.data ?? []).map((r) => [r.id, r]))
  const roleItems = (field: AppRoleField) =>
    roleSelectItems(rolesQ.data ?? [], currentRow?.[field], {
      annotatePrivileged: field !== 'super_admin_role_id',
    })

  useEffect(() => {
    if (phase === 'review') reviewHeading.current?.focus()
  }, [phase])
  const origins = useFieldArray({ control: form.control, name: 'origins' })
  const originsError =
    form.formState.errors.origins?.message ??
    form.formState.errors.origins?.root?.message

  const reset = () => {
    form.reset()
    create.reset()
    update.reset()
    setAlert(null)
    setPhase('form')
    setPendingBody(null)
  }

  const submit = async (values: AppForm, body: AppUpdate | null) => {
    if (inFlight.current) return
    setAlert(null)
    inFlight.current = true
    try {
      if (currentRow && body) {
        await update.mutateAsync({ key: currentRow.key, body })
      } else {
        await create.mutateAsync({
          key: values.key,
          name: values.name,
          join_policy: values.join_policy,
          org_mode: values.org_mode,
          origins: values.origins.map((o) => o.value.trim()),
        })
      }
    } catch (error) {
      const mapped = appFormError(error, {
        mode: isEdit ? 'edit' : 'create',
        appKey: currentRow?.key,
        sent: body ? Object.keys(body) : undefined,
      })
      // The form is hidden during the review: show it before focusing.
      flushSync(() => setPhase('form'))
      const [first, ...rest] = Object.entries(mapped.fields)
      if (first) {
        form.setError(
          first[0] as keyof AppForm,
          { message: first[1] },
          { shouldFocus: first[0] !== 'origins' }
        )
        if (first[0] === 'origins' && origins.fields.length)
          form.setFocus('origins.0.value')
      }
      for (const [field, message] of rest)
        form.setError(field as keyof AppForm, { message })
      setAlert(mapped.alert)
      return
    } finally {
      inFlight.current = false
    }
    toast.success(
      isEdit
        ? `App ${currentRow.key} updated.`
        : `App ${values.key} registered.`
    )
    reset()
    onOpenChange(false)
  }

  const onSubmit = async (values: AppForm) => {
    if (inFlight.current) return
    if (!currentRow) return submit(values, null)
    const diff = appUpdateDiff(currentRow, values, editable)
    // Nothing changed: no request (the admin app then needs no admin:*).
    if (Object.keys(diff).length === 0) {
      reset()
      onOpenChange(false)
      return
    }
    if (superAdminNotAlone(diff)) {
      form.setError(
        'super_admin_role_id',
        { message: SUPER_ADMIN_ALONE },
        { shouldFocus: true }
      )
      return
    }
    // A role change is confirmed first (R9); nothing is sent yet.
    if (APP_ROLE_FIELDS.some((f) => f in diff)) {
      setPendingBody(diff)
      setPhase('review')
      return
    }
    await submit(values, diff)
  }

  const review =
    phase === 'review' && currentRow && pendingBody
      ? roleChanges(currentRow, pendingBody, byId, currentRow.name)
      : null

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        if (!state && pending) return
        reset()
        onOpenChange(state)
      }}
    >
      <DialogContent
        className='sm:max-w-lg'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus()
        }}
      >
        <DialogHeader className='text-start'>
          <DialogTitle>
            {isEdit ? `Edit app ${currentRow.key}` : 'Register app'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the app settings. The key cannot be changed.'
              : 'Register a new app. The key cannot be changed later.'}
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[60vh] overflow-y-auto px-0.5 py-1'>
          <Form {...form}>
            <form
              id='app-form'
              onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
              className='space-y-4'
              noValidate
              hidden={phase === 'review'}
            >
              <FormField
                control={form.control}
                name='key'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Key</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='stoktok'
                        autoComplete='off'
                        className='font-mono'
                        readOnly={isEdit}
                        aria-readonly={isEdit || undefined}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {isEdit
                        ? 'The key cannot be changed.'
                        : 'Lowercase; used as the permission prefix and the X-MM-App value. Cannot be changed later.'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Stoktok'
                        autoComplete='off'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className='grid gap-4 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='join_policy'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Join policy</FormLabel>
                      <SelectDropdown
                        isControlled
                        defaultValue={field.value}
                        onValueChange={field.onChange}
                        items={joinPolicyOptions}
                        className='w-full'
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='org_mode'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Org mode</FormLabel>
                      <SelectDropdown
                        isControlled
                        defaultValue={field.value}
                        onValueChange={field.onChange}
                        items={orgModeOptions}
                        className='w-full'
                      />
                      {isEdit && (
                        <FormDescription>
                          Changing org mode does not reclassify existing
                          permissions.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {showRoles && currentRow && (
                <div className='space-y-4'>
                  <RoleSelect
                    form={form}
                    name='default_role_id'
                    roles={rolesQ}
                    items={roleItems('default_role_id')}
                    disabled={!editable.includes('default_role_id')}
                    denied={false}
                  />
                  {orgMode === 'required' && (
                    <>
                      <RoleSelect
                        form={form}
                        name='org_owner_role_id'
                        roles={rolesQ}
                        items={roleItems('org_owner_role_id')}
                        disabled={!editable.includes('org_owner_role_id')}
                        denied={false}
                      />
                      <RoleSelect
                        form={form}
                        name='super_admin_role_id'
                        roles={rolesQ}
                        items={roleItems('super_admin_role_id')}
                        disabled={!editable.includes('super_admin_role_id')}
                        denied={superDenied}
                      />
                    </>
                  )}
                  {rolesQ.isError && (
                    <Button
                      type='button'
                      size='sm'
                      onClick={() => void rolesQ.refetch()}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              )}
              <fieldset
                className='space-y-2'
                aria-describedby={originsError ? originsErrorId : undefined}
              >
                <legend className='text-sm font-medium'>Origins</legend>
                <p className='text-sm text-muted-foreground'>
                  Browser origins allowed to call the API for this app (CORS):
                  https://mmlabs.online or its subdomains, or
                  http(s)://localhost for development.
                </p>
                {origins.fields.length === 0 && (
                  <p className='text-sm text-muted-foreground italic'>
                    No origins yet.
                  </p>
                )}
                <ul className='space-y-2'>
                  {origins.fields.map((item, index) => (
                    <li key={item.id}>
                      <FormField
                        control={form.control}
                        name={`origins.${index}.value`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className='sr-only'>
                              Origin {index + 1}
                            </FormLabel>
                            <div className='flex gap-2'>
                              <FormControl>
                                <Input
                                  placeholder='https://app.mmlabs.online'
                                  autoComplete='off'
                                  {...field}
                                />
                              </FormControl>
                              <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                aria-label={`Remove origin ${index + 1}`}
                                onClick={() => origins.remove(index)}
                              >
                                <X className='size-4' aria-hidden='true' />
                              </Button>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </li>
                  ))}
                </ul>
                {originsError && (
                  <p
                    id={originsErrorId}
                    role='alert'
                    className='text-sm text-destructive'
                  >
                    {originsError}
                  </p>
                )}
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => origins.append({ value: '' })}
                >
                  <Plus className='size-4' aria-hidden='true' />
                  Add origin
                </Button>
              </fieldset>
            </form>
          </Form>
        </div>
        {review && currentRow && (
          <section
            aria-labelledby='app-review-heading'
            className='max-h-[60vh] space-y-3 overflow-y-auto text-sm'
          >
            <h3
              id='app-review-heading'
              ref={reviewHeading}
              tabIndex={-1}
              className='font-medium'
            >
              Review role changes
            </h3>
            <p>
              App {currentRow.name} ({currentRow.key}):
            </p>
            <ul className='space-y-2'>
              {review.changes.map((c) => (
                <li key={c.field}>
                  {c.label}: <code>{c.from}</code> → <code>{c.to}</code>
                  <br />
                  <span className='text-muted-foreground'>{c.consequence}</span>
                </li>
              ))}
            </ul>
            {review.others.length > 0 && (
              <p>Also saves: {review.others.join(', ')}.</p>
            )}
          </section>
        )}
        {currentRow?.key === ADMIN_APP_KEY && (
          <p className='text-sm text-muted-foreground'>{ADMIN_APP_NOTE}</p>
        )}
        {alert?.kind === 'forbidden' && (
          <ForbiddenPanel variant='inline' copy={alert.copy} />
        )}
        {alert?.kind === 'message' && (
          <p role='alert' className='text-sm text-destructive'>
            {alert.text}
          </p>
        )}
        <p role='status' aria-live='polite' className='sr-only'>
          {pending ? (isEdit ? 'Saving…' : 'Registering…') : ''}
        </p>
        <DialogFooter>
          {phase === 'review' ? (
            <>
              <Button
                key='back'
                type='button'
                variant='outline'
                onClick={() => {
                  flushSync(() => setPhase('form'))
                  const first = APP_ROLE_FIELDS.find(
                    (f) => pendingBody && f in pendingBody
                  )
                  if (first) form.setFocus(first)
                }}
              >
                Back
              </Button>
              <Button
                type='button'
                aria-disabled={pending || undefined}
                className={pending ? 'opacity-50' : undefined}
                onClick={() => void submit(form.getValues(), pendingBody)}
              >
                {pending ? 'Saving…' : 'Confirm and save'}
              </Button>
            </>
          ) : (
            <Button
              key='save'
              type='submit'
              form='app-form'
              aria-disabled={pending || undefined}
              className={pending ? 'opacity-50' : undefined}
            >
              {pending
                ? isEdit
                  ? 'Saving…'
                  : 'Registering…'
                : isEdit
                  ? 'Save changes'
                  : 'Register app'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
