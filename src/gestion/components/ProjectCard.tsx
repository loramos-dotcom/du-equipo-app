import { useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Banknote,
  Building2,
  CalendarRange,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Edit3,
  ExternalLink,
  Flag,
  FolderTree,
  Gauge,
  History,
  Layers3,
  MapPin,
  MessageSquareText,
  Plus,
  RefreshCw,
  Star,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import type { NextStep, Project, ProjectStatus, ProjectUpdate, SpecialView, ViewMode } from '../domain/types'
import { getDisplayStatus } from '../domain/displayStatus'
import { isNextStepOverdue, isNextStepUndated } from '../domain/projectStatus'
import { externalLinkUrl } from '../domain/externalLink'
import { MapSpecialView, SpecialDataView } from '../features/portfolio/SpecialViewsPanel'
import { isExcludedFromDashboard } from '../features/portfolio/dashboardSpecialViews'
import { ProjectVisualMetrics } from './ProjectVisualMetrics'
import { EducationSystemOverview } from './EducationSystemOverview'
import { getEducationSystemData, isEducationSystemProjectName } from './educationSystemData'
import { isClosureRiskProjectName, ProjectRiskTable, projectRiskTableHasContent } from './ProjectRiskTable'
import { RichText } from './RichText'

const statusLabels: Record<ProjectStatus, string> = {
  active: 'En curso',
  pending: 'Pendiente',
  alert: 'Alerta/Bloqueo',
  finished: 'Finalizado',
}

interface ProjectCardProps {
  project: Project
  mode: ViewMode
  nested?: boolean
  forceExpanded?: boolean
  forceSubprojectsVisible?: boolean
  hideBudgetAndMechi?: boolean
  canToggleFavorite?: boolean
  canToggleFavoriteProject?: (project: Project) => boolean
  canEditProject?: (project: Project) => boolean
  specialViews?: SpecialView[]
  onToggleFavorite: (projectId: string) => void
  onEdit: (project: Project) => void
  onAddSubproject: (project: Project) => void
  onDelete: (project: Project) => void
  onResolveUpdate: (project: Project, update: ProjectUpdate) => void
  onResolveStep: (project: Project, step: NextStep) => void
}

function formatDate(value: string) {
  return value ? value.split('-').reverse().join('/') : ''
}

function isLongText(value: string) {
  return value.trim().length > 220
}

const sectionPreviewLimit = 3
// Business data comes from the authenticated canonical API, never a public bundled snapshot.
const administrativeWorksMapPayload: Record<string,unknown> = {}

function textSizeClass(value: string) {
  const length = value.replace(/\s+/g, ' ').trim().length
  if (length > 220) return 'is-long'
  if (length > 120) return 'is-medium'
  return 'is-short'
}

function truncateText(value: string, maxLength = 190) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trim()}…`
}

function splitUpdateDetail(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  const match = normalized.match(/^(.{3,80}?(?:\?|:))\s*(?:→|->|—|-)\s*(.+)$/)
  if (!match) return { body: normalized }
  return { label: match[1], body: match[2] }
}

function splitGuidedDetail(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  const match = normalized.match(/^(.{3,80}?(?:\?|:))\s*(?:\u2192|->|\u2014|-)\s*(.+)$/)
  if (!match) return splitUpdateDetail(normalized)
  return { label: match[1], body: match[2] }
}

function splitInlineFacts(value: string) {
  const matches = [...value.matchAll(/(?:^|\s)([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ/\s]{2,28}):\s*/g)]
  if (matches.length < 2) return { copy: value, facts: [] }

  const firstFactIndex = matches[0].index || 0
  if (firstFactIndex < 60) return { copy: value, facts: [] }

  const facts = matches.map((match, index) => {
    const start = (match.index || 0) + match[0].length
    const end = index + 1 < matches.length ? matches[index + 1].index || value.length : value.length
    return {
      label: match[1].trim(),
      body: value.slice(start, end).trim().replace(/[.;]$/, ''),
    }
  }).filter((fact) => fact.body)

  return facts.length >= 2
    ? { copy: value.slice(0, firstFactIndex).trim(), facts }
    : { copy: value, facts: [] }
}

function detailHasInlineFacts(value: string) {
  return splitInlineFacts(splitGuidedDetail(value).body).facts.length > 0
}

function hasBulletList(value: string) {
  return /•\s+\S/.test(value)
}

function DetailText({ value, truncateAt }: { value: string; truncateAt?: number }) {
  if (!truncateAt && hasBulletList(value)) return <RichText value={value} />

  const detail = splitGuidedDetail(value)
  const body = truncateAt ? truncateText(detail.body, truncateAt) : detail.body
  const inlineDetail = truncateAt ? { copy: body, facts: [] } : splitInlineFacts(body)

  return (
    <>
      {detail.label && <span className="update-prompt">{detail.label}</span>}
      <span className={inlineDetail.facts.length ? 'detail-inline-copy' : ''}><RichText value={inlineDetail.copy} /></span>
      {inlineDetail.facts.length > 0 && (
        <span className="inline-fact-strip">
          {inlineDetail.facts.map((fact) => (
            <span className="inline-fact" key={`${fact.label}-${fact.body}`}>
              <strong>{fact.label}</strong>
              <span><RichText value={fact.body} /></span>
            </span>
          ))}
        </span>
      )}
    </>
  )
}

function splitFactSegments(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  const chunks = normalized.split(/;\s*|\.\s+(?=[A-ZÁÉÍÓÚÑ][^:.]{2,38}:)/)
  const segments = chunks.map((chunk) => {
    const clean = chunk.trim().replace(/\.$/, '')
    const match = clean.match(/^([^:]{3,38}):\s*(.+)$/)
    if (!match) return { type: 'text' as const, body: clean }
    return { type: 'fact' as const, label: match[1].trim(), body: match[2].trim() }
  }).filter((segment) => segment.body)
  const facts = segments.filter((segment) => segment.type === 'fact')

  return facts.length >= 2 ? segments : []
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
}

function isSinigepProject(project: Project) {
  return normalizeText(project.name).includes('sinigep')
}

function isMapView(view: SpecialView) {
  return view.viewKey.toLocaleLowerCase('es').includes('map') || Array.isArray(view.payload.markers)
}

function isEstadoEdilicioWorksMap(view: SpecialView, project: Project) {
  if (!isMapView(view)) return false
  const projectName = normalizeText(project.name)
  const viewKey = normalizeText(view.viewKey)
  const viewTitle = normalizeText(view.title)
  return (
    projectName.includes('estado edilicio') &&
    project.areaKeys.includes(view.areaKey) &&
    (viewKey.includes('works_map') || viewKey.includes('obras') || viewTitle.includes('mapa de obras'))
  )
}

function fallbackEstadoEdilicioWorksMap(project: Project): SpecialView | undefined {
  if (!project.areaKeys.includes('gestion_administrativa') || !normalizeText(project.name).includes('estado edilicio')) return undefined
  return {
    id: `fallback-administrative-works-map-${project.id}`,
    areaKey: 'gestion_administrativa',
    projectId: project.id,
    viewKey: 'administrative_works_map',
    title: 'Mapa de Obras',
    payload: administrativeWorksMapPayload,
    updatedAt: typeof administrativeWorksMapPayload.exportedAt === 'string' ? administrativeWorksMapPayload.exportedAt : project.updatedAt,
  }
}

function AdaptiveDetailCopy({ value }: { value: string }) {
  if (hasBulletList(value)) return <p><RichText value={value} /></p>

  const segments = splitFactSegments(value)

  if (!segments.length) return <p><RichText value={value} /></p>

  return (
    <div className="detail-fact-list">
      {segments.map((segment, index) => (
        <div className={`detail-fact ${segment.type === 'text' ? 'is-note' : ''}`} key={`${segment.body}-${index}`}>
          {segment.type === 'fact' && <><strong>{segment.label}:</strong>{' '}</>}
          <span><RichText value={segment.body} /></span>
        </div>
      ))}
    </div>
  )
}

function UpdateAttachmentLink({ update }: { update: ProjectUpdate }) {
  const attachmentUrl = externalLinkUrl(update.attachmentUrl)
  if (!attachmentUrl) return null

  return (
    <a className="update-attachment-link" href={attachmentUrl} target="_blank" rel="noreferrer">
      {update.attachmentName || 'Abrir archivo'} <ExternalLink size={13} />
    </a>
  )
}

export function ProjectCard({
  project,
  mode,
  nested = false,
  forceExpanded = false,
  forceSubprojectsVisible = false,
  hideBudgetAndMechi = false,
  canToggleFavorite = true,
  canToggleFavoriteProject,
  canEditProject,
  specialViews = [],
  onToggleFavorite,
  onEdit,
  onAddSubproject,
  onDelete,
  onResolveUpdate,
  onResolveStep,
}: ProjectCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const effectiveMode = mode === 'edit' && (!canEditProject || canEditProject(project)) ? 'edit' : 'view'
  const effectiveCanToggleFavorite = canToggleFavoriteProject ? canToggleFavoriteProject(project) : canToggleFavorite
  const alerts = project.updates.filter((update) => update.type === 'Alerta/Bloqueo' && !update.resolved)
  const pending = project.updates.filter((update) => update.type === 'Pendiente' && !update.resolved)
  const recentUpdates = project.updates.filter((update) => update.type === 'Avance' || update.type === 'Información')
  const baseRelatedSpecialViews = specialViews.filter((view) => !isExcludedFromDashboard(view) && (view.projectId === project.id || isEstadoEdilicioWorksMap(view, project)))
  const fallbackMapView = baseRelatedSpecialViews.some(isMapView) ? undefined : fallbackEstadoEdilicioWorksMap(project)
  const relatedSpecialViews = fallbackMapView ? [...baseRelatedSpecialViews, fallbackMapView] : baseRelatedSpecialViews
  const alertPreviewLimit = isSinigepProject(project) ? 5 : sectionPreviewLimit
  const visibleAlerts = expandedSections.alerts ? alerts : alerts.slice(0, alertPreviewLimit)
  const visiblePending = expandedSections.pending ? pending : pending.slice(0, sectionPreviewLimit)
  const visibleRecentUpdates = expandedSections.updates ? recentUpdates : recentUpdates.slice(0, sectionPreviewLimit)
  const visibleNextSteps = expandedSections.steps ? project.nextSteps : project.nextSteps.slice(0, sectionPreviewLimit)
  const hasRecentUpdates = recentUpdates.length > 0
  const hasNextSteps = project.nextSteps.length > 0
  const detailBlockCount = [project.objective, project.scope, project.justification, project.notes].filter(Boolean).length
  const briefUrl = externalLinkUrl(project.briefUrl)
  const hasLongDetail = [project.objective, project.scope, project.justification, project.notes].some((value) => isLongText(value || ''))
  const hasIssues = Boolean(alerts.length || pending.length)
  const latestUpdate = recentUpdates[0]
  const sinigepMetrics = project.visualMetrics?.type === 'sinigep'
    ? project.visualMetrics
    : isSinigepProject(project) ? { ...project.visualMetrics, type: 'sinigep' } : undefined
  const educationSystemData = isEducationSystemProjectName(project.name) || project.visualMetrics?.educationSystem
    ? getEducationSystemData(project.visualMetrics ?? {})
    : undefined
  const isClosureRiskProject = isClosureRiskProjectName(project.name)
  const hasRiskTable = isClosureRiskProject || projectRiskTableHasContent(project.visualMetrics ?? {})
  const contentWeight = detailBlockCount + alerts.length + pending.length + project.nextSteps.length + recentUpdates.length + project.children.length
  const contentDensity = contentWeight >= 9 ? 'content-rich' : contentWeight >= 5 ? 'content-balanced' : 'content-light'
  const hasDetail = Boolean(
    project.objective || project.scope || project.justification || project.notes || project.briefUrl ||
    alerts.length || pending.length || recentUpdates.length || project.nextSteps.length || relatedSpecialViews.length || project.children.length || hasRiskTable || educationSystemData,
  )
  const hasExpandableContent = Boolean(
    hasDetail || project.owner || project.updatedAt || project.budget || project.mechi !== undefined || project.progress > 0 || project.status,
  )
  const isExpanded = forceExpanded || expanded
  const showSubprojects = isExpanded || forceSubprojectsVisible
  const hasSignalStrip = Boolean(alerts.length || pending.length || project.nextSteps.length || project.children.length || relatedSpecialViews.length || latestUpdate)
  const displayStatus = getDisplayStatus(project)
  const visibleStatusLabel = statusLabels[displayStatus]
  const summaryTone = [
    'has-no-preview',
    project.progress > 0 ? 'has-progress' : 'has-no-progress',
    hasSignalStrip ? 'has-signals' : 'has-no-signals',
    hasExpandableContent ? 'has-detail' : 'has-no-detail',
    contentDensity,
  ].join(' ')
  const toggleSection = (section: string) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }))
  }
  const canExpand = hasExpandableContent && !forceExpanded
  const toggleExpanded = () => {
    if (canExpand) setExpanded((current) => !current)
  }
  const isInteractiveTarget = (target: EventTarget | null) => (
    target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, [role="button"]'))
  )
  const subprojectsSection = showSubprojects && project.children.length > 0 ? (
    <section className={`subprojects-section ${forceSubprojectsVisible ? 'is-print-group' : ''}`}>
      <h4><FolderTree size={15} /> Subproyectos <span>{project.children.length}</span></h4>
      <div className="subproject-list">
        {project.children.map((child) => (
          <ProjectCard
            key={child.id}
            project={child}
            mode={mode}
            nested
            forceExpanded={forceExpanded}
            forceSubprojectsVisible={forceSubprojectsVisible}
            hideBudgetAndMechi={hideBudgetAndMechi}
            canToggleFavorite={canToggleFavorite}
            canToggleFavoriteProject={canToggleFavoriteProject}
            canEditProject={canEditProject}
            specialViews={specialViews}
            onToggleFavorite={onToggleFavorite}
            onEdit={onEdit}
            onAddSubproject={onAddSubproject}
            onDelete={onDelete}
            onResolveUpdate={onResolveUpdate}
            onResolveStep={onResolveStep}
          />
        ))}
      </div>
    </section>
  ) : null

  return (
    <>
    <article
      id={`project-card-${project.id}`}
      className={`project-card status-${displayStatus} ${summaryTone} ${isExpanded ? 'is-expanded' : ''} ${canExpand ? 'is-clickable' : ''} ${nested ? 'is-nested' : ''}`}
      tabIndex={-1}
    >
      <div
        className="project-summary"
        tabIndex={canExpand ? 0 : undefined}
        aria-expanded={canExpand ? isExpanded : undefined}
        onClick={(event) => { if (!isInteractiveTarget(event.target)) toggleExpanded() }}
        onKeyDown={(event) => {
          if (isInteractiveTarget(event.target) || (event.key !== 'Enter' && event.key !== ' ')) return
          event.preventDefault()
          toggleExpanded()
        }}
      >
        <button
          className="expand-button"
          type="button"
          aria-label={isExpanded ? `Contraer ${project.name}` : `Expandir ${project.name}`}
          aria-expanded={isExpanded}
          onClick={toggleExpanded}
          disabled={!canExpand}
        >
          {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        </button>

        <div className="project-main">
          <div className="project-title-row">
            <div>
              <h3>{project.name}</h3>
            </div>
            <span className={`status-badge ${displayStatus}`}><i />{visibleStatusLabel}</span>
          </div>

          <div className="project-info-strip">
            <div className="project-meta">
              {project.owner && project.owner !== 'Sin definir' && <span className="meta-chip meta-owner"><Building2 size={13} /><strong>DG/GO</strong> {project.owner}</span>}
              {project.priority && <span className="meta-chip meta-priority"><Gauge size={13} /><strong>Prioridad</strong> {project.priority}</span>}
              {project.updatedAt && <span className="meta-chip meta-date"><CalendarDays size={13} /> Actualizado {formatDate(project.updatedAt)}</span>}
              {!hideBudgetAndMechi && project.budget && <span className="meta-chip meta-budget"><Banknote size={13} /><strong>Presupuesto</strong> {project.budget}</span>}
              {!hideBudgetAndMechi && project.mechi !== undefined && (
                <span className={`meta-chip meta-mechi ${project.mechi ? 'is-ok' : 'is-no'}`} aria-label={`Mechi: ${project.mechi ? 'tick' : 'cruz'}`}>
                  <span className="mechi-mark" aria-hidden="true">{project.mechi ? <Check size={13} /> : <X size={13} />}</span>
                  <strong>Mechi</strong>
                </span>
              )}
            </div>

            {hasSignalStrip && (
              <div className="project-signal-strip" aria-label="Resumen del proyecto">
                {alerts.length > 0 && <span className="signal-pill signal-alert"><AlertTriangle size={13} /> {alerts.length} alerta{alerts.length === 1 ? '' : 's'}</span>}
                {pending.length > 0 && <span className="signal-pill signal-pending"><Flag size={13} /> {pending.length} pendiente{pending.length === 1 ? '' : 's'}</span>}
                {project.nextSteps.length > 0 && <span className="signal-pill signal-step"><ClipboardCheck size={13} /> Próximos pasos</span>}
                {project.children.length > 0 && <span className="signal-pill signal-child"><FolderTree size={13} /> {project.children.length} subproyecto{project.children.length === 1 ? '' : 's'}</span>}
                {relatedSpecialViews.some(isMapView) && <span className="signal-pill signal-map"><MapPin size={13} /> Mapa de obras</span>}
                {latestUpdate && <span className="signal-latest"><History size={13} /> Último avance: {formatDate(latestUpdate.date)}</span>}
              </div>
            )}
          </div>

          {project.progress > 0 && !isExpanded && (
            <div className="project-snapshot">
              <div className="project-progress-mini" aria-label={`Avance ${project.progress}%`}>
                <span><b style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} /></span>
                <strong>{project.progress}%</strong>
              </div>
            </div>
          )}
        </div>

        {effectiveMode === 'edit' && (
          <div className="project-actions">
            <button
              className={`favorite-button ${project.favorite ? 'is-favorite' : ''} ${effectiveCanToggleFavorite ? '' : 'is-hidden'}`}
              disabled={!effectiveCanToggleFavorite}
              type="button"
              title={project.favorite ? 'Quitar del Tablero de Gestión' : 'Agregar al Tablero de Gestión'}
              aria-label={project.favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              onClick={() => onToggleFavorite(project.id)}
            >
              <Star size={18} fill={project.favorite ? 'currentColor' : 'none'} />
            </button>
            <button className="project-action-button" type="button" title="Editar" aria-label={`Editar ${project.name}`} onClick={() => onEdit(project)}><Edit3 size={16} /></button>
            {project.kind === 'project' && <button className="project-action-button" type="button" title="Agregar subproyecto" aria-label={`Agregar subproyecto a ${project.name}`} onClick={() => onAddSubproject(project)}><Plus size={16} /></button>}
            <button className="project-action-button danger" type="button" title="Eliminar" aria-label={`Eliminar ${project.name}`} onClick={() => onDelete(project)}><Trash2 size={16} /></button>
          </div>
        )}
      </div>

      {sinigepMetrics && <ProjectVisualMetrics metrics={sinigepMetrics} onEdit={effectiveMode === 'edit' ? () => onEdit(project) : undefined} />}

      {isExpanded && hasExpandableContent && (
        <div className="project-detail">
          {educationSystemData && <EducationSystemOverview data={educationSystemData} onEdit={effectiveMode === 'edit' ? () => onEdit(project) : undefined} />}
          {hasIssues && (
            <section className="detail-priority">
              <header><span>Para gestionar</span></header>
              <div className="detail-priority-grid has-single-section">
                <div className="detail-issues-stack">
                    {alerts.length > 0 && (
                      <section className="issue-panel alert-panel">
                        <h4><AlertTriangle size={15} /> Alertas y bloqueos <span>{alerts.length}</span></h4>
                        {visibleAlerts.map((update) => (
                          <article className={`issue-item ${detailHasInlineFacts(update.detail) ? 'has-inline-facts' : ''}`} key={update.id}>
                            <div className="issue-entry-body">
                              <header><time>{formatDate(update.date)}</time><strong>Requiere atención</strong></header>
                              <p className={detailHasInlineFacts(update.detail) ? 'has-inline-facts' : ''}><DetailText value={update.detail} /></p>
                              <UpdateAttachmentLink update={update} />
                            </div>
                            {effectiveMode === 'edit' && <button type="button" onClick={() => onResolveUpdate(project, update)}><Check size={14} /> Solucionar</button>}
                          </article>
                        ))}
                        {alerts.length > alertPreviewLimit && <button className="section-more-button" type="button" onClick={() => toggleSection('alerts')}>{expandedSections.alerts ? 'Ver menos' : `Ver más (${alerts.length - alertPreviewLimit})`}</button>}
                      </section>
                    )}
                    {pending.length > 0 && (
                      <section className="issue-panel pending-panel">
                        <h4><Flag size={15} /> Pendientes <span>{pending.length}</span></h4>
                        {visiblePending.map((update) => (
                          <article className={`issue-item ${detailHasInlineFacts(update.detail) ? 'has-inline-facts' : ''}`} key={update.id}>
                            <div className="issue-entry-body">
                              <header><time>{formatDate(update.date)}</time><strong>Por resolver</strong></header>
                              <p className={detailHasInlineFacts(update.detail) ? 'has-inline-facts' : ''}><DetailText value={update.detail} /></p>
                              <UpdateAttachmentLink update={update} />
                            </div>
                            {effectiveMode === 'edit' && <button type="button" onClick={() => onResolveUpdate(project, update)}><Check size={14} /> Solucionar</button>}
                          </article>
                        ))}
                        {pending.length > sectionPreviewLimit && <button className="section-more-button" type="button" onClick={() => toggleSection('pending')}>{expandedSections.pending ? 'Ver menos' : `Ver más (${pending.length - sectionPreviewLimit})`}</button>}
                      </section>
                    )}
                  </div>
              </div>
            </section>
          )}

          {detailBlockCount > 0 && (
            <section className="detail-context">
              <header><span>Contexto del proyecto</span></header>
              <div className={`detail-context-grid detail-count-${detailBlockCount} ${hasLongDetail ? 'has-long-copy' : ''}`}>
                {project.objective && <div className={`detail-block objective-block ${textSizeClass(project.objective)}`}><span><Target size={14} /> Objetivo</span><AdaptiveDetailCopy value={project.objective} /></div>}
                {project.notes && <div className={`detail-block status-notes-block ${textSizeClass(project.notes)}`}><span><MessageSquareText size={14} /> Status/Notas</span><AdaptiveDetailCopy value={project.notes} /></div>}
                {project.scope && <div className={`detail-block scope-block ${textSizeClass(project.scope)}`}><span><Layers3 size={14} /> Alcance</span><AdaptiveDetailCopy value={project.scope} /></div>}
                {project.justification && <div className={`detail-block justification-block ${textSizeClass(project.justification)}`}><span><CircleHelp size={14} /> Justificación</span><AdaptiveDetailCopy value={project.justification} /></div>}
              </div>
            </section>
          )}
          <ProjectRiskTable metrics={project.visualMetrics ?? {}} showEmpty={isClosureRiskProject} />
          {(project.plannedStart || project.plannedEnd || project.rescheduledStart || project.rescheduledEnd || briefUrl) && (
            <div className="detail-meta-row">
              {(project.plannedStart || project.plannedEnd) && <span><CalendarRange size={14} /><strong>Planificado:</strong> {formatDate(project.plannedStart)}{project.plannedEnd ? ` a ${formatDate(project.plannedEnd)}` : ''}{project.plannedDays ? ` · ${project.plannedDays} días` : ''}</span>}
              {(project.rescheduledStart || project.rescheduledEnd) && <span><RefreshCw size={14} /><strong>Reprogramado:</strong> {formatDate(project.rescheduledStart)}{project.rescheduledEnd ? ` a ${formatDate(project.rescheduledEnd)}` : ''}{project.rescheduledDays ? ` · ${project.rescheduledDays} días` : ''}</span>}
              {briefUrl && <a href={briefUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir Brief/Archivo</a>}
            </div>
          )}

          {hasRecentUpdates && (
            <div className="activity-grid has-single-section">
              {hasRecentUpdates && (
                <section className="activity-section updates-section">
                  <h4><History size={15} /> Últimas actualizaciones</h4>
                  {visibleRecentUpdates.map((update) => {
                    return <article className={`activity-item ${isLongText(update.detail) ? 'is-long' : ''} ${detailHasInlineFacts(update.detail) ? 'has-inline-facts' : ''}`} key={update.id}>
                      <div className="activity-update-body">
                        <header className="activity-item-meta">
                          <time className="activity-date">{formatDate(update.date)}</time>
                          <strong className={`activity-type ${update.type === 'Avance' ? 'is-progress' : 'is-info'}`}>{update.type}</strong>
                        </header>
                        <p className={`activity-copy ${detailHasInlineFacts(update.detail) ? 'has-inline-facts' : ''}`}><DetailText value={update.detail} /></p>
                      </div>
                      <UpdateAttachmentLink update={update} />
                    </article>
                  })}
                  {recentUpdates.length > sectionPreviewLimit && (
                    <button className="section-more-button" type="button" onClick={() => toggleSection('updates')}>
                      {expandedSections.updates ? 'Ver menos' : `Ver más (${recentUpdates.length - sectionPreviewLimit})`}
                    </button>
                  )}
                </section>
              )}
            </div>
          )}

          {hasNextSteps && (
            <div className="activity-grid has-single-section detail-next-steps">
              <section className="activity-section steps-section is-priority">
                <h4><ClipboardCheck size={15} /> Próximos pasos</h4>
                {visibleNextSteps.map((step, index) => (
                  <article className="next-step" key={step.id}>
                    <span className="step-check" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <div className="next-step-body">{isNextStepOverdue(step) ? <span className="step-overdue-dot" aria-label="Próximo paso vencido" title="Próximo paso vencido" /> : isNextStepUndated(step) ? <span className="step-undated-dot" aria-label="Próximo paso sin fecha" title="Próximo paso sin fecha" /> : null}<strong className="next-step-task"><RichText value={step.task} /></strong>{(step.owner || step.dueDate) && <p className="next-step-meta">{step.owner && <span>{step.owner}</span>}{step.dueDate && <time>{formatDate(step.dueDate)}</time>}</p>}</div>
                    {effectiveMode === 'edit' && <button type="button" className="resolve-button" onClick={() => onResolveStep(project, step)}><Check size={14} /> OK</button>}
                  </article>
                ))}
                {project.nextSteps.length > sectionPreviewLimit && <button className="section-more-button" type="button" onClick={() => toggleSection('steps')}>{expandedSections.steps ? 'Ver menos' : `Ver más (${project.nextSteps.length - sectionPreviewLimit})`}</button>}
              </section>
            </div>
          )}

          {relatedSpecialViews.length > 0 && (
            <section className="project-special-views">
              {relatedSpecialViews.map((view) => {
                const isMap = isMapView(view)
                return (
                  <section className={`project-special-view ${isMap ? 'is-map' : 'is-data'}`} key={view.id}>
                    <h4>{isMap ? <MapPin size={15} /> : <BarChart3 size={15} />} {view.title}</h4>
                    {isMap ? <MapSpecialView view={view} /> : <SpecialDataView view={view} />}
                  </section>
                )
              })}
            </section>
          )}

        </div>
      )}

      {!forceSubprojectsVisible && subprojectsSection}
    </article>
    {forceSubprojectsVisible && subprojectsSection}
    </>
  )
}
