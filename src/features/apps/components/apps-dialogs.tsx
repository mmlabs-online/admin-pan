import { useAccessData } from '../data/access-store'
import { AppDetailSheet } from './app-detail-sheet'
import { AppFormDialog } from './app-form-dialog'
import { AppStatusDialog } from './app-status-dialog'
import { useApps } from './apps-provider'

export function AppsDialogs() {
  const { open, setOpen, currentId, setCurrentId } = useApps()
  const { apps } = useAccessData()
  const currentRow = apps.find((a) => a.id === currentId)

  const close = (type: 'edit' | 'status' | 'view') => () => {
    setOpen(type)
    setTimeout(() => setCurrentId(null), 500)
  }

  return (
    <>
      <AppFormDialog
        key='app-create'
        open={open === 'create'}
        onOpenChange={() => setOpen('create')}
      />
      {currentRow && (
        <>
          <AppFormDialog
            key={`app-edit-${currentRow.id}`}
            open={open === 'edit'}
            onOpenChange={close('edit')}
            currentRow={currentRow}
          />
          <AppStatusDialog
            key={`app-status-${currentRow.id}`}
            open={open === 'status'}
            onOpenChange={close('status')}
            currentRow={currentRow}
          />
          <AppDetailSheet
            key={`app-view-${currentRow.id}`}
            open={open === 'view'}
            onOpenChange={close('view')}
            app={currentRow}
          />
        </>
      )}
    </>
  )
}
