import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { SelectDropdown } from '@/components/select-dropdown'
import {
  appKeys,
  reportFormats,
  reportSchedules,
  reportTypes,
} from '../data/data'
import {
  ALL_APPS,
  type Report,
  type ReportFormValues,
  reportFormSchema,
} from '../data/schema'

type ReportsActionDialogProps = {
  currentRow?: Report
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: ReportFormValues) => void
}

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10)

function defaultValues(currentRow?: Report): ReportFormValues {
  if (currentRow) {
    return {
      name: currentRow.name,
      type: currentRow.type,
      app_key: currentRow.params.app_key ?? ALL_APPS,
      date_from: currentRow.params.date_from,
      date_to: currentRow.params.date_to,
      format: currentRow.format,
      schedule: currentRow.schedule,
    }
  }
  const today = new Date()
  const monthAgo = new Date(today)
  monthAgo.setDate(today.getDate() - 30)
  return {
    name: '',
    type: 'user_signups',
    app_key: ALL_APPS,
    date_from: toIsoDate(monthAgo),
    date_to: toIsoDate(today),
    format: 'csv',
    schedule: 'none',
  }
}

const appOptions = [
  { label: 'All apps', value: ALL_APPS },
  ...appKeys.map((key) => ({ label: key, value: key })),
]

// admin:reports:write (planned name)
export function ReportsActionDialog({
  currentRow,
  open,
  onOpenChange,
  onSubmit,
}: ReportsActionDialogProps) {
  const isEdit = !!currentRow
  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: defaultValues(currentRow),
  })

  const handleSubmit = (values: ReportFormValues) => {
    onSubmit(values)
    form.reset(defaultValues(currentRow))
    onOpenChange(false)
  }

  const fieldClass = 'grid grid-cols-6 items-center gap-x-4 gap-y-1 space-y-0'
  const labelClass = 'col-span-6 sm:col-span-2 sm:text-end'
  const controlClass = 'col-span-6 sm:col-span-4'
  const messageClass = 'col-span-6 sm:col-span-4 sm:col-start-3'

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset(defaultValues(currentRow))
        onOpenChange(state)
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader className='text-start'>
          <DialogTitle>{isEdit ? 'Edit report' : 'New report'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the report definition. '
              : 'Define a report to run on demand or on a schedule. '}
            Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id='report-form'
            onSubmit={form.handleSubmit(handleSubmit)}
            className='space-y-4 px-0.5'
            noValidate
          >
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem className={fieldClass}>
                  <FormLabel className={labelClass}>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Weekly sign-ups'
                      className={controlClass}
                      autoComplete='off'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className={messageClass} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='type'
              render={({ field }) => (
                <FormItem className={fieldClass}>
                  <FormLabel className={labelClass}>Type</FormLabel>
                  <SelectDropdown
                    isControlled
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                    className={controlClass}
                    items={reportTypes}
                  />
                  <FormMessage className={messageClass} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='app_key'
              render={({ field }) => (
                <FormItem className={fieldClass}>
                  <FormLabel className={labelClass}>App</FormLabel>
                  <SelectDropdown
                    isControlled
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                    className={controlClass}
                    items={appOptions}
                  />
                  <FormMessage className={messageClass} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='date_from'
              render={({ field }) => (
                <FormItem className={fieldClass}>
                  <FormLabel className={labelClass}>From</FormLabel>
                  <FormControl>
                    <Input type='date' className={controlClass} {...field} />
                  </FormControl>
                  <FormMessage className={messageClass} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='date_to'
              render={({ field }) => (
                <FormItem className={fieldClass}>
                  <FormLabel className={labelClass}>To</FormLabel>
                  <FormControl>
                    <Input type='date' className={controlClass} {...field} />
                  </FormControl>
                  <FormMessage className={messageClass} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='format'
              render={({ field }) => (
                <FormItem className={fieldClass}>
                  <FormLabel className={labelClass}>Format</FormLabel>
                  <SelectDropdown
                    isControlled
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                    className={controlClass}
                    items={reportFormats}
                  />
                  <FormMessage className={messageClass} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='schedule'
              render={({ field }) => (
                <FormItem className={fieldClass}>
                  <FormLabel className={labelClass}>Schedule</FormLabel>
                  <SelectDropdown
                    isControlled
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                    className={controlClass}
                    items={reportSchedules}
                  />
                  <FormMessage className={messageClass} />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button type='submit' form='report-form'>
            Save report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
