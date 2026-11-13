import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Link2, Plus, Save, Trash2, X } from 'lucide-react'
import { areas } from '../../data/demo'
import { inclusiveDays } from '../../domain/projectStatus'
import type { ManualProjectStatus, Project, ProjectUpdate } from '../../domain/types'
import { RichTextEditor } from '../../components/RichText'
import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog'
import { EducationSystemEditor } from '../../components/EducationSystemOverview'
import { getEducationSystemData, isEducationSystemProjectName, setEducationSystemData } from '../../components/educationSystemData'
import {
  createRiskTableId,
  getProjectRiskTable,
  isClosureRiskProjectName,
  setProjectRiskTable,
  type ProjectRiskTableData,
} from '../../components/ProjectRiskTable'
import { saveProjectBundle } from './api'

type EditorKind = 'project' | 'subproject'
type MechiValue = '' | 'true' | 'false'

interface UpdateDraft {
  rowKey: string
  id?: string
  date: string
  type: ProjectUpdate['type']
  detail: string
  attachmentUrl: string
  attachmentName: string
  deleted?: boolean
}

interface StepDraft {
  rowKey: string
  id?: string
  task: string
  ownersText: string
  dueDate: string
  deleted?: boolean
}

interface ProjectEditorProps {
  project?: Project
  initialAreaKey: string
  initialParentId?: string
  allProjects: Project[]
  allowedAreaKeys?: string[]
  onClose: () => void
  onSaved: (projectId: string) => Promise<void> | void
}

const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const rowKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
const blankUpdate = (): UpdateDraft => ({
  rowKey: rowKey(),
  date: today(),
  type: 'Información',
  detail: '',
  attachmentUrl: '',
  attachmentName: '',
})
const blankStep = (): StepDraft => ({ rowKey: rowKey(), task: '', ownersText: '', dueDate: '' })

function isSinigepName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').includes('sinigep')
}

function saveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const message = typeof value.message === 'string' ? value.message : ''
    const details = typeof value.details === 'string' ? value.details : ''
    const hint = typeof value.hint === 'string' ? value.hint : ''
    const code = typeof value.code === 'string' ? value.code : ''
    const context = [details, hint, code ? `Código: ${code}` : ''].filter(Boolean).join(' · ')
    if (message) return context ? `${message} (${context})` : message
  }
  return 'No se pudieron guardar los cambios. Verificá tu conexión e intentá nuevamente.'
}

function flattenProjects(projects: Project[]): Project[] {
  return projects.flatMap((project) => [project, ...flattenProjects(project.children)])
}

export function ProjectEditor({
  project,
  initialAreaKey,
  initialParentId,
  allProjects,
  allowedAreaKeys,
  onClose,
  onSaved,
}: ProjectEditorProps) {
  const [kind, setKind] = useState<EditorKind>('project')
  const [areaKey, setAreaKey] = useState(initialAreaKey)
  const [parentId, setParentId] = useState('')
  const [name, setName] = useState('')
  const [dgGo, setDgGo] = useState('')
  const [priority, setPriority] = useState('')
  const [manualStatus, setManualStatus] = useState<ManualProjectStatus | ''>('')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedEnd, setPlannedEnd] = useState('')
  const [rescheduledStart, setRescheduledStart] = useState('')
  const [rescheduledEnd, setRescheduledEnd] = useState('')
  const [objective, setObjective] = useState('')
  const [scope, setScope] = useState('')
  const [justification, setJustification] = useState('')
  const [notes, setNotes] = useState('')
  const [briefUrl, setBriefUrl] = useState('')
  const [budget, setBudget] = useState('')
  const [mechi, setMechi] = useState<MechiValue>('')
  const [visibleAreaKeys, setVisibleAreaKeys] = useState<string[]>([])
  const [visualMetrics, setVisualMetrics] = useState<Record<string, unknown>>({})
  const [updates, setUpdates] = useState<UpdateDraft[]>([blankUpdate()])
  const [nextSteps, setNextSteps] = useState<StepDraft[]>([blankStep()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pendingRowDeletion, setPendingRowDeletion] = useState<{ kind: 'update' | 'step'; key: string } | null>(null)
  const dialogRef=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement;dialogRef.current?.showModal();return()=>{dialogRef.current?.close();previous?.focus();};},[]);

  useEffect(() => {
    const nextKind: EditorKind = project?.kind ?? (initialParentId ? 'subproject' : 'project')
    setKind(nextKind)
    setAreaKey(project?.areaKey || initialAreaKey || areas[0].key)
    setParentId(project?.parentId || initialParentId || '')
    setName(project?.name || '')
    setDgGo(project?.owner === 'Sin definir' ? '' : project?.owner || '')
    setPriority(project?.priority || '')
    setManualStatus(project?.manualStatus || '')
    setPlannedStart(project?.plannedStart || '')
    setPlannedEnd(project?.plannedEnd || '')
    setRescheduledStart(project?.rescheduledStart || '')
    setRescheduledEnd(project?.rescheduledEnd || '')
    setObjective(project?.objective || '')
    setScope(project?.scope || '')
    setJustification(project?.justification || '')
    setNotes(project?.notes || '')
    setBriefUrl(project?.briefUrl || '')
    setBudget(project?.budget || '')
    setMechi(project?.mechi === undefined ? '' : String(project.mechi) as MechiValue)
    setVisibleAreaKeys(project?.areaKeys.length ? project.areaKeys : [project?.areaKey || initialAreaKey || areas[0].key])
    const nextVisualMetrics = project?.visualMetrics || {}
    setVisualMetrics(isSinigepName(project?.name || '')
      ? { ...nextVisualMetrics, type: 'sinigep' }
      : isEducationSystemProjectName(project?.name || '')
        ? setEducationSystemData(nextVisualMetrics, getEducationSystemData(nextVisualMetrics))
        : nextVisualMetrics)
    setUpdates([
      ...(project?.updates.map((update) => ({
        rowKey: update.id,
        id: update.id,
        date: update.date,
        type: update.type,
        detail: update.detail,
        attachmentUrl: update.attachmentUrl || '',
        attachmentName: update.attachmentName || '',
      })) || []),
      blankUpdate(),
    ])
    setNextSteps([
      ...(project?.nextSteps.filter((step) => !step.resolved).map((step) => ({
        rowKey: step.id,
        id: step.id,
        task: step.task,
        ownersText: step.owners.join(', '),
        dueDate: step.dueDate,
      })) || []),
      blankStep(),
    ])
    setError('')
  }, [initialAreaKey, initialParentId, project])

  const parentOptions = useMemo(
    () => flattenProjects(allProjects).filter((candidate) => (
      candidate.kind === 'project' && candidate.areaKeys.includes(areaKey) && candidate.id !== project?.id
    )),
    [allProjects, areaKey, project?.id],
  )

  const plannedDays = inclusiveDays(plannedStart, plannedEnd)
  const rescheduledDays = inclusiveDays(rescheduledStart, rescheduledEnd)
  const isSinigepProject = isSinigepName(name) || visualMetrics.type === 'sinigep'
  const isEducationSystemProject = isEducationSystemProjectName(name) || Boolean(visualMetrics.educationSystem)
  const educationSystemData = getEducationSystemData(visualMetrics)
  const isClosureRiskProject = isClosureRiskProjectName(name) || Boolean(visualMetrics.closureRiskTable)
  const riskTable = getProjectRiskTable(visualMetrics, true)

  const updateRiskTable = (nextTable: ProjectRiskTableData) => {
    setVisualMetrics((current) => setProjectRiskTable(current, nextTable))
  }

  const updateRiskTableColumn = (columnId: string, label: string) => {
    updateRiskTable({
      ...riskTable,
      columns: riskTable.columns.map((column) => column.id === columnId ? { ...column, label } : column),
    })
  }

  const addRiskTableColumn = () => {
    if (riskTable.columns.length >= 6) return
    const id = createRiskTableId('column')
    updateRiskTable({
      columns: [...riskTable.columns, { id, label: `Columna ${riskTable.columns.length + 1}` }],
      rows: riskTable.rows.map((row) => ({ ...row, cells: { ...row.cells, [id]: '' } })),
    })
  }

  const removeRiskTableColumn = (columnId: string) => {
    if (riskTable.columns.length <= 1) return
    updateRiskTable({
      columns: riskTable.columns.filter((column) => column.id !== columnId),
      rows: riskTable.rows.map((row) => ({
        ...row,
        cells: Object.fromEntries(Object.entries(row.cells).filter(([key]) => key !== columnId)),
      })),
    })
  }

  const addRiskTableRow = () => {
    updateRiskTable({
      ...riskTable,
      rows: [...riskTable.rows, {
        id: createRiskTableId('row'),
        cells: Object.fromEntries(riskTable.columns.map((column) => [column.id, ''])),
      }],
    })
  }

  const updateRiskTableCell = (rowId: string, columnId: string, value: string) => {
    updateRiskTable({
      ...riskTable,
      rows: riskTable.rows.map((row) => row.id === rowId ? { ...row, cells: { ...row.cells, [columnId]: value } } : row),
    })
  }

  const removeRiskTableRow = (rowId: string) => {
    const rows = riskTable.rows.filter((row) => row.id !== rowId)
    updateRiskTable({
      ...riskTable,
      rows: rows.length ? rows : [{ id: createRiskTableId('row'), cells: Object.fromEntries(riskTable.columns.map((column) => [column.id, ''])) }],
    })
  }

  const selectableAreas = useMemo(
    () => areas.filter((area) => !allowedAreaKeys || allowedAreaKeys.includes(area.key) || visibleAreaKeys.includes(area.key) || area.key === project?.areaKey),
    [allowedAreaKeys, project?.areaKey, visibleAreaKeys],
  )

  const changePrimaryArea = (nextAreaKey: string) => {
    setAreaKey(nextAreaKey)
    setParentId('')
    setVisibleAreaKeys((current) => current.includes(nextAreaKey) ? current : [...current, nextAreaKey])
  }

  const toggleVisibleArea = (targetAreaKey: string) => {
    setVisibleAreaKeys((current) => {
      if (targetAreaKey === areaKey) return current.includes(targetAreaKey) ? current : [...current, targetAreaKey]
      return current.includes(targetAreaKey)
        ? current.filter((key) => key !== targetAreaKey)
        : [...current, targetAreaKey]
    })
  }

  const updateUpdateRow = (key: string, field: keyof UpdateDraft, value: string) => {
    setUpdates((current) => {
      const next = current.map((row) => row.rowKey === key ? { ...row, [field]: value } : row)
      const last = next.at(-1)
      if (last && (last.detail.trim() || last.attachmentUrl.trim())) next.push(blankUpdate())
      return next
    })
  }

  const updateStepRow = (key: string, field: keyof StepDraft, value: string) => {
    setNextSteps((current) => {
      const next = current.map((row) => row.rowKey === key ? { ...row, [field]: value } : row)
      const last = next.at(-1)
      if (last?.task.trim()) next.push(blankStep())
      return next
    })
  }

  const removeUpdate = (key: string) => {
    setUpdates((current) => {
      const target = current.find((row) => row.rowKey === key)
      const next = target?.id
        ? current.map((row) => row.rowKey === key ? { ...row, deleted: true } : row)
        : current.filter((row) => row.rowKey !== key)
      return next.some((row) => !row.deleted && !row.detail.trim()) ? next : [...next, blankUpdate()]
    })
  }

  const removeStep = (key: string) => {
    setNextSteps((current) => {
      const target = current.find((row) => row.rowKey === key)
      const next = target?.id
        ? current.map((row) => row.rowKey === key ? { ...row, deleted: true } : row)
        : current.filter((row) => row.rowKey !== key)
      return next.some((row) => !row.deleted && !row.task.trim()) ? next : [...next, blankStep()]
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (!name.trim()) {
      setError('El nombre del proyecto es obligatorio.')
      return
    }
    if (kind === 'subproject' && !parentId) {
      setError('Seleccioná el proyecto padre.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const changedManualStatus = (project?.manualStatus || '') !== manualStatus
      const changedVisualMetrics = JSON.stringify(project?.visualMetrics || {}) !== JSON.stringify(visualMetrics)
      const projectId = await saveProjectBundle({
        project: {
          id: project?.id,
          parentId: kind === 'subproject' ? parentId : undefined,
          version: project?.version,
          areaKey,
          name: name.trim(),
          dgGo: dgGo.trim(),
          priority: priority.trim(),
          progress: project?.progress ?? 0,
          plannedStart,
          plannedEnd,
          rescheduledStart,
          rescheduledEnd,
          objective: objective.trim(),
          scope: scope.trim(),
          justification: justification.trim(),
          notes: notes.trim(),
          briefUrl: briefUrl.trim(),
          budget: budget.trim(),
          mechi: mechi === '' ? undefined : mechi === 'true',
          competencyAreas: visibleAreaKeys.filter((key) => key !== areaKey),
          sortOrder: project?.sortOrder ?? 0,
          visualMetrics: changedVisualMetrics ? visualMetrics : undefined,
          manualStatus: changedManualStatus ? manualStatus || null : undefined,
        },
        updates: updates.filter((row) => {const previous=project?.updates.find(entry=>entry.id===row.id);return row.deleted||Boolean(row.detail.trim())&&(!previous||previous.detail!==row.detail||previous.date!==row.date||previous.type!==row.type||(previous.attachmentUrl||'')!==row.attachmentUrl||(previous.attachmentName||'')!==row.attachmentName);}).map((row) => ({
          id: row.id,
          date: row.date,
          type: row.type,
          detail: row.detail,
          ...(()=>{const previous=project?.updates.find(entry=>entry.id===row.id);return !previous||(previous.attachmentUrl||'')!==row.attachmentUrl||(previous.attachmentName||'')!==row.attachmentName?{attachmentUrl:row.attachmentUrl,attachmentName:row.attachmentName}:{};})(),
          deleted: row.deleted,
        })),
        nextSteps: nextSteps.filter((row) => {const previous=project?.nextSteps.find(entry=>entry.id===row.id);return row.deleted||Boolean(row.task.trim())&&(!previous||previous.task!==row.task||(previous.dueDate||'')!==row.dueDate||previous.owners.join(', ')!==row.ownersText);}).map((row) => ({
          id: row.id,
          task: row.task,
          owners: row.ownersText.split(',').map((value) => value.trim()).filter(Boolean),
          dueDate: row.dueDate,
          deleted: row.deleted,
        })),
      })
      await onSaved(projectId)
      onClose()
    } catch (saveError) {
      setError(saveErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
      <dialog ref={dialogRef} className="editor-modal form-dialog" aria-labelledby="project-editor-title" onCancel={event=>{if(saving)event.preventDefault();else onClose();}}>
        <header className="editor-header">
          <div>
            <span>DU EQUIPO</span>
            <h2 id="project-editor-title">{project ? 'Editar proyecto' : kind === 'subproject' ? 'Crear subproyecto' : 'Crear proyecto'}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose} disabled={saving}><X size={18} /></button>
        </header>

        <form className="editor-form" onSubmit={handleSubmit}>
          <section className="editor-section">
            <h3>Datos del proyecto</h3>
            <div className="form-grid form-grid-4">
              <label>Tipo
                <select value={kind} onChange={(event) => { const value = event.target.value as EditorKind; setKind(value); if (value === 'project') setParentId('') }}>
                  <option value="project">Proyecto</option>
                  <option value="subproject">Subproyecto</option>
                </select>
              </label>
              <label>Área
                <select value={areaKey} onChange={(event) => changePrimaryArea(event.target.value)}>
                  {areas.filter((area) => !allowedAreaKeys || allowedAreaKeys.includes(area.key) || area.key === project?.areaKey).map((area) => <option key={area.key} value={area.key} disabled={Boolean(allowedAreaKeys && !allowedAreaKeys.includes(area.key))}>{area.number}. {area.name}</option>)}
                </select>
              </label>
              {kind === 'subproject' && (
                <label className="span-2">Proyecto padre
                  <select value={parentId} onChange={(event) => setParentId(event.target.value)} required>
                    <option value="">Seleccionar proyecto</option>
                    {parentOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                  </select>
                </label>
              )}
              <label className={kind === 'project' ? 'span-2' : 'span-3'}>Nombre del Proyecto/Hitos
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label>DG/GO
                <input value={dgGo} onChange={(event) => setDgGo(event.target.value)} />
              </label>
              <label>Prioridad
                <input value={priority} onChange={(event) => setPriority(event.target.value)} />
              </label>
              <label>Estado del {kind === 'subproject' ? 'subproyecto' : 'proyecto'}
                <select value={manualStatus} onChange={(event) => setManualStatus(event.target.value as ManualProjectStatus | '')}>
                  <option value="">Automático</option>
                  <option value="alert">Alerta/Bloqueo (rojo)</option>
                  <option value="pending">Pendiente (amarillo)</option>
                  <option value="active">En curso (verde)</option>
                  <option value="finished">Finalizado (azul)</option>
                </select>
              </label>
              <label>Mechi
                <select value={mechi} onChange={(event) => setMechi(event.target.value as MechiValue)}>
                  <option value="">Sin definir</option><option value="true">Tick</option><option value="false">Cruz</option>
                </select>
              </label>
              <fieldset className="span-4 area-visibility-field">
                <legend>Dónde aparece</legend>
                <div className="area-visibility-grid">
                  {selectableAreas.map((area) => (
                    <label key={area.key}>
                      <input
                        type="checkbox"
                        aria-label={`Mostrar en ${area.name}`}
                        checked={visibleAreaKeys.includes(area.key) || area.key === areaKey}
                        disabled={area.key === areaKey || Boolean(allowedAreaKeys && !allowedAreaKeys.includes(area.key) && !visibleAreaKeys.includes(area.key))}
                        onChange={() => toggleVisibleArea(area.key)}
                      />
                      <span><b>{area.number}</b>{area.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>

          <section className="editor-section">
            <h3><CalendarDays size={17} /> Planificación</h3>
            <div className="date-groups">
              <fieldset>
                <legend>Planificación original</legend>
                <label>Inicio planificado<input type="date" value={plannedStart} onChange={(event) => setPlannedStart(event.target.value)} /></label>
                <label>Fin planificado<input type="date" value={plannedEnd} onChange={(event) => setPlannedEnd(event.target.value)} /></label>
                <label>Días planificados<input value={plannedDays ?? ''} readOnly aria-label="Días planificados" /></label>
              </fieldset>
              <fieldset>
                <legend>Reprogramación opcional</legend>
                <label>Inicio reprogramado<input type="date" value={rescheduledStart} onChange={(event) => setRescheduledStart(event.target.value)} /></label>
                <label>Fin reprogramado<input type="date" value={rescheduledEnd} onChange={(event) => setRescheduledEnd(event.target.value)} /></label>
                <label>Días reprogramados<input value={rescheduledDays ?? ''} readOnly aria-label="Días reprogramados" /></label>
              </fieldset>
            </div>
          </section>

          <section className="editor-section">
            <h3>Contenido</h3>
            <div className="form-grid form-grid-2">
              <RichTextEditor label="Objetivo/Resultado" value={objective} onChange={setObjective} />
              <RichTextEditor label="Alcance" value={scope} onChange={setScope} />
              <RichTextEditor label="Justificación" value={justification} onChange={setJustification} />
              <RichTextEditor label="Status/Notas" value={notes} onChange={setNotes} />
              <label><Link2 size={14} /> Brief/Archivo (enlace)<input type="url" value={briefUrl} onChange={(event) => setBriefUrl(event.target.value)} placeholder="https://" /></label>
              <label>Presupuesto<input value={budget} onChange={(event) => setBudget(event.target.value)} /></label>
            </div>
          </section>

          {isSinigepProject && (
            <section className="editor-section">
              <div className="section-heading-copy"><h3>Avance de declaraciones juradas</h3></div>
              <label className="sinigep-date-field">Fecha de medición
                <input
                  type="date"
                  value={typeof visualMetrics.measurementDate === 'string' ? visualMetrics.measurementDate : ''}
                  onChange={(event) => setVisualMetrics({ ...visualMetrics, type: 'sinigep', measurementDate: event.target.value })}
                />
              </label>
              <div className="sinigep-editor-grid">
                {[
                  ['ddjj', 'DDJJ completas'],
                  ['inicial', 'Inicial'],
                  ['primaria', 'Primaria'],
                  ['secundaria', 'Secundaria'],
                  ['superior', 'Superior'],
                ].map(([key, label]) => {
                  const values = visualMetrics.values && typeof visualMetrics.values === 'object' ? visualMetrics.values as Record<string, unknown> : {}
                  const counts = visualMetrics.counts && typeof visualMetrics.counts === 'object' ? visualMetrics.counts as Record<string, unknown> : {}
                  const tones = visualMetrics.tones && typeof visualMetrics.tones === 'object' ? visualMetrics.tones as Record<string, unknown> : {}
                  const updateMetric = (group: 'values' | 'counts' | 'tones', value: string | number) => {
                    const current = visualMetrics[group] && typeof visualMetrics[group] === 'object' ? visualMetrics[group] as Record<string, unknown> : {}
                    setVisualMetrics({ ...visualMetrics, type: 'sinigep', measurementDate: today(), [group]: { ...current, [key]: value } })
                  }
                  return (
                    <fieldset key={key}>
                      <legend>{label}</legend>
                      <label>Cantidad<input type="number" min="0" value={String(counts[key] ?? '')} onChange={(event) => updateMetric('counts', Number(event.target.value))} /></label>
                      <label>Porcentaje<input type="number" min="0" max="100" step="0.01" value={String(values[key] ?? '')} onChange={(event) => updateMetric('values', Number(event.target.value))} /></label>
                      <label>Semáforo<select value={tones[key] === 'red' ? 'red' : 'green'} onChange={(event) => updateMetric('tones', event.target.value)}><option value="green">Verde</option><option value="red">Rojo</option></select></label>
                    </fieldset>
                  )
                })}
              </div>
            </section>
          )}

          {isEducationSystemProject && (
            <section className="editor-section education-system-editor-section">
              <div className="section-heading-copy">
                <h3>Universo del Sistema Educativo</h3>
                <p>Usá los separadores tal como deben mostrarse.</p>
              </div>
              <EducationSystemEditor data={educationSystemData} onChange={(data) => setVisualMetrics((current) => setEducationSystemData(current, data))} />
            </section>
          )}

          {isClosureRiskProject && (
            <section className="editor-section risk-table-editor-section">
              <div className="section-heading-copy">
                <h3>Cuadro de seguimiento</h3>
                
              </div>
              <div className="risk-table-editor-scroll">
                <table className="risk-table-editor">
                  <thead>
                    <tr>
                      {riskTable.columns.map((column, index) => (
                        <th key={column.id}>
                          <div>
                            <input aria-label={`Encabezado ${index + 1}`} value={column.label} onChange={(event) => updateRiskTableColumn(column.id, event.target.value)} />
                            {riskTable.columns.length > 1 && <button type="button" title="Eliminar columna" aria-label={`Eliminar columna ${column.label || index + 1}`} onClick={() => removeRiskTableColumn(column.id)}><Trash2 size={14} /></button>}
                          </div>
                        </th>
                      ))}
                      <th className="risk-table-actions-column"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {riskTable.rows.map((row, rowIndex) => (
                      <tr key={row.id}>
                        {riskTable.columns.map((column, columnIndex) => (
                          <td key={column.id}>
                            <textarea
                              aria-label={`Fila ${rowIndex + 1}, ${column.label || `columna ${columnIndex + 1}`}`}
                              rows={2}
                              value={row.cells[column.id] || ''}
                              onChange={(event) => updateRiskTableCell(row.id, column.id, event.target.value)}
                            />
                          </td>
                        ))}
                        <td className="risk-table-actions-column"><button type="button" title="Eliminar fila" aria-label={`Eliminar fila ${rowIndex + 1}`} onClick={() => removeRiskTableRow(row.id)}><Trash2 size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="risk-table-editor-actions">
                <button className="secondary-button" type="button" onClick={addRiskTableRow}><Plus size={15} /> Agregar fila</button>
                <button className="secondary-button" type="button" onClick={addRiskTableColumn} disabled={riskTable.columns.length >= 6}><Plus size={15} /> Agregar columna</button>
              </div>
            </section>
          )}

          <section className="editor-section">
            <div className="section-heading-copy"><h3>Actualizaciones, alertas y pendientes</h3><p>Al completar la última fila se habilita otra automáticamente.</p></div>
            <div className="editable-rows">
              {updates.filter((row) => !row.deleted).map((row) => (
                <div className="editable-row update-row" key={row.rowKey}>
                  <label>Fecha<input type="date" value={row.date} onChange={(event) => updateUpdateRow(row.rowKey, 'date', event.target.value)} /></label>
                  <label>Tipo<select value={row.type} onChange={(event) => updateUpdateRow(row.rowKey, 'type', event.target.value)}>
                    <option>Avance</option><option>Información</option><option>Alerta/Bloqueo</option><option>Pendiente</option>
                  </select></label>
                  <RichTextEditor className="row-detail" label="Detalle" value={row.detail} onChange={(value) => updateUpdateRow(row.rowKey, 'detail', value)} />
                  <label>Archivo<input type="url" value={row.attachmentUrl} onChange={(event) => updateUpdateRow(row.rowKey, 'attachmentUrl', event.target.value)} placeholder="https://" /></label>
                  {(row.id || row.detail || row.attachmentUrl) && <button className="row-delete" type="button" title="Eliminar fila" aria-label="Eliminar actualización" onClick={() => setPendingRowDeletion({ kind: 'update', key: row.rowKey })}><Trash2 size={16} /></button>}
                </div>
              ))}
            </div>
          </section>

          <section className="editor-section">
            <div className="section-heading-copy"><h3>Próximos pasos</h3><p>Podés indicar uno o varios responsables separados por coma.</p></div>
            <div className="editable-rows">
              {nextSteps.filter((row) => !row.deleted).map((row) => (
                <div className="editable-row step-row" key={row.rowKey}>
                  <RichTextEditor className="row-detail" label="Tarea" value={row.task} onChange={(value) => updateStepRow(row.rowKey, 'task', value)} />
                  <label>Responsables<input value={row.ownersText} onChange={(event) => updateStepRow(row.rowKey, 'ownersText', event.target.value)} /></label>
                  <label>Vencimiento<input type="date" value={row.dueDate} onChange={(event) => updateStepRow(row.rowKey, 'dueDate', event.target.value)} /></label>
                  {(row.id || row.task) && <button className="row-delete" type="button" title="Eliminar fila" aria-label="Eliminar próximo paso" onClick={() => setPendingRowDeletion({ kind: 'step', key: row.rowKey })}><Trash2 size={16} /></button>}
                </div>
              ))}
            </div>
          </section>

          {error && <div className="editor-error" role="alert">{error}</div>}
          <footer className="editor-footer">
            <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="primary-button" type="submit" disabled={saving}><Save size={16} /> {saving ? 'Guardando…' : project ? 'Guardar cambios' : 'Guardar proyecto'}</button>
          </footer>
        </form>
        {pendingRowDeletion && <ConfirmDeleteDialog title={pendingRowDeletion.kind === 'update' ? 'Eliminar actualización' : 'Eliminar próximo paso'} description={`Vas a eliminar esta ${pendingRowDeletion.kind === 'update' ? 'actualización' : 'tarea'}. La eliminación se aplicará al guardar los cambios del proyecto.`} onCancel={() => setPendingRowDeletion(null)} onConfirm={() => { if (pendingRowDeletion.kind === 'update') removeUpdate(pendingRowDeletion.key); else removeStep(pendingRowDeletion.key); setPendingRowDeletion(null) }} />}
      </dialog>
  )
}

