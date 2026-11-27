import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { SelectDropdown } from '@/components/select-dropdown'
import { useIssueCredentialMutation } from '../api/queries'
import {
  ADMIN_APP_KEY,
  APP_CREDENTIAL_SCOPES,
  type App,
  type AppCredential,
  type AppCredentialScope,
} from '../data/app-schema'
import {
  CREDENTIAL_LIMIT_NOTE,
  credentialScopeHints,
  credentialScopeOptions,
  isRuntimeScope,
} from '../data/data'
import {
  credentialIssueError,
  isUnknownOutcome,
  type AppAlert,
} from '../data/errors'
import { useApps } from './apps-provider'

// The scope stays in form state only: not in the URL, a toast or a query key.
const scopeFormSchema = z.object({
  scope: z.enum(APP_CREDENTIAL_SCOPES, { error: 'Select a scope.' }),
})
type ScopeForm = z.infer<typeof scopeFormSchema>

type AppCredentialIssueDialogProps = {
  app: App
  onOpenChange: (open: boolean) => void
  /** Radix returns focus only to a `Trigger`; the opener returns it by hand. */
  returnFocus: () => void
}

// POST /api/v1/apps/{key}/credentials — admin:apps:write + admin:* (API-only
// check). The tab mounts this only while open; unmounting drops every piece of
// state. The secret lives ONLY in `secret` below (ADR 0007).
export function AppCredentialIssueDialog({
  app,
  onOpenChange,
  returnFocus,
}: AppCredentialIssueDialogProps) {
  const { api } = useApps()
  const issue = useIssueCredentialMutation(app.key, api)
  const pending = issue.isPending
  const inFlight = useRef(false)
  const copyButton = useRef<HTMLButtonElement>(null)
  const [issued, setIssued] = useState<AppCredential | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle')
  const [alert, setAlert] = useState<AppAlert | null>(null)
  const [unknown, setUnknown] = useState(false)
  const revealing = issued !== null
  const form = useForm<ScopeForm>({
    resolver: zodResolver(scopeFormSchema),
    defaultValues: { scope: undefined },
  })
  const chosen: AppCredentialScope | undefined = useWatch({
    control: form.control,
    name: 'scope',
  })

  // Clear the value when the page is hidden (bfcache) and on unmount.
  useEffect(() => {
    const clear = () => setSecret(null)
    window.addEventListener('pagehide', clear)
    return () => {
      window.removeEventListener('pagehide', clear)
      clear()
    }
  }, [])

  useEffect(() => {
    if (revealing) copyButton.current?.focus()
  }, [revealing])

  const onIssue = async (scope: AppCredentialScope) => {
    if (inFlight.current) return
    inFlight.current = true
    setAlert(null)
    try {
      const meta = await issue.mutateAsync({ scope, onSecret: setSecret })
      setIssued(meta)
      issue.reset()
    } catch (error) {
      setAlert(credentialIssueError(error, scope))
      if (isUnknownOutcome(error)) setUnknown(true)
    } finally {
      inFlight.current = false
    }
  }

  const copySecret = async () => {
    if (secret === null) return
    try {
      await navigator.clipboard.writeText(secret)
      setCopy('done')
    } catch {
      setCopy('failed')
    }
  }

  const close = () => {
    setSecret(null)
    onOpenChange(false)
  }

  const locked = pending || revealing

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !locked) close()
      }}
    >
      <DialogContent
        className='sm:max-w-lg'
        showCloseButton={!locked}
        onEscapeKeyDown={(e) => locked && e.preventDefault()}
        onInteractOutside={(e) => locked && e.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus()
        }}
      >
        {issued ? (
          <>
            <DialogHeader className='text-start'>
              <DialogTitle>Credential issued</DialogTitle>
              <DialogDescription>
                Credential {issued.key_id} ({issued.scope}) for {app.name} (
                {app.key}).
              </DialogDescription>
            </DialogHeader>
            <p role='status' aria-live='polite' className='text-sm'>
              Credential {issued.key_id} issued. Copy it now; you won&apos;t see
              it again.
            </p>
            <Alert>
              <AlertDescription>
                {isRuntimeScope(issued.scope)
                  ? "Copy this credential now and store it only in the backend's deploy environment, never in CI variables or browser code."
                  : 'Copy this credential now and store it in your deploy secret store.'}{' '}
                It can&apos;t be shown again. Clipboard history or sync tools
                may keep a copy.
              </AlertDescription>
            </Alert>
            {secret === null ? (
              <p role='status' className='text-sm'>
                This value was cleared. Revoke {issued.key_id} if you
                didn&apos;t store it.
              </p>
            ) : (
              <div className='space-y-2'>
                <Label htmlFor='issued-credential'>Credential</Label>
                <div className='flex gap-2'>
                  <Input
                    id='issued-credential'
                    readOnly
                    autoComplete='off'
                    autoCorrect='off'
                    autoCapitalize='off'
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore='true'
                    data-form-type='other'
                    className='font-mono'
                    value={shown ? secret : `mmak_${issued.key_id}_••••••••`}
                  />
                  <Button
                    type='button'
                    variant='outline'
                    aria-pressed={shown}
                    onClick={() => setShown((s) => !s)}
                  >
                    {shown ? (
                      <EyeOff className='size-4' aria-hidden='true' />
                    ) : (
                      <Eye className='size-4' aria-hidden='true' />
                    )}
                    {shown ? 'Hide' : 'Show'}
                  </Button>
                  <Button
                    ref={copyButton}
                    type='button'
                    variant='outline'
                    onClick={() => void copySecret()}
                  >
                    Copy
                  </Button>
                </div>
                <p role='status' aria-live='polite' className='text-sm'>
                  {copy === 'done'
                    ? 'Copied to the clipboard.'
                    : copy === 'failed'
                      ? "Couldn't copy. Select Show, then select the value and copy it by hand."
                      : ''}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button type='button' onClick={close}>
                I&apos;ve saved it
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className='text-start'>
              <DialogTitle>Issue credential</DialogTitle>
              <DialogDescription>
                Issue a new credential for {app.name} ({app.key})? The value is
                shown once and can&apos;t be retrieved later.{' '}
                {CREDENTIAL_LIMIT_NOTE} Issuing needs admin:apps:write and
                admin:*.
                {app.key === ADMIN_APP_KEY &&
                  ' A releases credential for the admin app is a CI secret for the control plane itself.'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                id='credential-issue-form'
                noValidate
                onSubmit={(e) =>
                  void form.handleSubmit((values) => onIssue(values.scope))(e)
                }
              >
                <FormField
                  control={form.control}
                  name='scope'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scope</FormLabel>
                      <SelectDropdown
                        isControlled
                        defaultValue={field.value ?? ''}
                        onValueChange={field.onChange}
                        placeholder='Select a scope'
                        items={credentialScopeOptions(app.key).map((value) => ({
                          label: value,
                          value,
                        }))}
                        className='w-full'
                      />
                      <FormDescription>
                        {chosen
                          ? credentialScopeHints[chosen]
                          : 'Choose what this credential may do.'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
            {chosen && isRuntimeScope(chosen) && (
              <Alert>
                <AlertDescription>
                  Backend deploy environment only, never CI or browser code.{' '}
                  {chosen === 'org-members:read'
                    ? `This key can read data of every org of ${app.name}.`
                    : `This key can read or report usage for ${app.name}.`}
                </AlertDescription>
              </Alert>
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
              {pending ? 'Issuing…' : ''}
            </p>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                aria-disabled={pending || undefined}
                onClick={() => {
                  if (!pending) close()
                }}
              >
                {unknown ? 'Close' : 'Cancel'}
              </Button>
              {!unknown && (
                <Button
                  type='submit'
                  form='credential-issue-form'
                  aria-disabled={pending || undefined}
                  className={pending ? 'opacity-50' : undefined}
                  onClick={(e) => {
                    if (pending) e.preventDefault()
                  }}
                >
                  {pending ? 'Issuing…' : 'Issue credential'}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
