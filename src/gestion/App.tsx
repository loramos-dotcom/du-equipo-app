import type {DuPortfolio}from'./du-portfolio';
import type {ReactNode} from 'react'
import {RichTextEditor} from './components/RichText'
import {DuProjects} from './DuProjects'
import {ProjectVisualMetrics} from './components/ProjectVisualMetrics'
import {ProjectRiskTable} from './components/ProjectRiskTable'
import {EducationSystemOverview} from './components/EducationSystemOverview'
import {getEducationSystemData,isEducationSystemProjectName} from './components/educationSystemData'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  FileText,
  ExternalLink,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Milestone,
  PanelLeftClose,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react'
import { ProjectCard } from './components/ProjectCard'
import { ConfirmDeleteDialog } from './components/ConfirmDeleteDialog'
import { PrintReport } from './components/PrintReport'
import { areas } from './data/demo'
import type { NextStep, Project, ProjectStatus, ProjectUpdate, ViewMode } from './domain/types'
import { getVisibleProjects, toggleProjectStatusFilter } from './domain/dashboardVisibility'
import { getDisplayStatus } from './domain/displayStatus'
import { LoginScreen } from './features/auth/LoginScreen'
import {
  deleteProject,
  fetchCurrentAccess,
  fetchProjects,
  resolveNextStep,
  resolveProjectUpdate,
  setDashboardFavorite,
} from './features/projects/api'
import { ProjectEditor } from './features/projects/ProjectEditor'
import { ExecutiveSummary, OrderDialog, ReportBuilder } from './features/dashboard/DashboardTools'
import { AccessManager } from './features/dashboard/AccessManager'
import { fetchPortfolioData, syncWorksMapFromSheets } from './features/portfolio/api'
import { PortfolioPanels } from './features/portfolio/PortfolioPanels'
import { SpecialViewsPanel,MapSpecialView,SpecialDataView } from './features/portfolio/SpecialViewsPanel'
import { ManagementMilestonesView } from './features/portfolio/ManagementMilestonesView'
import { institutionalEmailHint, isBueEmail } from './lib/institutionalAccess'
import { avatarInitials } from './lib/avatarInitials'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import {fetchManagementRevision} from './lib/revision'
import type {ManagementRevision} from './lib/revision'
import {flattenProjects} from './domain/projectTree'

type StatusFilterOption = 'all' | ProjectStatus
const emptyProjects: Project[] = []

interface EditorState {
  project?: Project
  areaKey: string
  parentId?: string
}

interface ResolutionState {
  project: Project
  update?: ProjectUpdate
  step?: NextStep
}

const statusFilterOptions: Array<{ value: StatusFilterOption; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'alert', label: 'Alertas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'active', label: 'En curso' },
  { value: 'finished', label: 'Finalizados' },
]

export default function Dashboard({ session, initialArea = 'all_projects', projectId='',onDuTracking,initialView,onViewChange,duPortfolio }: { session: Session; initialArea?:string;projectId?:string;onDuTracking?:(id:string)=>void;initialView?:any;onViewChange?:(view:any)=>void;duPortfolio?:DuPortfolio }) {
  const queryClient = useQueryClient()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(false)
  const [activeArea, setActiveArea] = useState(initialArea)
  const [mode, setMode] = useState<ViewMode>('view')
  const [query, setQuery] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<ProjectStatus[]>([])
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [projectPendingDeletion, setProjectPendingDeletion] = useState<Project | null>(null)
  const [resolution, setResolution] = useState<ResolutionState | null>(null)
  const [resolutionDetail, setResolutionDetail] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [refreshing,setRefreshing]=useState(false)
  const [printMode, setPrintMode] = useState(false)
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false)
  const [printGeneratedAt, setPrintGeneratedAt] = useState(() => new Date())
  const [reportSelection, setReportSelection] = useState<{ title: string; projects: Project[] } | null>(null)
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false)
  const [orderDialogOpen, setOrderDialogOpen] = useState(false)
  const [accessManagerOpen, setAccessManagerOpen] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showStickyDashboardActions, setShowStickyDashboardActions] = useState(false)
  const worksMapSyncBusy = useRef(false)
  const pageHeaderRef = useRef<HTMLElement>(null)
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })
  const portfolioQuery = useQuery({ queryKey: ['portfolio'], queryFn: fetchPortfolioData })
  const accessQuery = useQuery({ queryKey: ['access', session.user.id], queryFn: () => fetchCurrentAccess(session.user) })
  const projects = useMemo(()=>{const original=projectsQuery.data??emptyProjects;if(!duPortfolio)return original;const adapt=(rows:Project[]):Project[]=>rows.map(p=>({...p,favorite:duPortfolio.priorityIds.includes(p.id),children:adapt(p.children)}));return adapt(original);},[projectsQuery.data,JSON.stringify(duPortfolio?.priorityIds)])
  const revisionRef=useRef<ManagementRevision|null>(null);
  const revisionBusy=useRef(false);
  const focusedProject=useRef('');
  const access = accessQuery.data
  const isManagementView = activeArea === 'management_milestones'
  const isRedReport = activeArea === 'red_report'

  const visibleProjects = useMemo(
    () => getVisibleProjects(projects, activeArea, query, selectedStatuses),
    [activeArea, projects, query, selectedStatuses],
  )
  const dashboardOrderProjects = useMemo(
    () => getVisibleProjects(projects, 'dashboard', '', []),
    [projects],
  )

  const scopedProjects = useMemo(() => flattenProjects(visibleProjects), [visibleProjects])
  const scopedProjectIds = useMemo(() => new Set(scopedProjects.map((project) => project.id)), [scopedProjects])
  const scopedAreaKeys = useMemo(() => new Set(scopedProjects.flatMap((project) => project.areaKeys)), [scopedProjects])

  const totals = useMemo(() => {
    if (activeArea === 'management_milestones') return { projects: 0, alerts: 0, pending: 0, active: 0, finished: 0 }
    if (activeArea === 'red_report') {
      const scoped = flattenProjects(visibleProjects)
      return { projects: scoped.length, alerts: scoped.filter((project) => getDisplayStatus(project) === 'alert').length, pending: 0, active: 0, finished: 0 }
    }
    const scoped = activeArea === 'all_projects' ? flattenProjects(projects) : activeArea === 'dashboard'
      ? flattenProjects(projects).filter((project) => project.favorite)
      : projects.filter((project) => project.areaKeys.includes(activeArea))
    return {
      projects: scoped.length,
      alerts: scoped.filter((project) => getDisplayStatus(project) === 'alert').length,
      pending: scoped.filter((project) => getDisplayStatus(project) === 'pending').length,
      active: scoped.filter((project) => getDisplayStatus(project) === 'active').length,
      finished: scoped.filter((project) => getDisplayStatus(project) === 'finished').length,
    }
  }, [activeArea, projects, visibleProjects])

  const activeAreaData = areas.find((area) => area.key === activeArea)
  const activeAreaName = activeArea === 'all_projects'
    ? 'Todos los proyectos'
    : activeArea === 'dashboard'
    ? 'Tablero de Gestión'
    : isManagementView
      ? 'Hitos de Gestión'
      : isRedReport
        ? 'Reporte de proyectos rojos'
        : activeAreaData?.name ?? 'Área'
  const statusCounts: Record<StatusFilterOption, number> = {
    all: totals.projects,
    alert: totals.alerts,
    pending: totals.pending,
    active: totals.active,
    finished: totals.finished,
  }

  const toggleStatusFilter = (status: StatusFilterOption) => {
    setSelectedStatuses((current) => toggleProjectStatusFilter(current, status))
  }

  const allowedAreaKeys = access?.role === 'root' ? areas.map((area) => area.key) : access?.editableAreaKeys ?? []
  const canEditCurrent = Boolean(access && (
    !isManagementView && !isRedReport &&
    (access.role === 'root' ||
      (activeArea === 'all_projects' ? allowedAreaKeys.length > 0 : activeArea === 'dashboard'
        ? access.canEditDashboard || allowedAreaKeys.length > 0
        : access.editableAreaKeys.includes(activeArea)))
  )) && !isManagementView && !isRedReport
  const canGenerateReports = Boolean(access && !isManagementView && !isRedReport && (
    access.role === 'root' ||
    access.role === 'editor' ||
    access.canEditDashboard ||
    allowedAreaKeys.length > 0
  ))
  const canCreateCurrent = activeArea === 'all_projects' ? allowedAreaKeys.length > 0 : activeArea === 'dashboard' ? allowedAreaKeys.length > 0 && Boolean(access?.canEditDashboard) : allowedAreaKeys.includes(activeArea)
  const canEditProject = (project: Project) => Boolean(access && (
    access.role === 'root' || project.areaKeys.some((key) => access.editableAreaKeys.includes(key))
  ))
  const canToggleProjectFavorite = (project: Project) => Boolean(access && (
    access.role === 'root' || access.canEditDashboard || project.areaKeys.some((key) => access.editableAreaKeys.includes(key))
  ))

  useEffect(() => {
    if (!canEditCurrent && mode === 'edit') setMode('view')
  }, [canEditCurrent, mode])

  useEffect(() => {
    const updateStickyActions = () => {
      const header = pageHeaderRef.current
      setShowStickyDashboardActions(Boolean(header && activeArea === 'dashboard' && header.getBoundingClientRect().bottom <= 72))
    }
    updateStickyActions()
    window.addEventListener('scroll', updateStickyActions, { passive: true })
    window.addEventListener('resize', updateStickyActions)
    return () => {
      window.removeEventListener('scroll', updateStickyActions)
      window.removeEventListener('resize', updateStickyActions)
    }
  }, [activeArea])

  useEffect(() => {
    const preparePrint = () => flushSync(() => {
      setPrintPreviewOpen(true)
      setPrintMode(true)
    })
    const finishPrint = () => setPrintMode(false)
    window.addEventListener('beforeprint', preparePrint)
    window.addEventListener('afterprint', finishPrint)
    return () => {
      window.removeEventListener('beforeprint', preparePrint)
      window.removeEventListener('afterprint', finishPrint)
    }
  }, [])

  const refreshProjects = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['projects'] })
  }, [queryClient])

  const refreshPortfolio = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['portfolio'] })
  }, [queryClient])

  useEffect(() => {
    let active=true;
    const refresh=async()=>{
      if(revisionBusy.current||document.visibilityState!=='visible'||editor||resolution||projectPendingDeletion)return;
      revisionBusy.current=true;
      try{const next=await fetchManagementRevision();if(!active)return;const previous=revisionRef.current;revisionRef.current=next;const pending:Promise<unknown>[]=[];
        if(!previous||String(previous.projects_revision)!==String(next.projects_revision))pending.push(refreshProjects());
        if(!previous||String(previous.portfolio_revision)!==String(next.portfolio_revision))pending.push(refreshPortfolio());
        if(!previous||String(previous.access_revision)!==String(next.access_revision))pending.push(queryClient.invalidateQueries({queryKey:['access']}));
        await Promise.all(pending);
      }catch{if(active)setNotice({type:'error',text:'No pudimos comprobar si hay cambios. Usá «Actualizar datos» para reintentar.'});}finally{revisionBusy.current=false;}
    };
    const focused=()=>{void refresh();},timer=window.setInterval(focused,10000);window.addEventListener('focus',focused);document.addEventListener('visibilitychange',focused);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',focused);document.removeEventListener('visibilitychange',focused);};
  },[refreshProjects,refreshPortfolio,queryClient,editor,resolution,projectPendingDeletion]);

  const toggleFavorite = async (projectId: string) => {
    if (!supabase) return
    const project = flattenProjects(projects).find((item) => item.id === projectId)
    if (!project || !canToggleProjectFavorite(project)) return
    setActionBusy(true)
    setNotice(null)
    try {
      await setDashboardFavorite(projectId, !project.favorite)
      await refreshProjects()
    } catch (favoriteError) {
      setNotice({ type: 'error', text: favoriteError instanceof Error ? favoriteError.message : 'No se pudo modificar el favorito.' })
    } finally {
      setActionBusy(false)
    }
  }

  const handleDelete = (project: Project) => setProjectPendingDeletion(project)

  const confirmProjectDeletion = async () => {
    const project = projectPendingDeletion
    if (!project) return
    setActionBusy(true)
    setNotice(null)
    try {
      await deleteProject(project.id)
      await refreshProjects()
      setProjectPendingDeletion(null)
      setNotice({ type: 'success', text: 'El registro fue eliminado correctamente.' })
    } catch (deleteError) {
      setNotice({ type: 'error', text: deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el registro.' })
    } finally {
      setActionBusy(false)
    }
  }

  const openUpdateResolution = (project: Project, update: ProjectUpdate) => {
    setResolution({ project, update })
    setResolutionDetail(update.detail)
  }

  const openStepResolution = (project: Project, step: NextStep) => {
    setResolution({ project, step })
    setResolutionDetail(step.task)
  }

  const confirmResolution = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!resolution || actionBusy) return
    setActionBusy(true)
    setNotice(null)
    try {
      if (resolution.update) await resolveProjectUpdate(resolution.update.id, resolutionDetail)
      if (resolution.step) await resolveNextStep(resolution.step.id, resolutionDetail)
      await refreshProjects()
      setResolution(null)
      setNotice({ type: 'success', text: 'El registro pasó a Avances y el estado fue actualizado.' })
    } catch (resolveError) {
      setNotice({ type: 'error', text: resolveError instanceof Error ? resolveError.message : 'No se pudo resolver el registro.' })
    } finally {
      setActionBusy(false)
    }
  }

  const selectArea = (areaKey: string) => {
    setActiveArea(areaKey)
    setSidebarOpen(false)
  }

  const openPrintPreview = () => {
    setPrintGeneratedAt(new Date())
    setReportSelection(null)
    setPrintPreviewOpen(true)
  }

  const printDashboard = async () => {
    setPrintMode(true)
    if (document.fonts?.ready) await document.fonts.ready
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // Leaflet recalculates its tile canvas after the print layout receives its final A4 dimensions.
      window.dispatchEvent(new Event('resize'))
      window.setTimeout(() => window.print(), 1000)
    }))
  }

  const renderData=(selected?:Project)=>{
    const scoped=selected?flattenProjects([selected]):flattenProjects(visibleProjects);
    const ids=new Set(scoped.map(p=>p.id)),keys=new Set(scoped.flatMap(p=>p.areaKeys));
    const area=selected||['all_projects','dashboard','red_report'].includes(activeArea)?'dashboard':activeArea;
    const editable=selected?canEditProject(selected):canEditCurrent;
    const data=portfolioQuery.data;
    if(!data)return null;
    const selectedViews=selected?data.specialViews.filter(view=>view.projectId===selected.id):[];
    const education=selected&&(isEducationSystemProjectName(selected.name)||selected.visualMetrics?.educationSystem)?getEducationSystemData(selected.visualMetrics??{}):null;
    return <div className="gestion-root du-management-tools">
      {selected&&<ProjectVisualMetrics metrics={selected.visualMetrics??{}} onEdit={editable?()=>setEditor({project:selected,areaKey:selected.areaKey}):undefined}/>}
      {selected&&<ProjectRiskTable metrics={selected.visualMetrics??{}}/>}
      {selected&&education&&<EducationSystemOverview data={education} onEdit={editable?()=>setEditor({project:selected,areaKey:selected.areaKey}):undefined}/>}
      {selectedViews.map(view=><section className="panel" key={view.id}><h3>{view.title}</h3>{view.viewKey.includes('works_map')||view.title.toLowerCase().includes('mapa de obras')?<MapSpecialView view={view}/>:<SpecialDataView view={view}/>}</section>)}
      <PortfolioPanels activeArea={area} data={data} projects={projects} scopedProjectIds={ids} scopedAreaKeys={keys} mode={editable?'edit':'view'} canEdit={editable} onChanged={refreshPortfolio} onNotice={(type,text)=>setNotice({type,text})}/>
      <SpecialViewsPanel activeArea={area} views={data.specialViews} scopedProjectIds={ids} scopedAreaKeys={keys} mode={editable?'edit':'view'} canEdit={editable} onChanged={refreshPortfolio} onNotice={(type,text)=>setNotice({type,text})}/>
    </div>;
  };
  if (printPreviewOpen) {
    return (
      <div className="gestion-root du-management-tools"><PrintReport
        areaName={reportSelection?.title || activeAreaName}
        projects={reportSelection?.projects || visibleProjects}
        portfolioData={portfolioQuery.data}
        generatedAt={printGeneratedAt}
        onBack={() => { setPrintPreviewOpen(false); setReportSelection(null) }}
        onPrint={() => { void printDashboard() }}
      /></div>
    )
  }

  return (
    <div className="du-management-container">
      <DuProjects duPortfolio={duPortfolio} initialView={initialView} onViewChange={onViewChange} projects={projects} query={query} onQuery={setQuery} activeArea={activeArea} onArea={selectArea} statuses={selectedStatuses} onStatuses={setSelectedStatuses} loading={projectsQuery.isLoading} error={projectsQuery.error?.message|| (accessQuery.isError?'No pudimos verificar tus permisos. Reintentá actualizar.':undefined)} notice={notice} onDismissNotice={()=>setNotice(null)} canCreate={canCreateCurrent} canEdit={canEditProject} canFavorite={canToggleProjectFavorite}
        onCreate={()=>setEditor({areaKey:['dashboard','all_projects','red_report'].includes(activeArea)?allowedAreaKeys[0]||areas[0].key:activeArea})}
        onEdit={project=>setEditor({project,areaKey:project.areaKey})} onAddChild={parent=>setEditor({areaKey:parent.areaKey,parentId:parent.id})} onDelete={handleDelete} onFavorite={id=>{void toggleFavorite(id);}} onResolveUpdate={openUpdateResolution} onResolveStep={openStepResolution}
        onRefresh={async()=>{await Promise.all([refreshProjects(),refreshPortfolio(),queryClient.invalidateQueries({queryKey:['access']})]);}}
        onChanged={refreshProjects} onPrint={openPrintPreview} onReport={canGenerateReports?()=>setReportBuilderOpen(true):undefined} onOrder={!duPortfolio&&access?.canEditDashboard?()=>setOrderDialogOpen(true):undefined} onAccess={access?.role==='root'?()=>setAccessManagerOpen(true):undefined}
        onDuTracking={onDuTracking} renderData={renderData} projectId={focusedProject.current===projectId?'':projectId} onProjectOpened={()=>{focusedProject.current=projectId;}} overlayOpen={Boolean(editor||resolution||projectPendingDeletion||reportBuilderOpen||orderDialogOpen||accessManagerOpen)} milestones={portfolioQuery.data?<div className="gestion-root du-management-tools"><ManagementMilestonesView milestones={portfolioQuery.data.milestones}/></div>:null}/>
      <div className="gestion-root du-management-tools">
        {reportBuilderOpen && (
          <ReportBuilder
            projects={projects}
            initialAreaKey={activeArea}
            initialAreaName={activeAreaName}
            accountEmail={session.user.email || ''}
            canGenerateGoogleDoc={canGenerateReports}
            onClose={() => setReportBuilderOpen(false)}
            onNotice={(type, text) => setNotice({ type, text })}
          />
        )}

        {orderDialogOpen && (
          <OrderDialog
            projects={dashboardOrderProjects}
            onClose={() => setOrderDialogOpen(false)}
            onSaved={async () => {
              await refreshProjects()
              setNotice({ type: 'success', text: 'El orden del tablero se guardó correctamente.' })
            }}
            onError={(text) => setNotice({ type: 'error', text })}
          />
        )}

        {accessManagerOpen && (
          <AccessManager
            onClose={() => setAccessManagerOpen(false)}
            onNotice={(type, text) => setNotice({ type, text })}
          />
        )}

        {editor && (
          <ProjectEditor
            project={editor.project}
            initialAreaKey={editor.areaKey}
            initialParentId={editor.parentId}
            allProjects={projects}
            allowedAreaKeys={allowedAreaKeys}
            onClose={() => setEditor(null)}
            onSaved={async () => {
              await refreshProjects()
              setNotice({ type: 'success', text: editor.project ? 'Los cambios se guardaron correctamente.' : 'El proyecto se creó correctamente.' })
            }}
          />
        )}

        {projectPendingDeletion && (
          <ConfirmDeleteDialog
            title={`Eliminar ${projectPendingDeletion.kind === 'subproject' ? 'subproyecto' : 'proyecto'}`}
            description={`Vas a eliminar “${projectPendingDeletion.name}”.${projectPendingDeletion.children.length ? ` También se eliminarán sus ${projectPendingDeletion.children.length} subproyectos.` : ''} Esta acción no se puede deshacer.`}
            busy={actionBusy}
            onCancel={() => setProjectPendingDeletion(null)}
            onConfirm={() => { void confirmProjectDeletion() }}
          />
        )}

        {resolution && (
          <div className="modal-backdrop" role="presentation">
            <form className="resolution-dialog" role="dialog" aria-modal="true" aria-labelledby="resolution-title" onSubmit={confirmResolution}>
              <header>
                <div><span>Resolver registro</span><h2 id="resolution-title">Pasar a Avances</h2></div>
                <button className="icon-button" type="button" aria-label="Cerrar" onClick={() => setResolution(null)} disabled={actionBusy}><X size={18} /></button>
              </header>
              <p>Al confirmar, dejará de figurar como {resolution.update?.type === 'Alerta/Bloqueo' ? 'alerta' : resolution.update ? 'pendiente' : 'próximo paso'} y se registrará como un avance de hoy.</p>
              <RichTextEditor label="Detalle del avance" value={resolutionDetail} onChange={setResolutionDetail} required/>
              <footer>
                <button className="secondary-button" type="button" onClick={() => setResolution(null)} disabled={actionBusy}>Cancelar</button>
                <button className="primary-button" type="submit" disabled={actionBusy}><Check size={16} /> {actionBusy ? 'Guardando...' : 'Confirmar resolución'}</button>
              </footer>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
