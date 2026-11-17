import { useId, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
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
import { useCreateAppMutation, useUpdateAppMutation } from '../api/queries'
import {
  ADMIN_APP_KEY,
  type App,
  type AppForm,
  appFormSchema,
} from '../data/app-schema'
import { ADMIN_APP_NOTE, joinPolicyOptions, orgModeOptions } from '../data/data'
import { appFormError, type AppAlert } from '../data/errors'
import { useApps } from './apps-provider'

type AppFormDialogProps = {
  currentRow?: App
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Radix returns focus only to a `Trigger`; the opener returns it by hand. */
  returnFocus: () => void
}

const sameOrigins = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])

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

  const form = useForm<AppForm>({
    resolver: zodResolver(appFormSchema),
    defaultValues: currentRow
      ? {
          key: currentRow.key,
          name: currentRow.name,
          join_policy: currentRow.join_policy,
          org_mode: currentRow.org_mode,
          origins: currentRow.origins.map((value) => ({ value })),
        }
      : {
          key: '',
          name: '',
          join_policy: 'approval',
          org_mode: 'none',
          origins: [],
        },
  })
  const origins = useFieldArray({ control: form.control, name: 'origins' })
  const originsError =
    form.formState.errors.origins?.message ??
    form.formState.errors.origins?.root?.message

  const reset = () => {
    form.reset()
    create.reset()
    update.reset()
    setAlert(null)
  }

  const onSubmit = async (values: AppForm) => {
    if (inFlight.current) return
    setAlert(null)
    const originValues = values.origins.map((o) => o.value.trim())
    const changed = currentRow && {
      ...(values.name !== currentRow.name && { name: values.name }),
      ...(values.join_policy !== currentRow.join_policy && {
        join_policy: values.join_policy,
      }),
      ...(values.org_mode !== currentRow.org_mode && {
        org_mode: values.org_mode,
      }),
      ...(!sameOrigins(originValues, currentRow.origins) && {
        origins: originValues,
      }),
    }
    // Nothing changed: no request (the admin app then needs no admin:*).
    if (changed && Object.keys(changed).length === 0) {
      reset()
      onOpenChange(false)
      return
    }
    inFlight.current = true
    try {
      if (currentRow && changed) {
        await update.mutateAsync({ key: currentRow.key, body: changed })
      } else {
        await create.mutateAsync({
          key: values.key,
          name: values.name,
          join_policy: values.join_policy,
          org_mode: values.org_mode,
          origins: originValues,
        })
      }
    } catch (error) {
      const mapped = appFormError(error, {
        mode: isEdit ? 'edit' : 'create',
        appKey: currentRow?.key,
      })
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
          <Button
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
