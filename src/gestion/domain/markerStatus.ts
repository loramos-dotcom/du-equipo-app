export type MarkerTone = 'red' | 'amber' | 'green' | 'finished' | 'neutral'

export interface MarkerStatus {
  status: string
  summaryStatus: string
  tone: MarkerTone
  color: string
  finished: boolean
}

export interface MapMarker extends MarkerStatus {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  detail: string
  progress: string
}

export interface MarkerSummary {
  label: string
  tone: MarkerTone
  color: string
  count: number
}

const colors: Record<MarkerTone, string> = {
  red: '#ef4b4b',
  amber: '#f3a116',
  green: '#2dbb63',
  finished: '#035c80',
  neutral: '#607384',
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es').replace(/\s+/g, ' ')
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

function finishedStatus(status: string) {
  return /^(?:finalizad[oa]s?|terminad[oa]s?|completad[oa]s?|finished|completed)(?:\b|$)/.test(normalize(status))
}

function trafficLight(item: Record<string, unknown>) {
  for (const key of ['semaforo', 'trafficLight', 'traffic_light']) {
    const value = text(item[key]).toUpperCase()
    if (['R', 'A', 'V', 'F'].includes(value)) return value
  }
  return ''
}

function statusValue(status: string, summaryStatus: string, tone: MarkerTone): MarkerStatus {
  return { status, summaryStatus, tone, color: colors[tone], finished: tone === 'finished' }
}

/** Status comes exclusively from the authorized response; an identifier never determines it. */
export function resolveMarkerStatus(item: Record<string, unknown>, useTrafficLight = true): MarkerStatus {
  const supplied = text(item.status) || text(item.state)
  const light = useTrafficLight ? trafficLight(item) : ''
  // A closed record stays closed even when another supplied field contains an older traffic light.
  if (light === 'F' || finishedStatus(supplied)) return statusValue('Finalizado', 'Finalizado', 'finished')
  if (light === 'R') return statusValue('Demorado', 'Demorado', 'red')
  if (light === 'A') return statusValue('Demora leve', 'Demora leve', 'amber')
  if (light === 'V') return statusValue('En ejecución', 'En ejecución', 'green')

  const normalized = normalize(supplied)
  if (/^(?:demorad[oa]|retrasad[oa]|critic[oa]|alerta|bloquead[oa]|rojo|en riesgo)(?:\b|$)/.test(normalized)) return statusValue(supplied, supplied, 'red')
  if (/^(?:demora leve|pendiente|amarillo)(?:\b|$)/.test(normalized)) return statusValue(supplied, supplied, 'amber')
  if (['en ejecucion', 'en curso', 'en marcha', 'activo', 'activa', 'verde', 'segun lo previsto', 'sin demora'].includes(normalized)) return statusValue(supplied, supplied, 'green')
  const label = supplied || 'Sin estado informado'
  return statusValue(label, label, 'neutral')
}

function progress(item: Record<string, unknown>) {
  const direct = item.sourceProgress ?? item.progress ?? item.avance
  if (typeof direct === 'number' && Number.isFinite(direct)) return String(direct)
  if (text(direct)) return text(direct)
  return (text(item.detail) || text(item.description)).match(/Avance:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
}

function coordinate(value: unknown) {
  return typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
}

export function mapMarkers(payload: Record<string, unknown>, options?: { excludeFinished?: boolean; useTrafficLight?: boolean }): MapMarker[] {
  if (!Array.isArray(payload.markers)) return []
  const seen = new Set<string>()
  return payload.markers.flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const item = raw as Record<string, unknown>
    const lat = coordinate(item.lat ?? item.latitude), lng = coordinate(item.lng ?? item.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return []
    const state = resolveMarkerStatus(item, !!options?.useTrafficLight)
    if (options?.excludeFinished && state.finished) return []
    const id = (typeof item.id === 'number' && Number.isFinite(item.id) ? String(item.id) : text(item.id)) || String(index + 1)
    const workId = id.split(':')[0]
    if (options?.useTrafficLight) {
      if (seen.has(workId)) return []
      seen.add(workId)
    }
    return [{
      id,
      name: text(item.name) || text(item.title) || text(item.address) || 'Obra',
      address: text(item.address), lat, lng,
      ...state,
      detail: text(item.detail) || text(item.description),
      progress: progress(item),
    }]
  })
}

/** The screen and print legend use the same classification as their markers. */
export function summarizeMapMarkers(markers: MapMarker[]): MarkerSummary[] {
  const groups = new Map<string, MarkerSummary>()
  for (const marker of markers) {
    const key = marker.tone + ':' + marker.summaryStatus
    const previous = groups.get(key)
    if (previous) previous.count++
    else groups.set(key, { label: marker.summaryStatus, tone: marker.tone, color: marker.color, count: 1 })
  }
  return [...groups.values()]
}
