import { AlertTriangle } from 'lucide-react'

interface ConfirmDeleteDialogProps {
  title: string
  description: string
  confirmLabel?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDeleteDialog({
  title,
  description,
  confirmLabel = 'Eliminar',
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="resolution-dialog confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title" aria-describedby="confirm-delete-description">
        <header><div><span><AlertTriangle size={15} /> Confirmar eliminación</span><h2 id="confirm-delete-title">{title}</h2></div></header>
        <p id="confirm-delete-description">{description}</p>
        <footer>
          <button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button className="danger-button" type="button" disabled={busy} onClick={onConfirm}>{busy ? 'Eliminando...' : confirmLabel}</button>
        </footer>
      </section>
    </div>
  )
}
