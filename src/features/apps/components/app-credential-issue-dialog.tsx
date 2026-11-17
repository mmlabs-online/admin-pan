import { useEffect, useRef, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ForbiddenPanel } from '@/components/forbidden-panel'
import { useIssueCredentialMutation } from '../api/queries'
import { type App, type AppCredential } from '../data/app-schema'
import {
  credentialIssueError,
  isUnknownOutcome,
  type AppAlert,
} from '../data/errors'
import { useApps } from './apps-provider'

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

  const onIssue = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setAlert(null)
    try {
      const meta = await issue.mutateAsync(setSecret)
      setIssued(meta)
      issue.reset()
    } catch (error) {
      setAlert(credentialIssueError(error))
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
                Credential {issued.key_id} for {app.name} ({app.key}).
              </DialogDescription>
            </DialogHeader>
            <p role='status' aria-live='polite' className='text-sm'>
              Credential {issued.key_id} issued. Copy it now; you won&apos;t see
              it again.
            </p>
            <Alert>
              <AlertDescription>
                Copy this credential now and store it in your deploy secret
                store. It can&apos;t be shown again. Clipboard history or sync
                tools may keep a copy.
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
                shown once and can&apos;t be retrieved later. An app can have at
                most 2 active credentials. Issuing needs admin:apps:write and
                admin:*.
              </DialogDescription>
            </DialogHeader>
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
                  type='button'
                  aria-disabled={pending || undefined}
                  className={pending ? 'opacity-50' : undefined}
                  onClick={() => void onIssue()}
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
