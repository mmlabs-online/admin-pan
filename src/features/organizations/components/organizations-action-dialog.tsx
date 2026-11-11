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
import { SlugConflictError } from '../data/errors'
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

// Create: admin:orgs:write (planned name) — POST /api/v1/organizations
// Edit:   admin:orgs:write (planned name) — PATCH /api/v1/organizations/{id}
export function OrganizationsActionDialog({
  currentRow,
  open,
  onOpenChange,
}: OrganizationsActionDialogProps) {
  const isEdit = !!currentRow
  const { createOrganization, updateOrganization } = useOrganizations()

  const form = useForm<OrganizationForm>({
    resolver: zodResolver(organizationFormSchema),
    defaultValues: {
      slug: currentRow?.slug ?? '',
      name: currentRow?.name ?? '',
      description: currentRow?.description ?? '',
    },
  })

  const onSubmit = (values: OrganizationForm) => {
    const description = values.description === '' ? null : values.description
    if (isEdit) {
      updateOrganization(currentRow.id, { name: values.name, description })
      toast.success(`Organization "${values.name}" updated.`)
    } else {
      try {
        createOrganization({
          slug: values.slug,
          name: values.name,
          description,
        })
      } catch (error) {
        if (error instanceof SlugConflictError) {
          form.setError(
            'slug',
            { message: error.message },
            { shouldFocus: true }
          )
          return
        }
        throw error
      }
      toast.success(`Organization "${values.name}" created.`)
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
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {isEdit
                      ? 'The slug cannot be changed.'
                      : 'Lowercase letters, digits and hyphens. Must be unique.'}
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
        <DialogFooter>
          <Button type='submit' form='organization-form'>
            {isEdit ? 'Save changes' : 'Create organization'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
