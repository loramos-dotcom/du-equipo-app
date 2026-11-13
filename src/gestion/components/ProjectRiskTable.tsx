import { Table2 } from 'lucide-react'

export interface ProjectRiskTableColumn {
  id: string
  label: string
}

export interface ProjectRiskTableRow {
  id: string
  cells: Record<string, string>
}

export interface ProjectRiskTableData {
  columns: ProjectRiskTableColumn[]
  rows: ProjectRiskTableRow[]
}

const defaultColumns: ProjectRiskTableColumn[] = [
  { id: 'institute', label: 'Instituto' },
  { id: 'status', label: 'Situación' },
  { id: 'notes', label: 'Observaciones' },
]

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function isClosureRiskProjectName(value: string) {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
  return normalized.includes('institutos en riesgo de cierre')
}

export function createRiskTableId(prefix: 'column' | 'row') {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${id}`
}

export function getProjectRiskTable(metrics: Record<string, unknown>, includeEmptyRow = false): ProjectRiskTableData {
  const source = record(metrics.closureRiskTable)
  const rawColumns = Array.isArray(source.columns) ? source.columns : []
  const columns = rawColumns.map((item, index) => {
    const column = record(item)
    return {
      id: text(column.id) || `column-${index + 1}`,
      label: text(column.label),
    }
  }).filter((column) => column.id)
  const usableColumns = columns.length ? columns : defaultColumns.map((column) => ({ ...column }))

  const rawRows = Array.isArray(source.rows) ? source.rows : []
  const rows = rawRows.map((item, index) => {
    const row = record(item)
    const rawCells = record(row.cells)
    return {
      id: text(row.id) || `row-${index + 1}`,
      cells: Object.fromEntries(usableColumns.map((column) => [column.id, text(rawCells[column.id])])),
    }
  })

  if (includeEmptyRow && rows.length === 0) {
    rows.push({ id: 'row-initial', cells: Object.fromEntries(usableColumns.map((column) => [column.id, ''])) })
  }

  return { columns: usableColumns, rows }
}

export function setProjectRiskTable(metrics: Record<string, unknown>, table: ProjectRiskTableData): Record<string, unknown> {
  return {
    ...metrics,
    closureRiskTable: {
      columns: table.columns.map((column) => ({
        id: column.id,
        label: column.label,
      })),
      rows: table.rows.map((row) => ({
        id: row.id,
        cells: Object.fromEntries(table.columns.map((column) => [column.id, text(row.cells[column.id])])),
      })),
    },
  }
}

export function projectRiskTableHasContent(metrics: Record<string, unknown>) {
  const table = getProjectRiskTable(metrics)
  return table.rows.some((row) => table.columns.some((column) => row.cells[column.id]?.trim()))
}

export function ProjectRiskTable({ metrics, showEmpty = false }: { metrics: Record<string, unknown>; showEmpty?: boolean }) {
  const table = getProjectRiskTable(metrics)
  const rows = table.rows.filter((row) => table.columns.some((column) => row.cells[column.id]?.trim()))
  if (rows.length === 0 && !showEmpty) return null

  return (
    <section className="project-risk-table" aria-label="Seguimiento de institutos en riesgo de cierre">
      <h4><Table2 size={15} /> Seguimiento de institutos</h4>
      <div className="project-risk-table-scroll">
        <table>
          <thead>
            <tr>{table.columns.map((column, index) => <th key={column.id}>{column.label || `Columna ${index + 1}`}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="project-risk-table-empty"><td colSpan={table.columns.length}>Sin datos cargados</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                {table.columns.map((column) => <td key={column.id}>{row.cells[column.id]?.trim() || '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
