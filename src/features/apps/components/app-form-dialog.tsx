import { useMemo } from 'react'
import { z } from 'zod'
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
import { SelectDropdown } from '@/components/select-dropdown'
import { createApp, updateApp, useAccessData } from '../data/access-store'
import {
  KEY_SEGMENT_PATTERN,
  isHttpsOrigin,
  joinPolicyOptions,
  orgModeOptions,
} from '../data/data'
import { type App, joinPolicySchema, orgModeSchema } from '../data/schema'

function buildAppFormSchema(takenKeys: string[]) {
  return z
    .object({
      key: z
        .string()
        .trim()
        .min(1, 'Key is required.')
        .regex(
          KEY_SEGMENT_PATTERN,
          'Key must start with a lowercase letter and use only lowercase letters, digits and hyphens.'
        )
        .refine((key) => !takenKeys.includes(key), 'This key is already used.'),
      name: z.string().trim().min(1, 'Name is required.'),
      join_policy: joinPolicySchema,
      org_mode: orgModeSchema,
      origins: z.array(
        z.object({
          value: z
            .string()
            .trim()
            .refine(
              isHttpsOrigin,
              'Enter an https:// origin without a path, e.g. https://app.mmlabs.online.'
            ),
        })
      ),
    })
    .superRefine(({ origins }, ctx) => {
      const seen = new Set<string>()
      origins.forEach(({ value }, index) => {
        const v = value.trim()
        if (seen.has(v)) {
          ctx.addIssue({
            code: 'custom',
            message: 'This origin is already listed.',
            path: ['origins', index, 'value'],
          })
        }
        seen.add(v)
      })
    })
}

type AppForm = z.infer<ReturnType<typeof buildAppFormSchema>>

type AppFormDialogProps = {
  currentRow?: App
  open: boolean
  onOpenChange: (open: boolean) => void
}

// admin:apps:write (planned name)
export function AppFormDialog({
  currentRow,
  open,
  onOpenChange,
}: AppFormDialogProps) {
  const isEdit = !!currentRow
  const { apps } = useAccessData()
  const schema = useMemo(
    () => buildAppFormSchema(isEdit ? [] : apps.map((a) => a.key)),
    [apps, isEdit]
  )

  const form = useForm<AppForm>({
    resolver: zodResolver(schema),
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

  const onSubmit = (values: AppForm) => {
    const input = {
      name: values.name,
      join_policy: values.join_policy,
      org_mode: values.org_mode,
      origins: values.origins.map((o) => o.value),
    }
    if (currentRow) {
      updateApp(currentRow.id, input)
      toast.success(`App ${currentRow.key} updated.`)
    } else {
      createApp({ ...input, key: values.key })
      toast.success(`App ${values.key} registered.`)
    }
    form.reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset()
        onOpenChange(state)
      }}
    >
      <DialogContent className='sm:max-w-lg'>
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
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4'
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
                        disabled={isEdit}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Lowercase, used as the permission prefix and X-MM-App
                      value.
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <fieldset className='space-y-2'>
                <legend className='text-sm font-medium'>Origins</legend>
                <p className='text-sm text-muted-foreground'>
                  Browser origins allowed to call the API for this app (CORS).
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
                                <X className='size-4' />
                              </Button>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </li>
                  ))}
                </ul>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => origins.append({ value: 'https://' })}
                >
                  <Plus className='size-4' />
                  Add origin
                </Button>
              </fieldset>
            </form>
          </Form>
        </div>
        <DialogFooter>
          <Button type='submit' form='app-form'>
            {isEdit ? 'Save changes' : 'Register app'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
