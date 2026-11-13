import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CalendarRange,
  Check,
  CircleHelp,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Flag,
  FolderTree,
  History,
  Layers3,
  MessageSquareText,
  Printer,
  RefreshCw,
  Target,
  X,
} from 'lucide-react'
import type { PortfolioData, Project, ProjectStatus, ProjectUpdate, SpecialView } from '../domain/types'
import { getDisplayStatus } from '../domain/displayStatus'
import {flattenProjects} from '../domain/projectTree'
import { isNextStepOverdue, isNextStepUndated } from '../domain/projectStatus'
import { externalLinkUrl } from '../domain/externalLink'
import { ProjectCard } from './ProjectCard'
import { ProjectVisualMetrics } from './ProjectVisualMetrics'
import { RichText } from './RichText'
import { isExcludedFromDashboard } from '../features/portfolio/dashboardSpecialViews'

const statusLabels: Record<ProjectStatus, string> = {
  active: 'En curso',
  pending: 'Con pendientes',
  alert: 'Alerta/Bloqueo',
  finished: 'Finalizado',
}

const administrativeWorksMapPayload: Record<string,unknown> = {}
const printSectionLimit = 3

interface PrintReportProps {
  areaName: string
  projects: Project[]
  portfolioData?: PortfolioData
  generatedAt: Date
  onBack: () => void
  onPrint: () => void
}

function formatDate(value: string) {
  if (!value) return ''
  const dateOnly = value.slice(0, 10)
  const parts = dateOnly.split('-')
  return parts.length === 3 ? parts.reverse().join('/') : value
}

function hasValue(value: unknown) {
  if (value === undefined || value === null) return false
  const normalized = String(value).trim().toLocaleLowerCase('es')
  return Boolean(normalized) && ![
    '-',
    'sin definir',
    'sin dato',
    'sin cargar',
    'sin notas',
    'sin fecha',
    'por actualizar',
  ].includes(normalized)
}

function PrintMechiMark({ value }: { value: boolean }) {
  return (
    <span className={`mechi-value print-mechi-value is-compact ${value ? 'is-ok' : 'is-no'}`} aria-label={`Mechi: ${value ? 'tick' : 'cruz'}`}>
      {value ? <Check size={14} /> : <X size={14} />}
    </span>
  )
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
}

function isEstadoEdilicioProject(project: Project) {
  return project.areaKeys.includes('gestion_administrativa') && normalizeText(project.name).includes('estado edilicio')
}

function keepWithSubprojectsOnPrint(project: Project) {
  return project.children.length > 0 && normalizeText(project.name).includes('polo de las victorias')
}

function keepOnSinglePrintPage(project: Project) {
  return normalizeText(project.name).trim() === 'sinigep'
}

function fallbackEstadoEdilicioWorksMap(project: Project): SpecialView {
  return {
    id: `print-fallback-administrative-works-map-${project.id}`,
    areaKey: 'gestion_administrativa',
    projectId: project.id,
    viewKey: 'administrative_works_map',
    title: 'Mapa de Obras',
    payload: administrativeWorksMapPayload,
    updatedAt: typeof administrativeWorksMapPayload.exportedAt === 'string' ? administrativeWorksMapPayload.exportedAt : project.updatedAt,
  }
}

function projectUpdates(project: Project) {
  return project.updates
    .filter((update) => update.type === 'Avance' || update.type === 'Información')
    .slice(0, printSectionLimit)
}

function PrintUpdateList({ updates }: { updates: ProjectUpdate[] }) {
  return (
    <div className="print-timeline-list">
      {updates.map((update) => {
        const attachmentUrl = externalLinkUrl(update.attachmentUrl)
        return <div className="print-timeline-item" key={update.id}>
          {update.date && <time>{formatDate(update.date)}</time>}
          <div>
            <p><strong>{update.type}:</strong> <RichText value={update.detail} /></p>
            {attachmentUrl && (
              <a href={attachmentUrl} target="_blank" rel="noreferrer">
                {update.attachmentName || 'Abrir archivo'} <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      })}
    </div>
  )
}

function PrintProjectCard({ project, index, nested = false, specialViews = [] }: { project: Project; index?: number; nested?: boolean; specialViews?: SpecialView[] }) {
  const displayStatus = getDisplayStatus(project)

  if (project.id.length >= 0) {
    return (
      <div className={`print-dashboard-project status-${displayStatus} ${project.children.length > 0 ? 'has-subprojects' : ''} ${keepWithSubprojectsOnPrint(project) ? 'keep-with-subprojects-on-print' : ''} ${keepOnSinglePrintPage(project) ? 'keep-on-single-print-page' : ''}`}>
        <ProjectCard
          project={project}
          mode="view"
          nested={nested}
          forceExpanded
          forceSubprojectsVisible
          hideBudgetAndMechi
          canToggleFavorite={false}
          specialViews={specialViews}
          onToggleFavorite={() => undefined}
          onEdit={() => undefined}
          onAddSubproject={() => undefined}
          onDelete={() => undefined}
          onResolveUpdate={() => undefined}
          onResolveStep={() => undefined}
        />
      </div>
    )
  }

  const alerts = project.updates.filter((update) => update.type === 'Alerta/Bloqueo' && !update.resolved).slice(0, printSectionLimit)
  const pending = project.updates.filter((update) => update.type === 'Pendiente' && !update.resolved).slice(0, printSectionLimit)
  const updates = projectUpdates(project)
  const nextSteps = project.nextSteps.filter((step) => !step.resolved).slice(0, printSectionLimit)
  const hasFacts = hasValue(project.priority) || hasValue(project.updatedAt) || project.mechi !== undefined
  const hasDates = hasValue(project.plannedStart) || hasValue(project.plannedEnd) || hasValue(project.rescheduledStart) || hasValue(project.rescheduledEnd)
  const introBlockCount = [project.objective, project.owner].filter(hasValue).length
  const factBlockCount = [hasValue(project.priority), hasValue(project.updatedAt), project.mechi !== undefined].filter(Boolean).length
  const dateBlockCount = [
    hasValue(project.plannedStart) || hasValue(project.plannedEnd),
    hasValue(project.rescheduledStart) || hasValue(project.rescheduledEnd),
    Boolean(externalLinkUrl(project.briefUrl)),
  ].filter(Boolean).length
  const copyBlockCount = [project.notes, project.scope, project.justification].filter(hasValue).length
  const briefUrl = externalLinkUrl(project.briefUrl)
  const visibleStatusLabel = statusLabels[displayStatus]

  return (
    <article className={`print-project-card status-${displayStatus} ${nested ? 'is-subproject' : ''} ${project.children.length ? 'has-subprojects' : ''}`}>
      <header className="print-project-topbar">
        <h3>
          {index !== undefined && <span className="print-project-index">{String(index + 1).padStart(2, '0')}</span>}
          <span>{project.name}</span>
        </h3>
        <div className="print-project-topbar-meta">
          {hasValue(project.budget) && <span>Presupuesto: {project.budget}</span>}
          <span className={`print-status-badge ${displayStatus}`}><i />{visibleStatusLabel}</span>
        </div>
      </header>

      <div className="print-project-body">
        <div className="print-project-main-content">
        <ProjectVisualMetrics metrics={project.visualMetrics ?? {}} compact />

        {(hasValue(project.objective) || hasValue(project.owner)) && (
          <div className={`print-project-intro ${introBlockCount === 1 ? 'has-single-section' : ''}`}>
            {hasValue(project.objective) && (
              <div className="print-objective-block">
                <span><Target size={11} /> Objetivo</span>
                <p><RichText value={project.objective} /></p>
              </div>
            )}
            {hasValue(project.owner) && (
              <div className="print-owner-block">
                <span><Building2 size={11} /> DG/GO</span>
                <strong>{project.owner}</strong>
              </div>
            )}
          </div>
        )}

        {hasFacts && (
          <div className={`print-facts ${factBlockCount === 1 ? 'has-single-section' : ''}`}>
            {hasValue(project.priority) && <div><span><Flag size={11} /> Prioridad</span><strong>{project.priority}</strong></div>}
            {hasValue(project.updatedAt) && <div><span><CalendarDays size={11} /> Actualización</span><strong>{formatDate(project.updatedAt)}</strong></div>}
            {project.mechi !== undefined && <div className="print-mechi-fact"><span>Mechi</span><strong><PrintMechiMark value={project.mechi} /></strong></div>}
          </div>
        )}

        {(hasDates || briefUrl) && (
          <div className={`print-date-facts ${dateBlockCount === 1 ? 'has-single-section' : ''}`}>
            {(hasValue(project.plannedStart) || hasValue(project.plannedEnd)) && (
              <div><span><CalendarRange size={11} /> Planificación original</span><strong>{formatDate(project.plannedStart)}{project.plannedEnd ? ` a ${formatDate(project.plannedEnd)}` : ''}{project.plannedDays ? ` · ${project.plannedDays} días` : ''}</strong></div>
            )}
            {(hasValue(project.rescheduledStart) || hasValue(project.rescheduledEnd)) && (
              <div><span><RefreshCw size={11} /> Reprogramación</span><strong>{formatDate(project.rescheduledStart)}{project.rescheduledEnd ? ` a ${formatDate(project.rescheduledEnd)}` : ''}{project.rescheduledDays ? ` · ${project.rescheduledDays} días` : ''}</strong></div>
            )}
            {briefUrl && <div><span><FileText size={11} /> Brief/Archivo</span><a href={briefUrl} target="_blank" rel="noreferrer">Abrir enlace <ExternalLink size={11} /></a></div>}
          </div>
        )}

        {(hasValue(project.notes) || hasValue(project.scope) || hasValue(project.justification)) && (
          <div className={`print-copy-grid ${copyBlockCount === 1 ? 'has-single-section' : ''}`}>
            {hasValue(project.notes) && <section className="print-copy-block print-status-copy"><span><MessageSquareText size={11} /> Status actual</span><p><RichText value={project.notes} /></p></section>}
            {hasValue(project.scope) && <section className="print-copy-block print-scope-copy"><span><Layers3 size={11} /> Alcance</span><p><RichText value={project.scope} /></p></section>}
            {hasValue(project.justification) && <section className="print-copy-block print-justification-copy"><span><CircleHelp size={11} /> Justificación</span><p><RichText value={project.justification} /></p></section>}
          </div>
        )}

        {(alerts.length > 0 || pending.length > 0) && (
          <div className={`print-issues-grid ${alerts.length === 0 || pending.length === 0 ? 'has-single-section' : ''}`}>
            {alerts.length > 0 && (
              <section className="print-section print-alert-section">
                <h4><AlertTriangle size={12} /> Alertas y bloqueos</h4>
                <PrintUpdateList updates={alerts} />
              </section>
            )}
            {pending.length > 0 && (
              <section className="print-section print-pending-section">
                <h4><Flag size={12} /> Pendientes</h4>
                <PrintUpdateList updates={pending} />
              </section>
            )}
          </div>
        )}

        {(updates.length > 0 || nextSteps.length > 0) && (
          <div className={`print-activity-grid ${updates.length === 0 || nextSteps.length === 0 ? 'has-single-section' : ''}`}>
            {updates.length > 0 && (
              <section className="print-section print-updates-section">
                <h4><History size={12} /> Últimas actualizaciones</h4>
                <PrintUpdateList updates={updates} />
              </section>
            )}
            {nextSteps.length > 0 && (
              <section className="print-section print-steps-section">
                <h4><ClipboardCheck size={12} /> Próximos pasos</h4>
                <div className="print-next-list">
                  {nextSteps.map((step) => {
                    const overdue = isNextStepOverdue(step)
                    const undated = isNextStepUndated(step)
                    return (
                      <div className={`print-next-item ${overdue ? 'is-overdue' : undated ? 'is-undated' : ''}`} key={step.id}>
                        <i aria-label={overdue ? 'Próximo paso vencido' : undated ? 'Próximo paso sin fecha' : undefined} />
                        <p><strong><RichText value={step.task} /></strong>{hasValue(step.owner) ? ` · ${step.owner}` : ''}{step.dueDate ? ` · ${formatDate(step.dueDate)}` : ''}</p>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        )}
        </div>

        {project.children.length > 0 && (
          <section className="print-subprojects-section">
            <h4><FolderTree size={12} /> Subproyectos</h4>
            <div className="print-subproject-list">
              {project.children.map((child) => <PrintProjectCard key={child.id} project={child} nested />)}
            </div>
          </section>
        )}

      </div>
    </article>
  )
}

export function PrintReport({ areaName, projects, portfolioData, generatedAt, onBack, onPrint }: PrintReportProps) {
  const activeProjects = projects.filter((project) => getDisplayStatus(project) !== 'finished')
  const finishedProjects = projects.filter((project) => getDisplayStatus(project) === 'finished')
  const flattenedProjects = flattenProjects(projects)
  const projectIds = new Set(flattenedProjects.map((project) => project.id))
  const baseSpecialViews = portfolioData?.specialViews.filter((item) => !isExcludedFromDashboard(item) && Boolean(item.projectId && projectIds.has(item.projectId))) ?? []
  const hasWorksMap = baseSpecialViews.some((view) => view.viewKey.toLocaleLowerCase('es').includes('administrative_works_map') || view.title.toLocaleLowerCase('es').includes('mapa de obras'))
  const estadoEdilicioProject = flattenedProjects.find(isEstadoEdilicioProject)
  const specialViews = !hasWorksMap && estadoEdilicioProject
    ? [...baseSpecialViews, fallbackEstadoEdilicioWorksMap(estadoEdilicioProject)]
    : baseSpecialViews

  return (
    <main className="print-preview-screen print-paper-layout">
      <header className="print-preview-toolbar">
        <div>
          <strong>Vista previa de impresión</strong>
          <span>{areaName} · {projects.length} {projects.length === 1 ? 'proyecto' : 'proyectos'}</span>
        </div>
        <div>
          <button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={16} /> Volver al tablero</button>
          <button type="button" className="primary-button" onClick={onPrint}><Printer size={16} /> Imprimir / Guardar PDF</button>
        </div>
      </header>

      <div className="print-preview-scroll">
        <div className="print-report">
          <header className="print-report-heading">
            <div>
              <span>Ministerio de Educación</span>
              <h1>Proyectos Prioritarios</h1>
              <p>{areaName}</p>
            </div>
            <p>Generado: {generatedAt.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</p>
          </header>

          <section className="print-summary-section">
            <h2>Resumen ejecutivo</h2>
            <div className="print-summary-table" role="table" aria-label="Resumen ejecutivo">
              <div className="print-summary-row print-summary-head" role="row">
                <span>Proyecto</span><span>Status</span>
              </div>
              {projects.map((project, index) => {
                const displayStatus = getDisplayStatus(project)
                return (
                <div className="print-summary-row" role="row" key={project.id}>
                  <div className="print-summary-project"><strong>{String(index + 1).padStart(2, '0')}</strong><span><b>{project.name}</b><small>{project.areaName}</small></span></div>
                  <span className={`print-summary-status ${displayStatus}`}><i />{statusLabels[displayStatus]}</span>
                </div>
                )
              })}
            </div>
          </section>

          {activeProjects.length > 0 && (
            <section className="print-projects-section">
              <h2>Proyectos principales</h2>
              <div className="print-project-list">
                {activeProjects.map((project, index) => <PrintProjectCard key={project.id} project={project} index={index} specialViews={specialViews} />)}
              </div>
            </section>
          )}

          {finishedProjects.length > 0 && (
            <section className="print-projects-section print-finished-section">
              <h2>Finalizados</h2>
              <div className="print-project-list">
                {finishedProjects.map((project) => <PrintProjectCard key={project.id} project={project} specialViews={specialViews} />)}
              </div>
            </section>
          )}

        </div>
      </div>
    </main>
  )
}
