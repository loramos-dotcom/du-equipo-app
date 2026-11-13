import { useEffect, useState } from 'react'
import { Edit3, Save, ShieldCheck, Trash2, X } from 'lucide-react'
import { areas } from '../../data/demo'
import { institutionalEmailHint, isBueEmail, normalizeEmail } from '../../lib/institutionalAccess'
import { deleteAccessGrant, fetchAccessGrants, saveAccessGrant, type AccessGrant } from './api'
import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog'

interface AccessManagerProps {
  onClose: () => void
  onNotice: (type: 'success' | 'error', text: string) => void
}

const emptyDraft = () => ({ email: '', displayName: '', areaKeys: [] as string[], canEditDashboard: false })

export function AccessManager({ onClose, onNotice }: AccessManagerProps) {
  const [grants, setGrants] = useState<AccessGrant[]>([])
  const [draft, setDraft] = useState(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [grantPendingDeletion, setGrantPendingDeletion] = useState<AccessGrant | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setGrants(await fetchAccessGrants())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los accesos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const toggleArea = (areaKey: string) => setDraft((current) => ({
    ...current,
    areaKeys: current.areaKeys.includes(areaKey)
      ? current.areaKeys.filter((key) => key !== areaKey)
      : [...current.areaKeys, areaKey],
  }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    const email = normalizeEmail(draft.email)
    if (!isBueEmail(email)) {
      setError(`Solo se pueden asignar permisos a cuentas ${institutionalEmailHint}.`)
      return
    }
    setSaving(true)
    try {
      await saveAccessGrant({ ...draft, email })
      await load()
      setDraft(emptyDraft())
      onNotice('success', 'Los permisos se guardaron y se aplicarán también al próximo inicio de sesión.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudieron guardar los permisos.')
    } finally {
      setSaving(false)
    }
  }

  const edit = (grant: AccessGrant) => setDraft({ email: grant.email, displayName: grant.displayName, areaKeys: grant.areaKeys, canEditDashboard: grant.canEditDashboard })
  const remove = async (grant: AccessGrant) => {
    try {
      await deleteAccessGrant(grant.email)
      await load()
      setGrantPendingDeletion(null)
      onNotice('success', 'El acceso de edición fue eliminado.')
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'No se pudo eliminar el acceso.')
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="compact-editor access-dialog" role="dialog" aria-modal="true" aria-labelledby="access-dialog-title">
        <header><div><small>Administración general</small><h2 id="access-dialog-title">Gestionar edición por área</h2></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}><X size={17} /></button></header>
        <form className="access-form" onSubmit={submit}>
          <div className="access-identity"><label>Mail<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: normalizeEmail(event.target.value) })} placeholder="usuario@bue.edu.ar" required /></label><label>Nombre<input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></label></div>
          <fieldset><legend>Áreas habilitadas para editar</legend><div className="access-area-grid">{areas.map((area) => <label key={area.key}><input type="checkbox" checked={draft.areaKeys.includes(area.key)} onChange={() => toggleArea(area.key)} /><span><b>{area.number}</b>{area.name}</span></label>)}</div></fieldset>
          <label className="dashboard-access"><input type="checkbox" checked={draft.canEditDashboard} onChange={(event) => setDraft({ ...draft, canEditDashboard: event.target.checked })} /><ShieldCheck size={17} /><span><strong>Tablero de Gestión</strong><small>Permitir edición, favoritos, orden y creación desde la vista consolidada.</small></span></label>
          <button className="primary-button access-save" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Guardando...' : 'Aplicar permisos'}</button>
        </form>
        <div className="access-list">
          <h3>Accesos cargados</h3>
          {loading && <p>Cargando accesos...</p>}
          {error && <p className="editor-error">{error}</p>}
          {!loading && !error && grants.map((grant) => <article key={grant.email}><div><strong>{grant.displayName || grant.email}</strong><small>{grant.email}</small><p>{[grant.canEditDashboard ? 'Tablero de Gestión' : '', ...areas.filter((area) => grant.areaKeys.includes(area.key)).map((area) => `${area.number}. ${area.name}`)].filter(Boolean).join(' · ') || 'Sin permisos de edición'}</p></div><button type="button" title="Editar acceso" onClick={() => edit(grant)}><Edit3 size={14} /></button><button className="danger" type="button" title="Eliminar acceso" onClick={() => setGrantPendingDeletion(grant)}><Trash2 size={14} /></button></article>)}
        </div>
        <footer><button className="secondary-button" type="button" onClick={onClose}>Cerrar</button></footer>
      </section>
      {grantPendingDeletion && <ConfirmDeleteDialog title="Quitar acceso" description={`Vas a quitar todos los permisos de edición de ${grantPendingDeletion.email}. Esta acción no se puede deshacer.`} onCancel={() => setGrantPendingDeletion(null)} onConfirm={() => { void remove(grantPendingDeletion) }} />}
    </div>
  )
}
