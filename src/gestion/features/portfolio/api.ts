import {managementUser} from '../../lib/management-session';
import type {
  Indicator,
  Milestone,
  PortfolioData,
  SpecialView,
} from '../../domain/types'
import { supabase } from '../../lib/supabase'
import { normalizeText, normalizeTextTree } from '../../lib/text'

interface AreaRelation {
  area_key: string
  number: number
  name: string
}

interface ProjectRelation {
  name: string
}

type Relation<T> = T | T[] | null

function first<T>(relation: Relation<T>): T | undefined {
  return Array.isArray(relation) ? relation[0] : relation ?? undefined
}

function areaLabel(area?: AreaRelation) {
  return area ? `${area.number}. ${normalizeText(area.name)}` : 'Sin área'
}

async function getAreaId(areaKey: string) {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase.from('areas').select('id').eq('area_key', areaKey).single()
  if (error) throw error
  return data.id as string
}

export async function fetchPortfolioData(): Promise<PortfolioData> {
  if (!supabase) throw new Error('Supabase no está configurado.')

  const [indicatorResult, milestoneResult, specialResult, budgetResult] = await Promise.all([
    supabase
      .from('indicators')
      .select('id,project_id,name,value_text,value_numeric,target_text,target_numeric,unit,period,notes,status,updated_at,area:areas!indicators_area_id_fkey(area_key,number,name),project:projects(name)')
      .order('updated_at', { ascending: false }),
    supabase
      .from('milestones')
      .select('id,source_sheet,project_id,project_title,name,start_date,due_date,status,owner,scope,detail,axis,jgm_eligible,updated_at,area:areas!milestones_area_id_fkey(area_key,number,name),project:projects(name)')
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('special_views')
      .select('id,project_id,view_key,title,payload,updated_at,area:areas!special_views_area_id_fkey(area_key,number,name)')
      .order('title', { ascending: true }),
    supabase.from('budget_execution').select('id,concept,period,budgeted,executed,detail,updated_at,area:areas!budget_execution_area_id_fkey(area_key,number,name)').order('updated_at',{ascending:false}),
  ])

  const error = indicatorResult.error || milestoneResult.error || specialResult.error || budgetResult.error
  if (error) throw error

  const indicators = (indicatorResult.data ?? []).map((row) => {
    const area = first(row.area as unknown as Relation<AreaRelation>)
    const project = first(row.project as unknown as Relation<ProjectRelation>)
    return {
      id: row.id,
      areaKey: area?.area_key ?? '',
      areaName: areaLabel(area),
      projectId: row.project_id ?? undefined,
      projectName: normalizeText(project?.name) || undefined,
      name: normalizeText(row.name),
      valueText: normalizeText(row.value_text),
      valueNumeric: row.value_numeric == null ? undefined : Number(row.value_numeric),
      targetText: normalizeText(row.target_text),
      targetNumeric: row.target_numeric == null ? undefined : Number(row.target_numeric),
      unit: normalizeText(row.unit),
      period: normalizeText(row.period),
      notes: normalizeText(row.notes),
      status: normalizeText(row.status),
      updatedAt: row.updated_at,
    } satisfies Indicator
  })

  const milestones = (milestoneResult.data ?? []).map((row) => {
    const area = first(row.area as unknown as Relation<AreaRelation>)
    const project = first(row.project as unknown as Relation<ProjectRelation>)
    return {
      id: row.id,
      areaKey: area?.area_key ?? '',
      areaName: areaLabel(area),
      sourceSheet: row.source_sheet ?? undefined,
      projectId: row.project_id ?? undefined,
      projectName: normalizeText(project?.name) || undefined,
      projectTitle: normalizeText(row.project_title),
      name: normalizeText(row.name),
      startDate: row.start_date ?? '',
      dueDate: row.due_date ?? '',
      status: normalizeText(row.status),
      owner: normalizeText(row.owner),
      scope: normalizeText(row.scope),
      detail: normalizeText(row.detail),
      axis: normalizeText(row.axis),
      jgmEligible: normalizeText(row.jgm_eligible),
      updatedAt: row.updated_at,
    } satisfies Milestone
  })

  const specialViews = (specialResult.data ?? []).map((row) => {
    const area = first(row.area as unknown as Relation<AreaRelation>)
    return {
      id: row.id,
      areaKey: area?.area_key ?? '',
      projectId: row.project_id ?? undefined,
      viewKey: row.view_key,
      title: normalizeText(row.title),
      payload: row.payload && typeof row.payload === 'object' ? normalizeTextTree(row.payload as Record<string, unknown>) : {},
      updatedAt: row.updated_at,
    } satisfies SpecialView
  })

  const budgets=(budgetResult.data??[]).map(row=>{const area=first(row.area as unknown as Relation<AreaRelation>);return {id:row.id,areaKey:area?.area_key??'',areaName:areaLabel(area),concept:normalizeText(row.concept),period:normalizeText(row.period),budgeted:row.budgeted==null?undefined:Number(row.budgeted),executed:row.executed==null?undefined:Number(row.executed),detail:normalizeText(row.detail),updatedAt:row.updated_at};});
  return { indicators, milestones, budgets, specialViews }
}

export async function syncWorksMapFromSheets() {
  if (!supabase) return
  const { error } = await supabase.functions.invoke('sync-works-map')
  if (error) throw error
}

export interface SpecialViewInput {
  id: string
  title: string
  payload: Record<string, unknown>
}

export async function saveSpecialView(input: SpecialViewInput) {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const title = input.title.trim()
  if (!title) throw new Error('El título es obligatorio.')
  const { error } = await supabase
    .from('special_views')
    .update({ title, payload: input.payload, updated_at: new Date().toISOString() })
    .eq('id', input.id)
  if (error) throw error
}

export interface IndicatorInput {
  id?: string
  areaKey: string
  projectId?: string
  name: string
  valueText: string
  targetText: string
  unit: string
  period: string
  notes: string
  status: string
}

function parseOptionalNumber(value: string) {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export async function saveIndicator(input: IndicatorInput) {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const areaId = await getAreaId(input.areaKey)
  const userData = {user:await managementUser()}
  const payload = {
    area_id: areaId,
    project_id: input.projectId || null,
    name: input.name.trim(),
    value_text: input.valueText.trim() || null,
    value_numeric: parseOptionalNumber(input.valueText),
    target_text: input.targetText.trim() || null,
    target_numeric: parseOptionalNumber(input.targetText),
    unit: input.unit.trim() || null,
    period: input.period.trim() || null,
    notes: input.notes.trim() || null,
    status: input.status.trim() || null,
    updated_by: userData.user?.id ?? null,
    updated_at: new Date().toISOString(),
  }
  const query = input.id
    ? supabase.from('indicators').update(payload).eq('id', input.id)
    : supabase.from('indicators').insert({ ...payload, created_by: userData.user?.id ?? null })
  const { error } = await query
  if (error) throw error
}

export async function deleteIndicator(id: string) {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { error } = await supabase.from('indicators').delete().eq('id', id)
  if (error) throw error
}

export interface MilestoneInput {
  id?: string
  areaKey: string
  projectId?: string
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

export async function saveMilestone(input: MilestoneInput) {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const areaId = await getAreaId(input.areaKey)
  const userData = {user:await managementUser()}
  const payload = {
    area_id: areaId,
    project_id: input.projectId || null,
    project_title: input.projectTitle.trim() || null,
    name: input.name.trim(),
    start_date: input.startDate || null,
    due_date: input.dueDate || null,
    status: input.status.trim() || null,
    owner: input.owner.trim() || null,
    scope: input.scope.trim() || null,
    detail: input.detail.trim() || null,
    axis: input.axis.trim() || null,
    jgm_eligible: input.jgmEligible.trim() || null,
    updated_by: userData.user?.id ?? null,
    updated_at: new Date().toISOString(),
  }
  const query = input.id
    ? supabase.from('milestones').update(payload).eq('id', input.id)
    : supabase.from('milestones').insert({ ...payload, created_by: userData.user?.id ?? null })
  const { error } = await query
  if (error) throw error
}

export async function deleteMilestone(id: string) {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { error } = await supabase.from('milestones').delete().eq('id', id)
  if (error) throw error
}

export interface BudgetInput {
  id?: string
  areaKey: string
  concept: string
  period: string
  budgeted: string
  executed: string
  detail: string
}

export async function saveBudget(input: BudgetInput) {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const areaId = await getAreaId(input.areaKey)
  const payload = {
    area_id: areaId,
    concept: input.concept.trim(),
    period: input.period.trim() || null,
    budgeted: parseOptionalNumber(input.budgeted),
    executed: parseOptionalNumber(input.executed),
    detail: input.detail.trim() || null,
    updated_at: new Date().toISOString(),
  }
  const query = input.id
    ? supabase.from('budget_execution').update(payload).eq('id', input.id)
    : supabase.from('budget_execution').insert(payload)
  const { error } = await query
  if (error) throw error
}

export async function deleteBudget(id: string) {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { error } = await supabase.from('budget_execution').delete().eq('id', id)
  if (error) throw error
}

export async function saveDashboardOrder(projectIds: string[]) {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const client = supabase
  const rpcResult = await client.rpc('reorder_dashboard_favorites', { project_ids: projectIds })
  if (!rpcResult.error) return
  if (!['PGRST202', '42883'].includes(rpcResult.error.code || '')) throw rpcResult.error
  const results = await Promise.all(projectIds.map((projectId, index) => (
    client.from('dashboard_favorites').update({ sort_order: index + 1, updated_at: new Date().toISOString() }).eq('project_id', projectId)
  )))
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
}
