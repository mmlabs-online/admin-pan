import { useId } from 'react'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  disabled?: boolean
  desc: React.JSX.Element | string
  cancelBtnText?: string
  confirmText?: React.ReactNode
  destructive?: boolean
  isLoading?: boolean
  /** Confirm label and sr-only status while `isLoading`. */
  pendingText?: React.ReactNode
  /** Failure markup shown after `children`; linked to the confirm button. */
  error?: React.ReactNode
  className?: string
  children?: React.ReactNode
} & (
  | { form: string; handleConfirm?: undefined }
  | { form?: undefined; handleConfirm: () => void }
)

export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    title,
    desc,
    children,
    className,
    confirmText,
    cancelBtnText,
    destructive,
    isLoading,
    pendingText,
    error,
    disabled = false,
    form,
    handleConfirm,
    onOpenChange,
    ...actions
  } = props
  const errorId = useId()
  return (
    <AlertDialog
      {...actions}
      onOpenChange={(next) => {
        // Escape while pending must not close the dialog.
        if (!next && isLoading) return
        onOpenChange(next)
      }}
    >
      <AlertDialogContent className={cn(className && className)}>
        <AlertDialogHeader className='text-start'>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{desc}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error && <div id={errorId}>{error}</div>}
        <p role='status' aria-live='polite' className='sr-only'>
          {isLoading ? (pendingText ?? 'Please wait…') : ''}
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel
            aria-disabled={isLoading || undefined}
            className={cn(isLoading && 'opacity-50')}
            onClick={(e) => {
              if (isLoading) e.preventDefault()
            }}
          >
            {cancelBtnText ?? 'Cancel'}
          </AlertDialogCancel>
          <Button
            type={form ? 'submit' : 'button'}
            form={form}
            onClick={(e) => {
              if (isLoading) {
                e.preventDefault()
                return
              }
              handleConfirm?.()
            }}
            variant={destructive ? 'destructive' : 'default'}
            disabled={disabled}
            aria-disabled={isLoading || undefined}
            className={cn(isLoading && 'opacity-50')}
            aria-describedby={error ? errorId : undefined}
          >
            {isLoading
              ? (pendingText ?? confirmText ?? 'Continue')
              : (confirmText ?? 'Continue')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
