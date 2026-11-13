import { useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, Printer, Search } from 'lucide-react'
import type { Milestone } from '../../domain/types'

interface ManagementMilestonesViewProps {
  milestones: Milestone[]
}

function formatDate(value: string) {
  if (!value) return 'Sin fecha'
  return value.slice(0, 10).split('-').reverse().join('/')
}

function monthKey(value: string) {
  return value ? value.slice(0, 7) : 'sin-fecha'
}

function monthLabel(key: string) {
  if (key === 'sin-fecha') return 'Sin fecha definida'
  return new Date(`${key}-02T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

function tone(value: string) {
  const normalized = value.toLocaleLowerCase('es')
  if (normalized.includes('sucedi') || normalized.includes('cumpl') || normalized.includes('final')) return 'finished'
  if (normalized.includes('retras') || normalized.includes('alert')) return 'alert'
  if (normalized.includes('program') || normalized.includes('pend')) return 'pending'
  return 'active'
}

export function ManagementMilestonesView({ milestones }: ManagementMilestonesViewProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const management = useMemo(() => milestones
    .filter((item) => item.sourceSheet === 'HITOS 2026')
    .sort((a, b) => (a.startDate || a.dueDate || '9999').localeCompare(b.startDate || b.dueDate || '9999')), [milestones])
  const visible = management.filter((item) => {
    const searchable = [item.projectTitle, item.name, item.scope, item.detail, item.owner, item.axis].join(' ').toLocaleLowerCase('es')
    return (!query || searchable.includes(query.toLocaleLowerCase('es'))) && (status === 'all' || tone(item.status) === status)
  })
  const groups = Object.entries(visible.reduce<Record<string, Milestone[]>>((result, item) => {
    const key = monthKey(item.startDate || item.dueDate)
    result[key] = [...(result[key] ?? []), item]
    return result
  }, {}))
  const completed = management.filter((item) => tone(item.status) === 'finished').length
  const upcoming = management.filter((item) => tone(item.status) === 'pending').length

  return (
    <section className="management-milestones-view">
      <div className="management-summary">
        <article><CalendarDays size={20} /><div><strong>{management.length}</strong><span>Hitos 2026</span></div></article>
        <article><CheckCircle2 size={20} /><div><strong>{completed}</strong><span>Realizados</span></div></article>
        <article><Clock3 size={20} /><div><strong>{upcoming}</strong><span>Programados</span></div></article>
      </div>
      <div className="management-toolbar">
        <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar política, hito o responsable" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar hitos por estado">
          <option value="all">Todos los estados</option>
          <option value="active">En curso</option>
          <option value="pending">Programados</option>
          <option value="alert">Retrasados</option>
          <option value="finished">Realizados</option>
        </select>
        <button className="secondary-button" type="button" onClick={() => window.print()}><Printer size={15} /> Imprimir / Guardar PDF</button>
      </div>
      <div className="management-board">
        {groups.map(([key, items]) => (
          <section className="management-month" key={key}>
            <header><h2>{monthLabel(key)}</h2><span>{items.length} {items.length === 1 ? 'hito' : 'hitos'}</span></header>
            <div className="management-milestone-list">
              {items.map((item) => (
                <article className={`management-milestone tone-${tone(item.status)}`} key={item.id}>
                  <time><b>{formatDate(item.startDate || item.dueDate)}</b>{item.startDate && item.dueDate && item.startDate !== item.dueDate && <span>al {formatDate(item.dueDate)}</span>}</time>
                  <div className="management-milestone-copy">
                    {item.projectTitle && <small>{item.projectTitle}</small>}
                    <h3>{item.name}</h3>
                    {item.scope && <p><strong>Alcance:</strong> {item.scope}</p>}
                    {item.detail && <p>{item.detail}</p>}
                    <footer>{[item.owner, item.axis, item.jgmEligible ? `JGM/JM: ${item.jgmEligible}` : ''].filter(Boolean).map((value) => <span key={value}>{value}</span>)}</footer>
                  </div>
                  <span className={`management-status ${tone(item.status)}`}>{item.status || 'Sin estado'}</span>
                </article>
              ))}
            </div>
          </section>
        ))}
        {!visible.length && <div className="empty-state"><CalendarDays size={24} /><h3>No hay hitos para estos filtros</h3></div>}
      </div>
    </section>
  )
}
