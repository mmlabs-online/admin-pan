import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { isForbidden } from '@/lib/forbidden'
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
import { appsListQueryOptions } from '@/features/apps/api/queries'
import { ADMIN_APP_KEY } from '@/features/apps/data/app-schema'
import {
  ENTITLEMENTS_PAGE_SIZE,
  useGrantEntitlementMutation,
  useUpdateEntitlementMutation,
} from '../api/entitlements'
import {
  entitlementFormError,
  type EntitlementAlert,
} from '../data/entitlement-errors'
import {
  LIMITS_MAX,
  entitlementFormSchema,
  fromLimits,
  limitsEqual,
  toLimits,
  type Entitlement,
  type EntitlementForm,
  type EntitlementUpdate,
} from '../data/entitlement-schema'
import { type Organization } from '../data/schema'
import { useOrganizations } from './organizations-provider'

type EntitlementFormDialogProps = {
  org: Organization
  onOpenChange: (open: boolean) => void
  /** Radix returns focus only to a `Trigger`; the opener returns it by hand. */
  returnFocus: () => void
} & (
  | { mode: 'grant'; existing: string[]; entitlement?: undefined }
  | { mode: 'edit'; entitlement: Entitlement; existing?: undefined }
)

// Grant: POST …/entitlements {app_key, plan, limits}; edit: PATCH …/{id} with
// only what changed (`limits` replaces the whole object). admin:entitlements:
// write. Mounted only while open. `enabled` is never sent on grant (API
// default true): disabling is a separate, confirmed action. Never optimistic (R9).
export function EntitlementFormDialog(props: EntitlementFormDialogProps) {
  const { org, mode, onOpenChange, returnFocus } = props
  const { api } = useOrganizations()
  const grant = useGrantEntitlementMutation(org.id, api)
  const update = useUpdateEntitlementMutation(org.id, api)
  const pending = grant.isPending || update.isPending
  const inFlight = useRef(false)
  const [alert, setAlert] = useState<EntitlementAlert | null>(null)
  const edit = props.mode === 'edit' ? props.entitlement : null

  const form = useForm<EntitlementForm>({
    resolver: zodResolver(entitlementFormSchema(mode)),
    defaultValues: {
      app_key: edit?.app_key ?? '',
      plan: edit?.plan ?? '',
      limits: edit ? fromLimits(edit.limits) : [],
    },
  })
  const limits = useFieldArray({ control: form.control, name: 'limits' })
  // Where focus goes once a removed row has unmounted (WCAG 2.4.3): the key
  // input now at the same index, else the previous row, else "Add limit".
  const focusAfterRemove = useRef<number | null>(null)
  const addLimitRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const target = focusAfterRemove.current
    if (target === null) return
    focusAfterRemove.current = null
    if (target < 0) addLimitRef.current?.focus()
    else form.setFocus(`limits.${target}.key`)
  }, [limits.fields, form])
  const removeLimit = (index: number) => {
    focusAfterRemove.current =
      index < limits.fields.length - 1 ? index : index - 1
    limits.remove(index)
  }

  const apps = useQuery({
    ...appsListQueryOptions({ limit: ENTITLEMENTS_PAGE_SIZE, offset: 0 }, api),
    enabled: mode === 'grant',
  })
  const existing = props.existing ?? []
  const eligible =
    apps.data && apps.data.total <= apps.data.items.length
      ? apps.data.items.filter(
          (a) =>
            a.status === 'active' &&
            a.org_mode === 'required' &&
            a.key !== ADMIN_APP_KEY &&
            !existing.includes(a.key)
        )
      : null
  // No eligible app: nothing to grant (the API still enforces the rules).
  const noneEligible = eligible !== null && eligible.length === 0

  const onSubmit = async (values: EntitlementForm) => {
    if (inFlight.current) return
    inFlight.current = true
    setAlert(null)
    try {
      const rows = values.limits
      if (!edit) {
        await grant.mutateAsync({
          app_key: values.app_key,
          plan: values.plan,
          limits: toLimits(rows),
        })
      } else {
        const body: EntitlementUpdate = {}
        if (values.plan !== edit.plan) body.plan = values.plan
        if (!limitsEqual(toLimits(rows), edit.limits))
          body.limits = toLimits(rows)
        if (Object.keys(body).length === 0) {
          setAlert({ kind: 'message', text: 'Nothing to save.' })
          return
        }
        await update.mutateAsync({ entitlementId: edit.id, body })
      }
    } catch (error) {
      const mapped = entitlementFormError(error, mode)
      const [first, ...rest] = Object.entries(mapped.fields) as [
        keyof EntitlementForm,
        string,
      ][]
      if (first)
        form.setError(first[0], { message: first[1] }, { shouldFocus: true })
      for (const [field, message] of rest) form.setError(field, { message })
      setAlert(mapped.alert)
      return
    } finally {
      inFlight.current = false
    }
    toast.success(
      edit
        ? `${edit.app_key} for ${org.name} updated.`
        : `${values.app_key} granted to ${org.name}.`
    )
    onOpenChange(false)
  }

  const limitsErrors = form.formState.errors.limits
  const limitsError = limitsErrors?.message ?? limitsErrors?.root?.message
  const limitsErrorId = 'entitlement-limits-error'

  return (
    <Dialog
      open
      onOpenChange={(state) => {
        if (!state && pending) return
        onOpenChange(state)
      }}
    >
      <DialogContent
        className='max-h-[90vh] overflow-y-auto sm:max-w-lg'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus()
        }}
      >
        <DialogHeader className='text-start'>
          <DialogTitle>
            {edit ? `Edit ${edit.app_key} for ${org.name}` : 'Grant product'}
          </DialogTitle>
          <DialogDescription>
            {edit
              ? 'Plan and limits are read by the app. The change is recorded in the audit log.'
              : `Grant a product to ${org.name} (${org.slug}). The change is recorded in the audit log.`}
            {org.status === 'suspended' &&
              ' The organization is suspended: the entitlement stays inactive until it is reactivated.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id='entitlement-form'
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className='space-y-3'
            noValidate
          >
            {edit ? (
              <p className='text-sm'>
                App: <span className='font-mono'>{edit.app_key}</span>
              </p>
            ) : apps.isPending ? (
              <p role='status'>Loading apps…</p>
            ) : noneEligible ? (
              <p className='text-sm text-muted-foreground'>
                No eligible apps. An app must be active, use organizations, and
                not be granted here yet.
              </p>
            ) : (
              <FormField
                control={form.control}
                name='app_key'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{eligible ? 'App' : 'App key'}</FormLabel>
                    {eligible ? (
                      <SelectDropdown
                        isControlled
                        defaultValue={field.value}
                        onValueChange={field.onChange}
                        placeholder='Select an app'
                        items={eligible.map((a) => ({
                          label: `${a.name} (${a.key})`,
                          value: a.key,
                        }))}
                        className='w-full'
                      />
                    ) : (
                      <>
                        <FormControl>
                          <Input
                            autoComplete='off'
                            placeholder='calechip'
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          {isForbidden(apps.error)
                            ? "You can't list apps (needs admin:apps:read). Type the app key."
                            : "Couldn't load the app list. Type the app key."}
                        </FormDescription>
                      </>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name='plan'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan</FormLabel>
                  <FormControl>
                    <Input placeholder='pro' autoComplete='off' {...field} />
                  </FormControl>
                  <FormDescription>
                    Lowercase letters, digits, - and _
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <fieldset
              className='space-y-2'
              aria-describedby={limitsError ? limitsErrorId : undefined}
            >
              <legend className='text-sm font-medium'>Limits</legend>
              {limits.fields.length === 0 && (
                <p className='text-sm text-muted-foreground'>No limits.</p>
              )}
              {limits.fields.map((row, index) => (
                <div key={row.id} className='flex items-start gap-2'>
                  <FormField
                    control={form.control}
                    name={`limits.${index}.key`}
                    render={({ field }) => (
                      <FormItem className='flex-1'>
                        {index === 0 && <FormLabel>Limit name</FormLabel>}
                        <FormControl>
                          <Input
                            autoComplete='off'
                            placeholder='seats'
                            aria-label={`Limit name, row ${index + 1}`}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`limits.${index}.value`}
                    render={({ field }) => (
                      <FormItem className='flex-1'>
                        {index === 0 && <FormLabel>Value</FormLabel>}
                        <FormControl>
                          <Input
                            type='text'
                            inputMode='numeric'
                            autoComplete='off'
                            placeholder='10'
                            aria-label={`Value, row ${index + 1}`}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className={index === 0 ? 'mt-[1.625rem]' : undefined}
                    aria-label={`Remove limit row ${index + 1}`}
                    onClick={() => removeLimit(index)}
                  >
                    <X className='size-4' aria-hidden='true' />
                  </Button>
                </div>
              ))}
              {limitsError && (
                <p
                  id={limitsErrorId}
                  role='alert'
                  className='text-sm text-destructive'
                >
                  {limitsError}
                </p>
              )}
              <div className='flex items-center gap-2'>
                <Button
                  ref={addLimitRef}
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={limits.fields.length >= LIMITS_MAX}
                  onClick={() => limits.append({ key: '', value: '' })}
                >
                  <Plus className='size-4' aria-hidden='true' />
                  Add limit
                </Button>
                {limits.fields.length >= LIMITS_MAX && (
                  <span className='text-sm text-muted-foreground'>
                    At most {LIMITS_MAX} limits.
                  </span>
                )}
              </div>
            </fieldset>
          </form>
        </Form>
        {alert?.kind === 'forbidden' && (
          <ForbiddenPanel variant='inline' copy={alert.copy} />
        )}
        {alert?.kind === 'message' && (
          <p role='alert' className='text-sm text-destructive'>
            {alert.text}
          </p>
        )}
        <p role='status' aria-live='polite' className='sr-only'>
          {pending ? (mode === 'grant' ? 'Granting…' : 'Saving…') : ''}
        </p>
        <DialogFooter>
          <Button
            type='submit'
            form='entitlement-form'
            disabled={mode === 'grant' && noneEligible}
            aria-disabled={pending || undefined}
            className={pending ? 'opacity-50' : undefined}
          >
            {mode === 'grant'
              ? pending
                ? 'Granting…'
                : 'Grant'
              : pending
                ? 'Saving…'
                : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
