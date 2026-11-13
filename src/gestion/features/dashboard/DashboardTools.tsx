import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUpRight,
  ArrowUp,
  Check,
  CheckSquare,
  ExternalLink,
  FileText,
  GripVertical,
  Save,
  Square,
  X,
} from 'lucide-react'
import type { Project } from '../../domain/types'
import { getDisplayStatus } from '../../domain/displayStatus'
import { saveDashboardOrder } from '../portfolio/api'
import {
  GOOGLE_REPORT_WEB_APP_URL,
  generateGoogleDocReport,
  type GoogleReportScriptPayload,
} from './api'

function flattenProjects(projects: Project[]): Project[] {
  return projects.flatMap((project) => [project, ...flattenProjects(project.children)])
}

function reportStatusLabel(status: Project['status']) {
  if (status === 'alert') return 'Alerta/Bloqueo'
  if (status === 'pending') return 'Pendiente'
  if (status === 'finished') return 'Finalizado'
  return 'En curso'
}

function projectStatusLabel(project: Project) {
  return reportStatusLabel(getDisplayStatus(project))
}

function submitGoogleReportForm(payload: GoogleReportScriptPayload, target: string, accountEmail: string) {
  const form = document.createElement('form')
  form.method = 'POST'
  const reportUrl = new URL(GOOGLE_REPORT_WEB_APP_URL)
  reportUrl.searchParams.set('authuser', accountEmail)
  form.action = reportUrl.toString()
  form.target = target
  form.acceptCharset = 'UTF-8'
  form.hidden = true
  const field = document.createElement('input')
  field.type = 'hidden'
  field.name = 'payload'
  field.value = JSON.stringify(payload)
  form.appendChild(field)
  document.body.appendChild(form)
  form.submit()
  form.remove()
}

interface ExecutiveSummaryProps {
  projects: Project[]
}

function MechiVisual({ value }: { value?: boolean }) {
  if (value === undefined) return <span className="mechi-value is-empty" aria-label="Mechi sin definir">-</span>
  return (
    <span className={`mechi-value ${value ? 'is-ok' : 'is-no'}`} aria-label={`Mechi: ${value ? 'tick' : 'cruz'}`}>
      {value ? <Check size={14} /> : <X size={14} />}
    </span>
  )
}

function focusProject(projectId: string) {
  const target = document.getElementById(`project-card-${projectId}`)
  if (!target) return
  const topbarOffset = 84
  const targetTop = target.getBoundingClientRect().top + window.scrollY - topbarOffset
  window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
  if (target instanceof HTMLElement) target.focus({ preventScroll: true })
  target.classList.add('is-scroll-target')
  window.setTimeout(() => target.classList.remove('is-scroll-target'), 2000)
}

export function ExecutiveSummary({ projects }: ExecutiveSummaryProps) {
  if (!projects.length) return null
  const statusCounts = projects.reduce<Record<Project['status'], number>>((counts, project) => {
    counts[getDisplayStatus(project)] += 1
    return counts
  }, { active: 0, pending: 0, alert: 0, finished: 0 })

  return (
    <section className="executive-summary">
      <header><div><span>Lectura rápida</span><h2>Resumen ejecutivo</h2></div><small>{projects.length} {projects.length === 1 ? 'registro priorizado' : 'registros priorizados'}</small></header>
      <div className="executive-pulse" aria-label="Estado de los proyectos priorizados">
        <article className="executive-stat tone-total"><span>Prioridades</span><strong>{projects.length}</strong></article>
        <article className="executive-stat tone-alert"><span>Alertas</span><strong>{statusCounts.alert}</strong></article>
        <article className="executive-stat tone-pending"><span>Pendientes</span><strong>{statusCounts.pending}</strong></article>
        <article className="executive-stat tone-active"><span>En curso</span><strong>{statusCounts.active}</strong></article>
      </div>
      <div className="executive-table" role="list" aria-label="Proyectos priorizados">
        <div className="executive-head" aria-hidden="true">
          <span />
          <span>Proyecto</span>
          <span>Presupuesto</span>
          <span className="executive-head-mechi">Mechi</span>
          <span />
          <span>Status</span>
          <span />
        </div>
        {projects.map((project, index) => {
          const displayStatus = getDisplayStatus(project)
          return (
          <button
            className={`executive-row status-${displayStatus} is-linkable`}
            type="button"
            role="listitem"
            key={project.id}
            aria-label={`Ir a ${project.name}`}
            onClick={() => focusProject(project.id)}
          >
            <span className="executive-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="executive-project"><strong>{project.name}</strong><small>{project.areaName}</small></span>
            <span className={`executive-budget ${project.budget ? '' : 'is-empty'}`}>{project.budget || 'Sin presupuesto'}</span>
            <span className={`executive-mechi ${project.mechi === undefined ? 'is-empty' : project.mechi ? 'is-ok' : 'is-no'}`}><MechiVisual value={project.mechi} /></span>
            <span className={`executive-status ${displayStatus}`}><i />{projectStatusLabel(project)}</span>
            <ArrowUpRight className="executive-go" size={17} aria-hidden="true" />
          </button>
          )
        })}
      </div>
    </section>
  )
}

interface OrderDialogProps {
  projects: Project[]
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (message: string) => void
}

export function OrderDialog({ projects, onClose, onSaved, onError }: OrderDialogProps) {
  const [ordered, setOrdered] = useState(() => [...projects])
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= ordered.length) return
    setOrdered((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const dropAt = (targetId: string, after: boolean) => {
    if (!draggedId || draggedId === targetId) return
    setOrdered((current) => {
      const next = current.filter((project) => project.id !== draggedId)
      const dragged = current.find((project) => project.id === draggedId)
      const targetIndex = next.findIndex((project) => project.id === targetId)
      if (!dragged || targetIndex < 0) return current
      next.splice(targetIndex + (after ? 1 : 0), 0, dragged)
      return next
    })
    setDraggedId(null)
    setDropTarget(null)
  }

  const favoriteIds = ordered.flatMap((project) => (
    flattenProjects([project])
      .filter((candidate) => candidate.favorite)
      .sort((a, b) => (a.favoriteSortOrder ?? Number.MAX_SAFE_INTEGER) - (b.favoriteSortOrder ?? Number.MAX_SAFE_INTEGER))
      .map((candidate) => candidate.id)
  ))

  const uniqueFavoriteIds = [...new Set(favoriteIds)]

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const bounds = event.currentTarget.getBoundingClientRect()
    setDropTarget({ id: targetId, after: event.clientY >= bounds.top + bounds.height / 2 })
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveDashboardOrder(uniqueFavoriteIds)
      await onSaved()
      onClose()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo guardar el orden.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="compact-editor order-dialog" role="dialog" aria-modal="true" aria-labelledby="order-dialog-title">
        <header><div><small>Tablero de Gestión</small><h2 id="order-dialog-title">Ordenar proyectos</h2></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}><X size={17} /></button></header>
        <p className="dialog-intro">Arrastrá las filas o usá las flechas. El orden queda guardado para todos los usuarios.</p>
        <div className="order-list">
          {ordered.map((project, index) => (
            <div
              className={`order-row ${draggedId === project.id ? 'is-dragging' : ''} ${dropTarget?.id === project.id ? (dropTarget.after ? 'is-drop-after' : 'is-drop-before') : ''}`}
              key={project.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', project.id)
                setDraggedId(project.id)
              }}
              onDragEnd={() => {
                setDraggedId(null)
                setDropTarget(null)
              }}
              onDragOver={(event) => handleDragOver(event, project.id)}
              onDrop={(event) => {
                event.preventDefault()
                const bounds = event.currentTarget.getBoundingClientRect()
                dropAt(project.id, event.clientY >= bounds.top + bounds.height / 2)
              }}
            >
              <GripVertical size={17} /><b>{String(index + 1).padStart(2, '0')}</b><div><strong>{project.name}</strong><small>{project.areaName}</small></div>
              <button type="button" title="Subir" aria-label={`Subir ${project.name}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
              <button type="button" title="Bajar" aria-label={`Bajar ${project.name}`} disabled={index === ordered.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
            </div>
          ))}
        </div>
        <footer><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="button" disabled={saving} onClick={() => { void save() }}><Save size={15} /> {saving ? 'Guardando...' : 'Guardar orden'}</button></footer>
      </section>
    </div>
  )
}

interface ReportBuilderProps {
  projects: Project[]
  initialAreaKey: string
  initialAreaName: string
  accountEmail: string
  canGenerateGoogleDoc: boolean
  onClose: () => void
  onNotice: (type: 'success' | 'error', text: string) => void
}

export function ReportBuilder({ projects, initialAreaKey, initialAreaName, accountEmail, canGenerateGoogleDoc, onClose, onNotice }: ReportBuilderProps) {
  const allProjects = useMemo(() => flattenProjects(projects), [projects])
  const initialSelection = allProjects.filter((project) => initialAreaKey === 'all_projects' ? true : initialAreaKey === 'dashboard' ? project.favorite : project.areaKeys.includes(initialAreaKey)).map((project) => project.id)
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelection))
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState(`Reporte - ${initialAreaName || 'Área'}`)
  const [subtitle, setSubtitle] = useState('')
  const [generating, setGenerating] = useState(false)
  const visible = allProjects.filter((project) => `${project.name} ${project.areaName}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')))
  const selectedProjects = allProjects.filter((project) => selected.has(project.id))

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current)
    const project = allProjects.find((candidate) => candidate.id === id)
    const linkedIds = project?.kind === 'project' ? [project.id, ...project.children.map((child) => child.id)] : [id]
    if (next.has(id)) linkedIds.forEach((linkedId) => next.delete(linkedId))
    else linkedIds.forEach((linkedId) => next.add(linkedId))
    return next
  })

  const createGoogleDoc = async () => {
    if (!selectedProjects.length) return
    const reportTarget = `tablero-google-doc-${Date.now()}`
    const reportWindow = window.open('about:blank', reportTarget)
    if (!reportWindow) {
      onNotice('error', 'El navegador bloqueó la ventana del reporte. Habilitá las ventanas emergentes e intentá nuevamente.')
      return
    }
    reportWindow.document.title = 'Generando reporte'
    reportWindow.document.body.style.fontFamily = 'Arial, sans-serif'
    reportWindow.document.body.style.padding = '24px'
    reportWindow.document.body.textContent = 'Generando Google Doc...'
    setGenerating(true)
    try {
      const { scriptPayload } = await generateGoogleDocReport({
        title,
        subtitle,
        areaName: initialAreaName || 'Tablero de Gestión',
        projectIds: selectedProjects.map((project) => project.id),
      })
      submitGoogleReportForm(scriptPayload, reportTarget, accountEmail)
      onNotice('success', 'Google está generando el documento en la pestaña nueva.')
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo generar el Google Doc.'
      try {
        reportWindow.document.title = 'No se pudo generar el reporte'
        reportWindow.document.body.style.fontFamily = 'Arial, sans-serif'
        reportWindow.document.body.style.padding = '24px'
        reportWindow.document.body.textContent = message
      } catch {
        // El aviso principal conserva el error si la pestaña ya cambió de origen.
      }
      onNotice('error', message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="compact-editor report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-dialog-title">
        <header>
          <div>
            <small>Reportes</small>
            <h2 id="report-dialog-title">Generar reporte en Google Docs</h2>
            <p>Elegí proyectos o subproyectos de cualquiera de las diez áreas. Al seleccionar un proyecto se incluyen sus subproyectos.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}><X size={17} /></button>
        </header>
        <div className="report-controls"><label>Título del reporte<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Buscar<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Proyecto o área" /></label></div>
        <div className="report-controls report-controls-extra">
          <label>Subtítulo opcional<input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} /></label>
        </div>
        <div className="report-selection-toolbar"><span>{selected.size} seleccionados</span><button type="button" onClick={() => setSelected(new Set(visible.map((project) => project.id)))}>Seleccionar visibles</button><button type="button" onClick={() => setSelected(new Set())}>Limpiar</button></div>
        <div className="report-project-list">
          {visible.map((project) => (
            <button className={selected.has(project.id) ? 'is-selected' : ''} type="button" key={project.id} onClick={() => toggle(project.id)}>
              {selected.has(project.id) ? <CheckSquare size={17} /> : <Square size={17} />}<span><strong>{project.name}</strong><small>{project.areaName}{project.kind === 'subproject' ? ' · Subproyecto' : ''}</small></span>
            </button>
          ))}
        </div>
        <footer>
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          {canGenerateGoogleDoc && <button className="secondary-button" type="button" disabled={!selected.size || generating} onClick={() => { void createGoogleDoc() }}><FileText size={15} /> {generating ? 'Generando...' : 'Crear Google Doc'} <ExternalLink size={13} /></button>}
        </footer>
      </section>
    </div>
  )
}
