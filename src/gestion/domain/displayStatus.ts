import type { ManualProjectStatus, Project, ProjectStatus } from './types'
import { deriveProjectStatus } from './projectStatus'

type StatusProject = Pick<Project, 'updates' | 'nextSteps' | 'progress' | 'manualStatus'> & {
  children: StatusProject[]
}

export function getDisplayStatus(project: StatusProject): ProjectStatus {
  if (project.manualStatus) return project.manualStatus as ManualProjectStatus
  const ownStatus = deriveProjectStatus(project.updates, project.nextSteps, project.progress)
  const childStatuses = project.children.map(getDisplayStatus)

  // The visible status follows the current project data, not a persisted value
  // that may briefly lag behind an edit to a next step.
  if (ownStatus === 'alert' || childStatuses.includes('alert')) return 'alert'
  if (ownStatus === 'pending' || childStatuses.includes('pending')) return 'pending'
  if (ownStatus === 'active' || childStatuses.includes('active')) return 'active'
  return 'finished'
}
