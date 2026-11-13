import type { SpecialView } from '../../domain/types'

const excludedViewKeys = new Set([
  'administrative_state_changes',
  'polo_victorias_agenda',
])

export function isExcludedFromDashboard(view: Pick<SpecialView, 'viewKey'>) {
  return excludedViewKeys.has(view.viewKey)
}
