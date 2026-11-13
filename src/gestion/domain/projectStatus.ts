import type { NextStep, ProjectStatus, ProjectUpdate } from './types'

export function isNextStepOverdue(step: NextStep, today = new Date()): boolean {
  return !step.resolved
    && Boolean(step.dueDate)
    && new Date(`${step.dueDate}T23:59:59`) < today
}

export function isNextStepUndated(step: NextStep): boolean {
  return !step.resolved && !step.dueDate
}

export function getOverdueNextStepCount(nextSteps: NextStep[], today = new Date()): number {
  return nextSteps.filter((step) => isNextStepOverdue(step, today)).length
}

export function deriveProjectStatus(
  updates: ProjectUpdate[],
  nextSteps: NextStep[],
  progress: number,
  today = new Date(),
): ProjectStatus {
  const hasAlert = updates.some((update) => !update.resolved && update.type === 'Alerta/Bloqueo')
  const hasPending = updates.some((update) => !update.resolved && update.type === 'Pendiente')
  const hasOverdueStep = getOverdueNextStepCount(nextSteps, today) > 0
  const hasUndatedStep = nextSteps.some(isNextStepUndated)

  if (hasAlert || hasOverdueStep) return 'alert'
  if (hasPending || hasUndatedStep) return 'pending'
  if (progress >= 100) return 'finished'
  return 'active'
}

export function inclusiveDays(start?: string, end?: string): number | null {
  if (!start || !end) return null
  const startDate = new Date(`${start}T00:00:00Z`)
  const endDate = new Date(`${end}T00:00:00Z`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return null
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1
}
