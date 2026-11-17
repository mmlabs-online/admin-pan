import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { Textarea } from '@/components/ui/textarea'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import {
  useCreateOrganizationMutation,
  useUpdateOrganizationMutation,
} from '../api/queries'
import {
  organizationFormError,
  type OrganizationFormError,
} from '../data/errors'
import {
  type Organization,
  type OrganizationForm,
  organizationFormSchema,
} from '../data/schema'
import { useOrganizations } from './organizations-provider'

type OrganizationsActionDialogProps = {
  currentRow?: Organization
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Create: POST /api/v1/organizations; edit: PATCH /api/v1/organizations/{org_id}.
// Both need admin:organizations:write. Never optimistic (R9).
export function OrganizationsActionDialog({
  currentRow,
  open,
  onOpenChange,
}: OrganizationsActionDialogProps) {
  const isEdit = !!currentRow
  const { api } = useOrganizations()
  const create = useCreateOrganizationMutation(api)
  const update = useUpdateOrganizationMutation(api)
  const mutation = isEdit ? update : create
  const pending = mutation.isPending
  const [alert, setAlert] = useState<OrganizationFormError['alert']>(null)

  const form = useForm<OrganizationForm>({
    resolver: zodResolver(organizationFormSchema),
    defaultValues: {
      slug: currentRow?.slug ?? '',
      name: currentRow?.name ?? '',
      description: currentRow?.description ?? '',
    },
  })

  const reset = () => {
    form.reset()
    create.reset()
    update.reset()
    setAlert(null)
  }

  const onSubmit = async (values: OrganizationForm) => {
    if (pending) return
    setAlert(null)
    const description = values.description === '' ? null : values.description
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: currentRow.id,
          body: { name: values.name, description },
        })
      } else {
        await create.mutateAsync({
          slug: values.slug,
          name: values.name,
          description,
        })
      }
    } catch (error) {
      const mapped = organizationFormError(error, isEdit ? 'edit' : 'create')
      const [first, ...rest] = Object.entries(mapped.fields) as [
        'slug' | 'name' | 'description',
        string,
      ][]
      if (first)
        form.setError(first[0], { message: first[1] }, { shouldFocus: true })
      for (const [field, message] of rest) form.setError(field, { message })
      setAlert(mapped.alert)
      return
    }
    toast.success(
      `Organization "${values.name}" ${isEdit ? 'updated' : 'created'}.`
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
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader className='text-start'>
          <DialogTitle>
            {isEdit ? 'Edit organization' : 'New organization'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the organization details.'
              : 'Create a customer organization.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id='organization-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='space-y-4'
            noValidate
          >
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Acme Inc.'
                      autoComplete='off'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='slug'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='acme-inc'
                      autoComplete='off'
                      readOnly={isEdit}
                      aria-readonly={isEdit || undefined}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {isEdit
                      ? 'The slug cannot be changed.'
                      : 'Lowercase letters, digits and hyphens; starts and ends with a letter or digit. Must be unique.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea className='resize-none' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
          {pending ? (isEdit ? 'Saving…' : 'Creating…') : ''}
        </p>
        <DialogFooter>
          <Button
            type='submit'
            form='organization-form'
            aria-disabled={pending || undefined}
            className={pending ? 'opacity-50' : undefined}
          >
            {pending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create organization'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
