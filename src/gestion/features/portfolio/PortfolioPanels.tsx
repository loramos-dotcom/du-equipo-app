import { useMemo, useState } from 'react'
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Edit3,
  Flag,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import type { BudgetExecution, Indicator, Milestone, PortfolioData, Project, ViewMode } from '../../domain/types'
import { RichText, RichTextEditor } from '../../components/RichText'
import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog'
import {
  deleteBudget,
  deleteIndicator,
  deleteMilestone,
  saveBudget,
  saveIndicator,
  saveMilestone,
} from './api'

type PanelKey = 'indicators' | 'milestones' | 'budget'

interface PortfolioPanelsProps {
  activeArea: string
  data: PortfolioData
  projects: Project[]
  scopedProjectIds: Set<string>
  scopedAreaKeys: Set<string>
  mode: ViewMode
  canEdit: boolean
  onChanged: () => Promise<void>
  onNotice: (type: 'success' | 'error', text: string) => void
}

interface IndicatorDraft {
  id?: string
  projectId: string
  name: string
  valueText: string
  targetText: string
  unit: string
  period: string
  notes: string
  status: string
}

interface MilestoneDraft {
  id?: string
  projectId: string
  projectTitle: string
  name: string
  startDate: string
  dueDate: string
  status: string
  owner: string
  scope: string
  detail: string
  axis: string
  jgmEligible: string
}

interface BudgetDraft {
  id?: string
  concept: string
  period: string
  budgeted: string
  executed: string
  detail: string
}

const emptyIndicator = (): IndicatorDraft => ({
  projectId: '',
  name: '',
  valueText: '',
  targetText: '',
  unit: '',
  period: '',
  notes: '',
  status: 'En curso',
})

const emptyMilestone = (): MilestoneDraft => ({
  projectId: '',
  projectTitle: '',
  name: '',
  startDate: '',
  dueDate: '',
  status: 'Pendiente',
  owner: '',
  scope: '',
  detail: '',
  axis: '',
  jgmEligible: '',
})

const emptyBudget = (): BudgetDraft => ({
  concept: '',
  period: '',
  budgeted: '',
  executed: '',
  detail: '',
})

function flattenProjects(projects: Project[]): Project[] {
  return projects.flatMap((project) => [project, ...flattenProjects(project.children)])
}

function formatDate(value: string) {
  return value ? value.split('-').reverse().join('/') : ''
}

function formatMoney(value?: number) {
  if (value == null) return 'Sin definir'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
}

function statusTone(value: string) {
  const normalized = value.toLocaleLowerCase('es')
  if (normalized.includes('cumpl') || normalized.includes('final')) return 'finished'
  if (normalized.includes('alert') || normalized.includes('atras') || normalized.includes('rojo')) return 'alert'
  if (normalized.includes('pend') || normalized.includes('observ') || normalized.includes('amar')) return 'pending'
  return 'active'
}

export function PortfolioPanels({
  activeArea,
  data,
  projects,
  scopedProjectIds,
  scopedAreaKeys,
  mode,
  canEdit,
  onChanged,
  onNotice,
}: PortfolioPanelsProps) {
  const [openPanels, setOpenPanels] = useState<Set<PanelKey>>(new Set())
  const [indicatorDraft, setIndicatorDraft] = useState<IndicatorDraft | null>(null)
  const [milestoneDraft, setMilestoneDraft] = useState<MilestoneDraft | null>(null)
  const [budgetDraft, setBudgetDraft] = useState<BudgetDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [indicatorPendingDeletion, setIndicatorPendingDeletion] = useState<Indicator | null>(null)
  const [milestonePendingDeletion, setMilestonePendingDeletion] = useState<Milestone | null>(null)
  const [budgetPendingDeletion, setBudgetPendingDeletion] = useState<BudgetExecution | null>(null)

  const scoped = <T extends { areaKey: string; projectId?: string }>(items: T[]) => items.filter((item) => (
    activeArea === 'dashboard'
      ? (item.projectId ? scopedProjectIds.has(item.projectId) : scopedAreaKeys.has(item.areaKey))
      : item.areaKey === activeArea
  ))

  const indicators = scoped(data.indicators)
  const milestones = scoped(data.milestones.filter((item) => item.sourceSheet !== 'HITOS 2026'))
  const budgets = scoped(data.budgets)
  const allProjects = useMemo(() => flattenProjects(projects), [projects])
  const projectOptions = allProjects.filter((project) => (
    activeArea === 'dashboard' ? scopedProjectIds.has(project.id) : project.areaKeys.includes(activeArea)
  ))
  const editAreaKey = activeArea === 'dashboard'
    ? projectOptions[0]?.areaKey || [...scopedAreaKeys][0] || ''
    : activeArea

  const togglePanel = (key: PanelKey) => setOpenPanels((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const editIndicator = (item?: Indicator) => setIndicatorDraft(item ? {
    id: item.id,
    projectId: item.projectId || '',
    name: item.name,
    valueText: item.valueText,
    targetText: item.targetText,
    unit: item.unit,
    period: item.period,
    notes: item.notes,
    status: item.status || 'En curso',
  } : emptyIndicator())

  const editMilestone = (item?: Milestone) => setMilestoneDraft(item ? {
    id: item.id,
    projectId: item.projectId || '',
    projectTitle: item.projectTitle,
    name: item.name,
    startDate: item.startDate,
    dueDate: item.dueDate,
    status: item.status || 'Pendiente',
    owner: item.owner,
    scope: item.scope,
    detail: item.detail,
    axis: item.axis,
    jgmEligible: item.jgmEligible,
  } : emptyMilestone())

  const editBudget = (item?: BudgetExecution) => setBudgetDraft(item ? {
    id: item.id,
    concept: item.concept,
    period: item.period,
    budgeted: item.budgeted == null ? '' : String(item.budgeted),
    executed: item.executed == null ? '' : String(item.executed),
    detail: item.detail,
  } : emptyBudget())

  const submitIndicator = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!indicatorDraft || saving || !editAreaKey) return
    setSaving(true)
    try {
      await saveIndicator({ ...indicatorDraft, areaKey: editAreaKey, projectId: indicatorDraft.projectId || undefined })
      await onChanged()
      setIndicatorDraft(null)
      onNotice('success', 'El indicador se guardó correctamente.')
    } catch (error) {
      onNotice('error', error instanceof Error ? error.message : 'No se pudo guardar el indicador.')
    } finally {
      setSaving(false)
    }
  }

  const submitMilestone = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!milestoneDraft || saving || !editAreaKey) return
    setSaving(true)
    try {
      await saveMilestone({ ...milestoneDraft, areaKey: editAreaKey, projectId: milestoneDraft.projectId || undefined })
      await onChanged()
      setMilestoneDraft(null)
      onNotice('success', 'El hito se guardó correctamente.')
    } catch (error) {
      onNotice('error', error instanceof Error ? error.message : 'No se pudo guardar el hito.')
    } finally {
      setSaving(false)
    }
  }

  const submitBudget = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!budgetDraft || saving || !editAreaKey) return
    setSaving(true)
    try {
      await saveBudget({ ...budgetDraft, areaKey: editAreaKey })
      await onChanged()
      setBudgetDraft(null)
      onNotice('success', 'El presupuesto se guardó correctamente.')
    } catch (error) {
      onNotice('error', error instanceof Error ? error.message : 'No se pudo guardar el presupuesto.')
    } finally {
      setSaving(false)
    }
  }

  const removeIndicator = async (item: Indicator) => {
    try {
      await deleteIndicator(item.id)
      await onChanged()
      setIndicatorPendingDeletion(null)
      onNotice('success', 'El indicador fue eliminado.')
    } catch (error) {
      onNotice('error', error instanceof Error ? error.message : 'No se pudo eliminar el indicador.')
    }
  }

  const removeMilestone = async (item: Milestone) => {
    try {
      await deleteMilestone(item.id)
      await onChanged()
      setMilestonePendingDeletion(null)
      onNotice('success', 'El hito fue eliminado.')
    } catch (error) {
      onNotice('error', error instanceof Error ? error.message : 'No se pudo eliminar el hito.')
    }
  }

  const removeBudget = async (item: BudgetExecution) => {
    try {
      await deleteBudget(item.id)
      await onChanged()
      setBudgetPendingDeletion(null)
      onNotice('success', 'El registro presupuestario fue eliminado.')
    } catch (error) {
      onNotice('error', error instanceof Error ? error.message : 'No se pudo eliminar el presupuesto.')
    }
  }

  const sections: Array<{ key: PanelKey; title: string; description: string; count: number; icon: React.ReactNode }> = [
    { key: 'indicators', title: 'Indicadores', description: 'Seguimiento de metas y resultados', count: indicators.length, icon: <BarChart3 size={18} /> },
    { key: 'milestones', title: 'Hitos', description: 'Entregables y fechas clave', count: milestones.length, icon: <Flag size={18} /> },
    { key: 'budget', title: 'Ejecución presupuestaria', description: 'Presupuestado y ejecutado por período', count: budgets.length, icon: <BarChart3 size={18} /> },
  ]

  return (
    <section className="portfolio-panels" aria-label="Información complementaria">
      {sections.map((section) => {
        const open = openPanels.has(section.key)
        const showEmptySection = mode === 'edit' && canEdit
        if (!section.count && !showEmptySection) return null
        return (
          <section className="portfolio-section" key={section.key}>
            <button className="portfolio-disclosure" type="button" aria-expanded={open} onClick={() => togglePanel(section.key)}>
              <span className="portfolio-disclosure-icon">{section.icon}</span>
              <span><strong>{section.title}</strong></span>
              <b>{section.count}</b>
              {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>

            {open && (
              <div className="portfolio-content">
                {section.key === 'indicators' && (
                  <>
                    {mode === 'edit' && canEdit && <button className="secondary-button portfolio-add" type="button" onClick={() => editIndicator()}><Plus size={15} /> Nuevo indicador</button>}
                    <div className="indicator-grid">
                      {indicators.map((item) => (
                        <article className={`indicator-card tone-${statusTone(item.status)}`} key={item.id}>
                          <header><div><small>{item.period || item.areaName}</small><h3>{item.name}</h3></div><span>{item.status || 'Sin estado'}</span></header>
                          <div className="indicator-values"><strong>{item.valueText || (item.valueNumeric ?? '—')}{item.unit ? ` ${item.unit}` : ''}</strong>{(item.targetText || item.targetNumeric != null) && <span>Meta: {item.targetText || item.targetNumeric}{item.unit ? ` ${item.unit}` : ''}</span>}</div>
                          {item.projectName && <p className="portfolio-context">Proyecto: {item.projectName}</p>}
                          {item.notes && <p><RichText value={item.notes} /></p>}
                          {mode === 'edit' && canEdit && <footer><button type="button" title="Editar indicador" onClick={() => editIndicator(item)}><Edit3 size={14} /></button><button className="danger" type="button" title="Eliminar indicador" onClick={() => setIndicatorPendingDeletion(item)}><Trash2 size={14} /></button></footer>}
                        </article>
                      ))}
                    </div>
                    {!indicators.length && <p className="portfolio-empty">Todavía no hay indicadores cargados.</p>}
                  </>
                )}

                {section.key === 'milestones' && (
                  <>
                    {mode === 'edit' && canEdit && <button className="secondary-button portfolio-add" type="button" onClick={() => editMilestone()}><Plus size={15} /> Nuevo hito</button>}
                    <div className="milestone-list">
                      {milestones.map((item) => (
                        <article className={`milestone-row tone-${statusTone(item.status)}`} key={item.id}>
                          <time>{item.dueDate ? formatDate(item.dueDate) : 'Sin fecha'}</time>
                          <div><h3>{item.name}</h3><p>{[item.owner, item.projectName || item.projectTitle].filter(Boolean).join(' · ')}</p>{item.detail && <small><RichText value={item.detail} /></small>}</div>
                          <span>{item.status || 'Sin estado'}</span>
                          {mode === 'edit' && canEdit && <div className="portfolio-row-actions"><button type="button" title="Editar hito" onClick={() => editMilestone(item)}><Edit3 size={14} /></button><button className="danger" type="button" title="Eliminar hito" onClick={() => setMilestonePendingDeletion(item)}><Trash2 size={14} /></button></div>}
                        </article>
                      ))}
                    </div>
                    {!milestones.length && <p className="portfolio-empty">Todavía no hay hitos cargados.</p>}
                  </>
                )}

                {section.key === 'budget' && (
                  <>
                    {mode === 'edit' && canEdit && <button className="secondary-button portfolio-add" type="button" onClick={() => editBudget()}><Plus size={15} /> Nuevo registro</button>}
                    <div className="budget-view">
                      {budgets.map((item) => {
                        const budgeted = item.budgeted ?? 0
                        const executed = item.executed ?? 0
                        const percent = budgeted > 0 ? Math.min(100, Math.max(0, (executed / budgeted) * 100)) : 0
                        return (
                          <article className="budget-row" key={item.id}>
                            <div><small>{item.period || item.areaName}</small><h3>{item.concept}</h3>{item.detail && <p><RichText value={item.detail} /></p>}</div>
                            <div className="budget-values"><span><small>Presupuestado</small><strong>{formatMoney(item.budgeted)}</strong></span><span><small>Ejecutado</small><strong>{formatMoney(item.executed)}</strong></span></div>
                            <div className="budget-track" aria-label={`${percent.toFixed(1)}% ejecutado`}><span style={{ width: `${percent}%` }} /></div>
                            <b>{percent.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%</b>
                            {mode === 'edit' && canEdit && <div className="portfolio-row-actions"><button type="button" title="Editar presupuesto" onClick={() => editBudget(item)}><Edit3 size={14} /></button><button className="danger" type="button" title="Eliminar presupuesto" onClick={() => setBudgetPendingDeletion(item)}><Trash2 size={14} /></button></div>}
                          </article>
                        )
                      })}
                    </div>
                    {!budgets.length && <p className="portfolio-empty">Todavía no hay registros presupuestarios cargados.</p>}
                  </>
                )}
              </div>
            )}
          </section>
        )
      })}

      {indicatorDraft && (
        <div className="modal-backdrop" role="presentation">
          <form className="compact-editor" role="dialog" aria-modal="true" aria-labelledby="indicator-editor-title" onSubmit={submitIndicator}>
            <header><div><small>Indicadores</small><h2 id="indicator-editor-title">{indicatorDraft.id ? 'Editar indicador' : 'Nuevo indicador'}</h2></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={() => setIndicatorDraft(null)}><X size={17} /></button></header>
            <div className="compact-form-grid">
              <label className="span-2">Nombre<input value={indicatorDraft.name} onChange={(event) => setIndicatorDraft({ ...indicatorDraft, name: event.target.value })} required /></label>
              <label>Valor<input value={indicatorDraft.valueText} onChange={(event) => setIndicatorDraft({ ...indicatorDraft, valueText: event.target.value })} /></label>
              <label>Meta<input value={indicatorDraft.targetText} onChange={(event) => setIndicatorDraft({ ...indicatorDraft, targetText: event.target.value })} /></label>
              <label>Unidad<input value={indicatorDraft.unit} onChange={(event) => setIndicatorDraft({ ...indicatorDraft, unit: event.target.value })} /></label>
              <label>Período<input value={indicatorDraft.period} onChange={(event) => setIndicatorDraft({ ...indicatorDraft, period: event.target.value })} /></label>
              <label>Estado<select value={indicatorDraft.status} onChange={(event) => setIndicatorDraft({ ...indicatorDraft, status: event.target.value })}><option>En curso</option><option>En observación</option><option>Alerta</option><option>Finalizado</option></select></label>
              <label>Proyecto relacionado<select value={indicatorDraft.projectId} onChange={(event) => setIndicatorDraft({ ...indicatorDraft, projectId: event.target.value })}><option value="">Sin proyecto específico</option>{projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <RichTextEditor className="span-2" label="Notas" value={indicatorDraft.notes} onChange={(value) => setIndicatorDraft({ ...indicatorDraft, notes: value })} />
            </div>
            <footer><button className="secondary-button" type="button" onClick={() => setIndicatorDraft(null)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Guardando…' : 'Guardar indicador'}</button></footer>
          </form>
        </div>
      )}

      {milestoneDraft && (
        <div className="modal-backdrop" role="presentation">
          <form className="compact-editor" role="dialog" aria-modal="true" aria-labelledby="milestone-editor-title" onSubmit={submitMilestone}>
            <header><div><small>Hitos</small><h2 id="milestone-editor-title">{milestoneDraft.id ? 'Editar hito' : 'Nuevo hito'}</h2></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={() => setMilestoneDraft(null)}><X size={17} /></button></header>
            <div className="compact-form-grid">
              <label className="span-2">Hito<input value={milestoneDraft.name} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, name: event.target.value })} required /></label>
              <label>Política / Proyecto<input value={milestoneDraft.projectTitle} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, projectTitle: event.target.value })} /></label>
              <label>Fecha de inicio<input type="date" value={milestoneDraft.startDate} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, startDate: event.target.value })} /></label>
              <label>Fecha de fin<input type="date" value={milestoneDraft.dueDate} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, dueDate: event.target.value })} /></label>
              <label>Estado<select value={milestoneDraft.status} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, status: event.target.value })}><option>Pendiente</option><option>En curso</option><option>Cumplido</option><option>Alerta</option></select></label>
              <label>Responsable<input value={milestoneDraft.owner} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, owner: event.target.value })} /></label>
              <label>Proyecto relacionado<select value={milestoneDraft.projectId} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, projectId: event.target.value })}><option value="">Sin proyecto específico</option>{projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label>Alcance<input value={milestoneDraft.scope} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, scope: event.target.value })} /></label>
              <label>Eje<input value={milestoneDraft.axis} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, axis: event.target.value })} /></label>
              <label>Apto JGM/JM<input value={milestoneDraft.jgmEligible} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, jgmEligible: event.target.value })} /></label>
              <RichTextEditor className="span-2" label="Detalle" value={milestoneDraft.detail} onChange={(value) => setMilestoneDraft({ ...milestoneDraft, detail: value })} />
            </div>
            <footer><button className="secondary-button" type="button" onClick={() => setMilestoneDraft(null)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Guardando…' : 'Guardar hito'}</button></footer>
          </form>
        </div>
      )}

      {budgetDraft && (
        <div className="modal-backdrop" role="presentation">
          <form className="compact-editor" role="dialog" aria-modal="true" aria-labelledby="budget-editor-title" onSubmit={submitBudget}>
            <header><div><small>Presupuesto</small><h2 id="budget-editor-title">{budgetDraft.id ? 'Editar registro' : 'Nuevo registro'}</h2></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={() => setBudgetDraft(null)}><X size={17} /></button></header>
            <div className="compact-form-grid">
              <label className="span-2">Concepto<input value={budgetDraft.concept} onChange={(event) => setBudgetDraft({ ...budgetDraft, concept: event.target.value })} required /></label>
              <label>Período<input value={budgetDraft.period} onChange={(event) => setBudgetDraft({ ...budgetDraft, period: event.target.value })} /></label>
              <label>Presupuestado<input inputMode="decimal" value={budgetDraft.budgeted} onChange={(event) => setBudgetDraft({ ...budgetDraft, budgeted: event.target.value })} /></label>
              <label>Ejecutado<input inputMode="decimal" value={budgetDraft.executed} onChange={(event) => setBudgetDraft({ ...budgetDraft, executed: event.target.value })} /></label>
              <RichTextEditor className="span-2" label="Detalle" value={budgetDraft.detail} onChange={(value) => setBudgetDraft({ ...budgetDraft, detail: value })} />
            </div>
            <footer><button className="secondary-button" type="button" onClick={() => setBudgetDraft(null)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}><Save size={15} /> {saving ? 'Guardando…' : 'Guardar presupuesto'}</button></footer>
          </form>
        </div>
      )}
      {indicatorPendingDeletion && <ConfirmDeleteDialog title="Eliminar indicador" description={`Vas a eliminar “${indicatorPendingDeletion.name}”. Esta acción no se puede deshacer.`} onCancel={() => setIndicatorPendingDeletion(null)} onConfirm={() => { void removeIndicator(indicatorPendingDeletion) }} />}
      {milestonePendingDeletion && <ConfirmDeleteDialog title="Eliminar hito" description={`Vas a eliminar “${milestonePendingDeletion.name}”. Esta acción no se puede deshacer.`} onCancel={() => setMilestonePendingDeletion(null)} onConfirm={() => { void removeMilestone(milestonePendingDeletion) }} />}
      {budgetPendingDeletion && <ConfirmDeleteDialog title="Eliminar presupuesto" description={`Vas a eliminar “${budgetPendingDeletion.concept}”. Esta acción no se puede deshacer.`} onCancel={() => setBudgetPendingDeletion(null)} onConfirm={() => { void removeBudget(budgetPendingDeletion) }} />}
    </section>
  )
}

