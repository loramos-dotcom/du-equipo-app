import type { User } from '@supabase/supabase-js'
import type { ManualProjectStatus, Project, ProjectStatus, ProjectUpdate } from '../../domain/types'
import { supabase } from '../../lib/supabase'
import { normalizeText, normalizeTextTree } from '../../lib/text'

type DatabaseRelation<T> = T | T[] | null | undefined

interface DatabaseArea {
  area_key: string
  number: number
  name: string
}

export interface DatabaseProject {
  id: string
  parent_id: string | null
  kind: 'project' | 'subproject'
  version: number | string
  source_key: string | null
  name: string
  dg_go: string | null
  priority: string | null
  scope: string | null
  justification: string | null
  notes: string | null
  objective: string | null
  progress: number | string
  status: ProjectStatus
  manual_status?: ManualProjectStatus | null
  status_label?: string | null
  report_date: string | null
  planned_start: string | null
  planned_end: string | null
  planned_days: number | null
  rescheduled_start: string | null
  rescheduled_end: string | null
  rescheduled_days: number | null
  budget: string | null
  mechi: boolean | null
  brief_url: string | null
  competency_areas: string[] | null
  sort_order: number
  visual_metrics?: Record<string, unknown> | null
  primary_area: DatabaseRelation<DatabaseArea>
  project_areas: DatabaseRelation<{ area: DatabaseRelation<DatabaseArea> }>
  project_updates: DatabaseRelation<{
    id: string
    report_date: string
    update_type: 'Avance' | 'Información' | 'Alerta/Bloqueo' | 'Pendiente'
    detail: string
    resolved: boolean
    attachments: DatabaseRelation<{ name: string; url: string }>
  }>
  next_steps: DatabaseRelation<{
    id: string
    task: string
    due_date: string | null
    resolved: boolean
    next_step_owners: DatabaseRelation<{ owner_label: string | null }>
  }>
  attachments: DatabaseRelation<{ id: string; name: string; url: string; update_id: string | null }>
  dashboard_favorites: DatabaseRelation<{ sort_order: number }>
}

export interface CurrentAccess {
  displayName: string
  email: string
  role: 'viewer' | 'editor' | 'root'
  editableAreaKeys: string[]
  canEditDashboard: boolean
}

function asArray<T>(value: DatabaseRelation<T>): T[] {
  if (Array.isArray(value)) return value
  return value == null ? [] : [value]
}

const mojibakeReplacements: Array<[RegExp, string]> = [
  [/\u00c3\u00a1/g, 'á'], [/\u00c3\u00a9/g, 'é'], [/\u00c3\u00ad/g, 'í'], [/\u00c3\u00b3/g, 'ó'], [/\u00c3\u00ba/g, 'ú'],
  [/\u00c3\u0081/g, 'Á'], [/\u00c3\u0089/g, 'É'], [/\u00c3\u008d/g, 'Í'], [/\u00c3\u0093/g, 'Ó'], [/\u00c3\u009a/g, 'Ú'],
  [/\u00c3\u00b1/g, 'ñ'], [/\u00c3\u0091/g, 'Ñ'], [/\u00c3\u00bc/g, 'ü'], [/\u00c3\u009c/g, 'Ü'],
  [/\u00c2\u00bf/g, '¿'], [/\u00c2\u00a1/g, '¡'], [/\u00c2\u00b0/g, '°'], [/\u00c2\u00b7/g, '·'],
  [/\u00e2\u0080\u00a6/g, '…'], [/\u00e2\u0080\u0093/g, '–'], [/\u00e2\u0080\u0094/g, '—'], [/\u00e2\u0086\u0092/g, '→'],
  [/\u00e2\u0080\u009c/g, '“'], [/\u00e2\u0080\u009d/g, '”'], [/\u00e2\u0080\u0098/g, '‘'], [/\u00e2\u0080\u0099/g, '’'],
]

function cleanText(value: string | null | undefined, fallback = '') {
  if (!value) return fallback
  const repaired = mojibakeReplacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value)
  return normalizeText(repaired, fallback)
}

function resolutionTaskKey(value: string | null | undefined) {
  return cleanText(value).trim().toLocaleLowerCase('es').replace(/\s+/g, ' ')
}

export function mapProject(row: DatabaseProject): Project {
  const area = asArray(row.primary_area)[0] ?? null
  const areaKeys = asArray(row.project_areas)
    .flatMap((relation) => asArray(relation.area))
    .map((relationArea) => relationArea.area_key)
    .filter(Boolean)
  if (area?.area_key && !areaKeys.includes(area.area_key)) areaKeys.unshift(area.area_key)

  const favorites = asArray(row.dashboard_favorites)
  const updates = asArray(row.project_updates)
  const nextSteps = asArray(row.next_steps)
  const resolvedStepTasks = new Set(
    updates
      .filter((update) => update.update_type === 'Avance')
      .map((update) => resolutionTaskKey(update.detail))
      .filter(Boolean),
  )

  return {
    id: row.id,
    sourceFields:{id:row.id,parentId:row.parent_id??undefined,version:Number(row.version),areaKey:area?.area_key??'',name:row.name,dgGo:row.dg_go??'',priority:row.priority??'',progress:Number(row.progress)||0,plannedStart:row.planned_start??'',plannedEnd:row.planned_end??'',rescheduledStart:row.rescheduled_start??'',rescheduledEnd:row.rescheduled_end??'',objective:row.objective??'',scope:row.scope??'',justification:row.justification??'',notes:row.notes??'',briefUrl:row.brief_url??'',budget:row.budget??'',mechi:row.mechi??undefined,competencyAreas:row.competency_areas??[],sortOrder:row.sort_order,manualStatus:row.manual_status??null,visualMetrics:row.visual_metrics??{}},
    parentId: row.parent_id ?? undefined,
    kind: row.kind,
    version: Number(row.version),
    sourceKey: row.source_key ?? undefined,
    visualMetrics: row.visual_metrics && typeof row.visual_metrics === 'object' ? normalizeTextTree(row.visual_metrics) : {},
    areaKey: area?.area_key ?? '',
    areaKeys,
    areaName: area ? `${area.number}. ${cleanText(area.name)}` : 'Sin área',
    name: cleanText(row.name),
    owner: cleanText(row.dg_go, 'Sin definir'),
    priority: cleanText(row.priority),
    objective: cleanText(row.objective),
    scope: cleanText(row.scope),
    justification: cleanText(row.justification),
    notes: cleanText(row.notes),
    progress: Number(row.progress) || 0,
    status: row.status,
    manualStatus: row.manual_status ?? undefined,
    statusLabel: cleanText(row.status_label) || undefined,
    favorite: favorites.length > 0,
    favoriteSortOrder: favorites.length ? Number(favorites[0].sort_order) || 0 : undefined,
    updatedAt: row.report_date || '',
    plannedStart: row.planned_start || '',
    plannedEnd: row.planned_end || '',
    plannedDays: row.planned_days ?? undefined,
    rescheduledStart: row.rescheduled_start || '',
    rescheduledEnd: row.rescheduled_end || '',
    rescheduledDays: row.rescheduled_days ?? undefined,
    budget: cleanText(row.budget) || undefined,
    mechi: row.mechi ?? undefined,
    briefUrl: row.brief_url || undefined,
    competencyAreas: Array.isArray(row.competency_areas) ? row.competency_areas.map((value) => cleanText(value)) : [],
    sortOrder: row.sort_order,
    updates: [...updates]
      .sort((a, b) => b.report_date.localeCompare(a.report_date))
      .map((update) => {
        const attachment = asArray(update.attachments)[0]
        return {
          id: update.id,
          date: update.report_date,
          type: cleanText(update.update_type) as ProjectUpdate['type'],
          detail: cleanText(update.detail),
          resolved: update.resolved,
          attachmentUrl: attachment?.url,
          attachmentName: cleanText(attachment?.name),
        }
      }),
    nextSteps: nextSteps
      // Some earlier database functions registered an advance without exposing
      // the resolved flag immediately. The matching advance remains a reliable
      // completion signal while the canonical flag is refreshed from Supabase.
      .map((step) => {
        const owners = asArray(step.next_step_owners)
          .map((owner) => owner.owner_label)
          .filter((value): value is string => Boolean(value))
        return {
          id: step.id,
          task: cleanText(step.task),
          owner: cleanText(owners.join(', '), 'Sin definir'),
          owners: owners.map((owner) => cleanText(owner)),
          dueDate: step.due_date || '',
          resolved: step.resolved || resolvedStepTasks.has(resolutionTaskKey(step.task)),
        }
      }),
    children: [],
  }
}

export async function fetchProjects(): Promise<Project[]> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase
    .from('projects')
    .select(`
      id,parent_id,source_key,name,dg_go,objective,progress,status,manual_status,status_label,report_date,budget,brief_url,sort_order,visual_metrics,
      kind,version,priority,scope,justification,notes,planned_start,planned_end,planned_days,
      rescheduled_start,rescheduled_end,rescheduled_days,mechi,competency_areas,
      primary_area:areas!projects_primary_area_id_fkey(area_key,number,name),
      project_areas(area:areas!project_areas_area_id_fkey(area_key,number,name)),
      project_updates(id,report_date,update_type,detail,resolved,attachments(name,url)),
      next_steps(id,task,due_date,resolved,next_step_owners(owner_label)),
      attachments(id,name,url,update_id),
      dashboard_favorites(sort_order)
    `)
    .order('sort_order', { ascending: true })

  if (error) throw error
  const rows = (data ?? []) as unknown as DatabaseProject[]
  const mapped = new Map(rows.map((row) => [row.id, mapProject(row)]))
  for (const row of rows) {
    if (!row.parent_id) continue
    const parent = mapped.get(row.parent_id)
    const child = mapped.get(row.id)
    if (parent && child) parent.children.push(child)
  }
  return rows.filter((row) => !row.parent_id).map((row) => mapped.get(row.id)!).filter(Boolean)
}

export interface SaveProjectBundleInput {
  project: {
    id?: string
    parentId?: string
    version?: number
    areaKey: string
    name: string
    dgGo: string
    priority: string
    progress: number
    plannedStart: string
    plannedEnd: string
    rescheduledStart: string
    rescheduledEnd: string
    objective: string
    scope: string
    justification: string
    notes: string
    briefUrl: string
    budget: string
    mechi?: boolean
    competencyAreas: string[]
    sortOrder: number
    manualStatus?: ManualProjectStatus | null
    visualMetrics?: Record<string, unknown>
  }
  updates: Array<{
    id?: string
    date: string
    type: 'Avance' | 'Información' | 'Alerta/Bloqueo' | 'Pendiente'
    detail: string
    attachmentUrl?: string
    attachmentName?: string
    deleted?: boolean
  }>
  nextSteps: Array<{
    id?: string
    task: string
    owners: string[]
    dueDate: string
    deleted?: boolean
  }>
}

export async function setProjectManualStatus(projectId: string, status?: ManualProjectStatus): Promise<void> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { error } = await supabase.rpc('set_project_manual_status', {
    target_project: projectId,
    requested_status: status ?? null,
  })
  if (error) throw error
}

export async function saveProjectBundle(payload: SaveProjectBundleInput): Promise<string> {
  const {data,error}=await supabase.rpc('du_save_project_bundle',{payload});
  if(error)throw error;return data as string;
}

export function projectBundleHeader(project:Project):SaveProjectBundleInput['project']{
 if(project.sourceFields){const {manualStatus:_manual,visualMetrics:_metrics,...fields}=project.sourceFields;return {...fields,id:project.id,version:project.version,competencyAreas:project.areaKeys.filter(key=>key!==project.areaKey)} as SaveProjectBundleInput['project'];}
 return {id:project.id,parentId:project.parentId,version:project.version,areaKey:project.areaKey,name:project.name,dgGo:project.owner,priority:project.priority,progress:project.progress,plannedStart:project.plannedStart,plannedEnd:project.plannedEnd,rescheduledStart:project.rescheduledStart,rescheduledEnd:project.rescheduledEnd,objective:project.objective,scope:project.scope,justification:project.justification,notes:project.notes,briefUrl:project.briefUrl??'',budget:project.budget??'',mechi:project.mechi,competencyAreas:project.areaKeys.filter(key=>key!==project.areaKey),sortOrder:project.sortOrder};
}

export async function resolveProjectUpdate(updateId: string, detail?: string): Promise<void> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { error } = await supabase.rpc('resolve_project_update', {
    target_update: updateId,
    resolution_detail: detail || null,
  })
  if (error) throw error
}

export async function resolveNextStep(stepId: string, detail?: string): Promise<void> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { error } = await supabase.rpc('resolve_next_step', {
    target_step: stepId,
    resolution_detail: detail || null,
  })
  if (error) throw error
}

export async function setDashboardFavorite(projectId: string, favorite: boolean): Promise<void> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { error } = await supabase.rpc('set_dashboard_favorite', {
    target_project: projectId,
    favorite,
  })
  if (error) throw error
}

export async function deleteProject(projectId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { error } = await supabase.from('projects').delete().eq('id', projectId)
  if (error) throw error
}

export async function fetchCurrentAccess(user: User): Promise<CurrentAccess> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const [profileResult, areaResult, dashboardResult] = await Promise.all([
    supabase.from('profiles').select('display_name,email,role').eq('id', user.id).single(),
    supabase.from('area_permissions').select('can_edit,areas(area_key)').eq('user_id', user.id).eq('can_edit', true),
    supabase.from('dashboard_permissions').select('can_edit').eq('user_id', user.id).maybeSingle(),
  ])
  if (profileResult.error) throw profileResult.error
  const profile = profileResult.data
  const role = profile.role as CurrentAccess['role']
  return {
    displayName: profile.display_name || user.email?.split('@')[0] || 'Usuario',
    email: profile.email || user.email || '',
    role,
    editableAreaKeys: role === 'root'
      ? []
      : (areaResult.data ?? []).map((permission) => {
          const relation = permission.areas as unknown as { area_key: string } | null
          return relation?.area_key
        }).filter((value): value is string => Boolean(value)),
    canEditDashboard: role === 'root' || Boolean(dashboardResult.data?.can_edit),
  }
}
