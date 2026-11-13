import { CalendarDays, Pencil } from 'lucide-react'

interface ProjectVisualMetricsProps {
  metrics: Record<string, unknown>
  compact?: boolean
  onEdit?: () => void
}

interface MetricRow {
  key: string
  label: string
  value: number
  count?: number
  tone: 'red' | 'green'
}

const labels: Record<string, string> = {
  ddjj: 'DDJJ completas',
  inicial: 'Inicial',
  primaria: 'Primaria',
  secundaria: 'Secundaria',
  superior: 'Superior',
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function numeric(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatPercent(value: number) {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function formatDate(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  const parts = value.split('-')
  return parts.length === 3 ? parts.reverse().join('/') : value
}

function getVisualMetricRows(metrics: Record<string, unknown>): MetricRow[] {
  if (metrics.type !== 'sinigep') return []
  const values = record(metrics.values)
  const counts = record(metrics.counts)
  const tones = record(metrics.tones)
  return ['ddjj', 'inicial', 'primaria', 'secundaria', 'superior'].map((key) => ({
    key,
    label: labels[key],
    value: numeric(values[key]),
    count: counts[key] == null ? undefined : numeric(counts[key]),
    tone: tones[key] === 'red' ? 'red' : 'green',
  }))
}

export function ProjectVisualMetrics({ metrics, compact = false, onEdit }: ProjectVisualMetricsProps) {
  const rows = getVisualMetricRows(metrics)
  if (!rows.length) return null
  const measurementDate = formatDate(metrics.measurementDate)
  const alertCount = rows.filter((row) => row.tone === 'red').length

  return (
    <section className={`visual-metrics ${compact ? 'is-compact' : ''}`} aria-label="Avance de declaraciones juradas">
      <header>
        <div>
          <span>Métricas</span>
          <h4>Avance de declaraciones juradas</h4>
        </div>
        <strong className={alertCount ? 'has-alerts' : ''}>{alertCount ? `${alertCount} en alerta` : 'Sin alertas'}</strong>
        {measurementDate && <time><CalendarDays size={13} /> Actualizado {measurementDate}</time>}
        {onEdit && <button className="visual-metrics-edit" type="button" title="Editar métricas de SINIGEP" aria-label="Editar métricas de SINIGEP" onClick={onEdit}><Pencil size={14} /></button>}
      </header>
      <div className="visual-metric-list">
        {rows.map((row) => (
          <div className={`visual-metric-row tone-${row.tone}`} key={row.key}>
            <div className="visual-metric-label"><strong>{row.label}</strong>{row.count !== undefined && <span>{row.count.toLocaleString('es-AR')}</span>}</div>
            <div className="visual-metric-track"><span style={{ width: `${Math.min(100, Math.max(0, row.value))}%` }} /></div>
            <b>{formatPercent(row.value)}%</b>
            <i title={row.tone === 'red' ? 'En alerta' : 'En curso'} />
          </div>
        ))}
      </div>
    </section>
  )
}
