export type ProjectStatus = 'active' | 'pending' | 'alert' | 'finished'
export type ManualProjectStatus = ProjectStatus
export type ViewMode = 'view' | 'edit'

export interface Area {
  id?: string
  key: string
  number: number
  name: string
}

export interface Indicator {
  id: string
  areaKey: string
  areaName: string
  projectId?: string
  projectName?: string
  name: string
  valueText: string
  valueNumeric?: number
  targetText: string
  targetNumeric?: number
  unit: string
  period: string
  notes: string
  status: string
  updatedAt: string
}

export interface Milestone {
  id: string
  areaKey: string
  areaName: string
  sourceSheet?: string
  projectId?: string
  projectName?: string
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
  updatedAt: string
}

export interface BudgetExecution {
  id: string
  areaKey: string
  areaName: string
  concept: string
  period: string
  budgeted?: number
  executed?: number
  detail: string
  updatedAt: string
}

export interface SpecialView {
  id: string
  areaKey: string
  projectId?: string
  viewKey: string
  title: string
  payload: Record<string, unknown>
  updatedAt: string
}

export interface PortfolioData {
  indicators: Indicator[]
  milestones: Milestone[]
  budgets: BudgetExecution[]
  specialViews: SpecialView[]
}

export interface ProjectUpdate {
  id: string
  date: string
  type: 'Avance' | 'Información' | 'Alerta/Bloqueo' | 'Pendiente'
  detail: string
  resolved: boolean
  attachmentUrl?: string
  attachmentName?: string
}

export interface NextStep {
  id: string
  task: string
  owner: string
  owners: string[]
  dueDate: string
  resolved: boolean
}

export interface Project {
  sourceFields?: Record<string,unknown>
  id: string
  parentId?: string
  kind: 'project' | 'subproject'
  version: number
  areaKey: string
  areaKeys: string[]
  areaName: string
  name: string
  owner: string
  priority: string
  objective: string
  scope: string
  justification: string
  notes: string
  progress: number
  status: ProjectStatus
  manualStatus?: ManualProjectStatus
  statusLabel?: string
  favorite: boolean
  favoriteSortOrder?: number
  updatedAt: string
  plannedStart: string
  plannedEnd: string
  plannedDays?: number
  rescheduledStart: string
  rescheduledEnd: string
  rescheduledDays?: number
  budget?: string
  mechi?: boolean
  briefUrl?: string
  competencyAreas: string[]
  sortOrder: number
  sourceKey?: string
  visualMetrics?: Record<string, unknown>
  updates: ProjectUpdate[]
  nextSteps: NextStep[]
  children: Project[]
}
