import type { CSSProperties } from 'react'
import { Pencil } from 'lucide-react'
import schoolIcon from '../assets/education-school.png'
import studentsIcon from '../assets/education-students.png'
import teacherIcon from '../assets/education-teacher.png'
import {
  educationLevelLabels,
  educationLevels,
  type EducationSectorCounts,
  type EducationSystemCopy,
  type EducationSystemData,
} from './educationSystemData'

interface EducationSystemOverviewProps {
  data: EducationSystemData
  onEdit?: () => void
}

interface EducationSystemEditorProps {
  data: EducationSystemData
  onChange: (data: EducationSystemData) => void
}

type MaskStyle = CSSProperties & { '--education-image': string }

function IconMask({ source, className = '' }: { source: string; className?: string }) {
  return <span className={`education-mask-icon ${className}`} style={{ '--education-image': `url(${source})` } as MaskStyle} aria-hidden="true" />
}

function TotalPanel({ icon, values, label, stateLabel, privateLabel, note }: {
  icon: string
  values: EducationSectorCounts
  label: string
  stateLabel: string
  privateLabel: string
  note?: string
}) {
  const totalLength = values.total.replace(/\s/g, '').length
  return (
    <div className="education-total-wrap">
      <span className="education-icon" aria-hidden="true"><IconMask source={icon} /></span>
      <div className="education-total-panel">
        <strong className={totalLength >= 7 ? 'is-long-total' : undefined}><mark>{values.total}</mark><span>{label}</span></strong>
        <div><span>{stateLabel}<b>{values.state}</b></span><span>{privateLabel}<b>{values.private}</b></span></div>
      </div>
      {note && <small className="education-total-note">{note}</small>}
    </div>
  )
}

function ConnectorBracket() {
  return <span className="education-connector" aria-hidden="true" />
}

function LevelList({ values, labels }: {
  values: Record<keyof typeof educationLevelLabels, EducationSectorCounts>
  labels: EducationSystemCopy['levelLabels']
}) {
  return (
    <div className="education-level-list">
      {educationLevels.map((level) => <div className="education-level-row" key={level}><strong>{values[level].total}</strong><span>{labels[level]}</span><small>E: {values[level].state}<i />P: {values[level].private}</small></div>)}
    </div>
  )
}

function SummaryPanel({ values, stateLabel, privateLabel }: { values: EducationSectorCounts; stateLabel: string; privateLabel: string }) {
  return (
    <div className="education-summary-panel">
      <strong><mark>{values.total}</mark></strong>
      <div><span>{stateLabel}<b>{values.state}</b></span><span>{privateLabel}<b>{values.private}</b></span></div>
    </div>
  )
}

function EducationBand({ icon, total, label, levels, summary, copy, note }: {
  icon: string
  total: EducationSectorCounts
  label: string
  levels: Record<keyof typeof educationLevelLabels, EducationSectorCounts>
  summary: EducationSectorCounts
  copy: EducationSystemCopy
  note?: string
}) {
  return (
    <div className={`education-band ${note ? 'has-note' : ''}`}>
      <TotalPanel icon={icon} values={total} label={label} stateLabel={copy.stateLabel} privateLabel={copy.privateLabel} note={note} />
      <ConnectorBracket />
      <LevelList values={levels} labels={copy.levelLabels} />
      <ConnectorBracket />
      <SummaryPanel values={summary} stateLabel={copy.stateLabel} privateLabel={copy.privateLabel} />
    </div>
  )
}

function SourceText({ value }: { value: string }) {
  const separator = value.indexOf(':')
  if (separator < 0) return <>{value}</>
  return <><strong>{value.slice(0, separator + 1)}</strong>{value.slice(separator + 1)}</>
}

export function EducationSystemOverview({ data, onEdit }: EducationSystemOverviewProps) {
  const copy = data.copy
  return (
    <section className="education-universe" aria-label={copy.title}>
      <header>
        <h4><strong>{copy.title}</strong><span>| {copy.subtitle}</span></h4>
        {onEdit && <button type="button" title="Editar cifras y textos del sistema educativo" aria-label="Editar cifras y textos del sistema educativo" onClick={onEdit}><Pencil size={15} /></button>}
      </header>
      <div className="education-universe-body">
        <EducationBand icon={schoolIcon} total={data.schools} label={copy.schoolsLabel} levels={data.schoolLevels} summary={data.schoolSummary} copy={copy} />
        <EducationBand icon={studentsIcon} total={data.students} label={copy.studentsLabel} levels={data.studentLevels} summary={data.studentSummary} copy={copy} note={copy.enrollmentNote} />
        <div className="education-footer-band">
          <TotalPanel icon={teacherIcon} values={data.teachers} label={copy.teachersLabel} stateLabel={copy.stateLabel} privateLabel={copy.privateLabel} note={copy.teacherNote} />
          <div className="education-other-services">
            <strong>{copy.otherServicesTitle}</strong>
            <div>
              <span title={copy.schoolsLabel}><IconMask source={schoolIcon} className="is-service-icon" /><b>{data.otherServices.services}</b></span>
              <span title={copy.studentsLabel}><IconMask source={studentsIcon} className="is-service-icon" /><b>{data.otherServices.students}</b></span>
            </div>
          </div>
        </div>
      </div>
      <footer className="education-source-footer">
        <p><SourceText value={copy.sources} /></p>
      </footer>
    </section>
  )
}

function TextInput({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <label className={multiline ? 'is-multiline' : ''}>{label}{multiline ? <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} /> : <input value={value} onChange={(event) => onChange(event.target.value)} />}</label>
}

function NumberInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<input inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function SectorEditor({ title, values, onChange }: { title: string; values: EducationSectorCounts; onChange: (values: EducationSectorCounts) => void }) {
  return (
    <fieldset className="education-sector-editor">
      <legend>{title}</legend>
      <NumberInput label={`Total de ${title.toLocaleLowerCase('es')}`} value={values.total} onChange={(total) => onChange({ ...values, total })} />
      <NumberInput label={`Estatal de ${title.toLocaleLowerCase('es')}`} value={values.state} onChange={(state) => onChange({ ...values, state })} />
      <NumberInput label={`Privada de ${title.toLocaleLowerCase('es')}`} value={values.private} onChange={(privateValue) => onChange({ ...values, private: privateValue })} />
    </fieldset>
  )
}

function LevelsEditor({ title, values, onChange }: { title: string; values: EducationSystemData['schoolLevels']; onChange: (values: EducationSystemData['schoolLevels']) => void }) {
  return (
    <div className="education-levels-editor">
      <h4>{title}</h4>
      <div className="education-levels-editor-head"><span>Nivel</span><span>Total</span><span>Estatal</span><span>Privada</span></div>
      {educationLevels.map((level) => <div className="education-level-editor-row" key={level}>
        <strong>{educationLevelLabels[level]}</strong>
        {(['total', 'state', 'private'] as const).map((field) => <input key={field} aria-label={`${educationLevelLabels[level]} - ${field === 'total' ? 'Total' : field === 'state' ? 'Estatal' : 'Privada'} de ${title.toLocaleLowerCase('es')}`} inputMode="numeric" value={values[level][field]} onChange={(event) => onChange({ ...values, [level]: { ...values[level], [field]: event.target.value } })} />)}
      </div>)}
    </div>
  )
}

function CopyEditor({ copy, onChange }: { copy: EducationSystemCopy; onChange: (copy: EducationSystemCopy) => void }) {
  const update = (field: keyof Omit<EducationSystemCopy, 'levelLabels'>, value: string) => onChange({ ...copy, [field]: value })
  return (
    <fieldset className="education-copy-editor">
      <legend>Textos de la visualización</legend>
      <div className="education-copy-grid">
        <TextInput label="Título de la visualización" value={copy.title} onChange={(value) => update('title', value)} />
        <TextInput label="Subtítulo de la visualización" value={copy.subtitle} onChange={(value) => update('subtitle', value)} />
        <TextInput label="Etiqueta de escuelas" value={copy.schoolsLabel} onChange={(value) => update('schoolsLabel', value)} />
        <TextInput label="Etiqueta de estudiantes" value={copy.studentsLabel} onChange={(value) => update('studentsLabel', value)} />
        <TextInput label="Etiqueta de docentes" value={copy.teachersLabel} onChange={(value) => update('teachersLabel', value)} />
        <TextInput label="Etiqueta estatal" value={copy.stateLabel} onChange={(value) => update('stateLabel', value)} />
        <TextInput label="Etiqueta privada" value={copy.privateLabel} onChange={(value) => update('privateLabel', value)} />
        <TextInput label="Título de otros servicios" value={copy.otherServicesTitle} onChange={(value) => update('otherServicesTitle', value)} />
      </div>
      <div className="education-copy-levels">
        {educationLevels.map((level) => <TextInput key={level} label={`Nombre del nivel ${educationLevelLabels[level]}`} value={copy.levelLabels[level]} onChange={(value) => onChange({ ...copy, levelLabels: { ...copy.levelLabels, [level]: value } })} />)}
      </div>
      <TextInput multiline label="Nota de matrícula" value={copy.enrollmentNote} onChange={(value) => update('enrollmentNote', value)} />
      <TextInput multiline label="Nota de docentes" value={copy.teacherNote} onChange={(value) => update('teacherNote', value)} />
      <TextInput multiline label="Fuentes" value={copy.sources} onChange={(value) => update('sources', value)} />
    </fieldset>
  )
}

export function EducationSystemEditor({ data, onChange }: EducationSystemEditorProps) {
  return (
    <div className="education-system-editor">
      <CopyEditor copy={data.copy} onChange={(copy) => onChange({ ...data, copy })} />
      <div className="education-editor-group">
        <SectorEditor title="Establecimientos" values={data.schools} onChange={(schools) => onChange({ ...data, schools })} />
        <SectorEditor title="Resumen de establecimientos" values={data.schoolSummary} onChange={(schoolSummary) => onChange({ ...data, schoolSummary })} />
      </div>
      <LevelsEditor title="Establecimientos" values={data.schoolLevels} onChange={(schoolLevels) => onChange({ ...data, schoolLevels })} />
      <div className="education-editor-group">
        <SectorEditor title="Estudiantes" values={data.students} onChange={(students) => onChange({ ...data, students })} />
        <SectorEditor title="Resumen de estudiantes" values={data.studentSummary} onChange={(studentSummary) => onChange({ ...data, studentSummary })} />
      </div>
      <LevelsEditor title="Estudiantes" values={data.studentLevels} onChange={(studentLevels) => onChange({ ...data, studentLevels })} />
      <div className="education-editor-group education-editor-last-row">
        <SectorEditor title="Docentes" values={data.teachers} onChange={(teachers) => onChange({ ...data, teachers })} />
        <fieldset className="education-sector-editor">
          <legend>Otros servicios educativos</legend>
          <NumberInput label="Otros servicios - Servicios" value={data.otherServices.services} onChange={(services) => onChange({ ...data, otherServices: { ...data.otherServices, services } })} />
          <NumberInput label="Otros servicios - Estudiantes" value={data.otherServices.students} onChange={(students) => onChange({ ...data, otherServices: { ...data.otherServices, students } })} />
        </fieldset>
      </div>
    </div>
  )
}
