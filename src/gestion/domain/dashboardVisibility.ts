import type { Project, ProjectStatus } from './types'
import { getDisplayStatus } from './displayStatus'
import {flattenProjects,filterProjectTree} from './projectTree'

export type ProjectListFilter = 'all' | ProjectStatus | readonly ProjectStatus[]

export function toggleProjectStatusFilter(
  current: readonly ProjectStatus[],
  next: 'all' | ProjectStatus,
): ProjectStatus[] {
  if (next === 'all') return []
  return current.includes(next)
    ? current.filter((status) => status !== next)
    : [...current, next]
}

function projectMatchesStatus(project: Project, status: ProjectListFilter) {
  if (status === 'all') return true
  const displayStatus = getDisplayStatus(project)
  return Array.isArray(status) ? status.length === 0 || status.includes(displayStatus) : displayStatus === status
}

export function projectMatchesFilter(project: Project, query: string, status: ProjectListFilter) {
  const searchable = [project.name, project.areaName, project.owner, project.objective]
    .join(' ')
    .toLocaleLowerCase('es')

  return (
    (!query || searchable.includes(query.toLocaleLowerCase('es'))) &&
    projectMatchesStatus(project, status)
  )
}

function favoriteOrder(project: Project) {
  if (project.favorite) return project.favoriteSortOrder ?? Number.MAX_SAFE_INTEGER
  const childOrders = flattenProjects(project.children)
    .filter((child) => child.favorite)
    .map((child) => child.favoriteSortOrder ?? Number.MAX_SAFE_INTEGER)
  return childOrders.length ? Math.min(...childOrders) : Number.MAX_SAFE_INTEGER
}

export function getVisibleProjects(
  projects: Project[],
  activeArea: string,
  query: string,
  statusFilter: ProjectListFilter,
) {
  return projects.flatMap((project) => {
    if (activeArea === 'management_milestones') return []

    if (activeArea === 'red_report') {
      return filterProjectTree([project],entry=>getDisplayStatus(entry)==='alert'&&projectMatchesFilter(entry,query,'alert'),false)
    }

    if (activeArea === 'all_projects') {
      return filterProjectTree([project],entry=>projectMatchesFilter(entry,query,statusFilter));
    }
    if (activeArea !== 'dashboard') {
      return project.areaKeys.includes(activeArea) && projectMatchesFilter(project, query, statusFilter) ? [project] : []
    }

    return filterProjectTree([project],entry=>entry.favorite&&projectMatchesFilter(entry,query,statusFilter),false)
  }).sort((a, b) => activeArea === 'dashboard'
    ? favoriteOrder(a) - favoriteOrder(b)
    : a.sortOrder - b.sortOrder)
}
