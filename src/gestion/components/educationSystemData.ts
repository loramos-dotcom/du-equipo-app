export const educationLevels = ['initial', 'primary', 'secondary', 'adult', 'special', 'higher'] as const

export type EducationLevel = typeof educationLevels[number]

export interface EducationSectorCounts {
  total: string
  state: string
  private: string
}

export interface EducationSystemCopy {
  title: string
  subtitle: string
  schoolsLabel: string
  studentsLabel: string
  teachersLabel: string
  stateLabel: string
  privateLabel: string
  otherServicesTitle: string
  levelLabels: Record<EducationLevel, string>
  enrollmentNote: string
  teacherNote: string
  sources: string
}

export interface EducationSystemData {
  copy: EducationSystemCopy
  schools: EducationSectorCounts
  schoolLevels: Record<EducationLevel, EducationSectorCounts>
  schoolSummary: EducationSectorCounts
  students: EducationSectorCounts
  studentLevels: Record<EducationLevel, EducationSectorCounts>
  studentSummary: EducationSectorCounts
  teachers: EducationSectorCounts
  otherServices: {
    services: string
    students: string
  }
}

export const educationLevelLabels: Record<EducationLevel, string> = {
  initial: 'Inicial',
  primary: 'Primaria',
  secondary: 'Secundaria',
  adult: 'Adultos',
  special: 'Especial',
  higher: 'Superior',
}

function emptySector(): EducationSectorCounts {
  return { total: '', state: '', private: '' }
}

function emptyLevels(): Record<EducationLevel, EducationSectorCounts> {
  return Object.fromEntries(
    educationLevels.map(level => [level, emptySector()]),
  ) as Record<EducationLevel, EducationSectorCounts>
}

// Only generic labels belong in the public bundle. Operational values arrive
// through the authenticated project data and must never be seeded here.
export const defaultEducationSystemData: EducationSystemData = {
  copy: {
    title: 'Universo del Sistema Educativo',
    subtitle: 'Todos los niveles',
    schoolsLabel: 'escuelas',
    studentsLabel: 'estudiantes',
    teachersLabel: 'docentes',
    stateLabel: 'Estatal',
    privateLabel: 'Privada',
    otherServicesTitle: 'Otros servicios educativos',
    levelLabels: { ...educationLevelLabels },
    enrollmentNote: '',
    teacherNote: '',
    sources: '',
  },
  schools: emptySector(),
  schoolLevels: emptyLevels(),
  schoolSummary: emptySector(),
  students: emptySector(),
  studentLevels: emptyLevels(),
  studentSummary: emptySector(),
  teachers: emptySector(),
  otherServices: { services: '', students: '' },
}

export function educationValueText(value: string | null | undefined) {
  return value?.trim() ? value : '—'
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown, fallback: string) {
  return value == null ? fallback : String(value)
}

function sector(value: unknown, fallback: EducationSectorCounts): EducationSectorCounts {
  const source = record(value)
  return {
    total: text(source.total, fallback.total),
    state: text(source.state, fallback.state),
    private: text(source.private, fallback.private),
  }
}

function levels(value: unknown, fallback: Record<EducationLevel, EducationSectorCounts>) {
  const source = record(value)
  return Object.fromEntries(educationLevels.map((level) => [level, sector(source[level], fallback[level])])) as Record<EducationLevel, EducationSectorCounts>
}

export function isEducationSystemProjectName(value: string) {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
  return normalized.includes('datos del sistema educativo')
}

export function getEducationSystemData(metrics: Record<string, unknown>): EducationSystemData {
  const source = record(metrics.educationSystem)
  const copy = record(source.copy)
  const levelLabels = record(copy.levelLabels)
  const otherServices = record(source.otherServices)
  return {
    copy: {
      title: text(copy.title, defaultEducationSystemData.copy.title),
      subtitle: text(copy.subtitle, defaultEducationSystemData.copy.subtitle),
      schoolsLabel: text(copy.schoolsLabel, defaultEducationSystemData.copy.schoolsLabel),
      studentsLabel: text(copy.studentsLabel, defaultEducationSystemData.copy.studentsLabel),
      teachersLabel: text(copy.teachersLabel, defaultEducationSystemData.copy.teachersLabel),
      stateLabel: text(copy.stateLabel, defaultEducationSystemData.copy.stateLabel),
      privateLabel: text(copy.privateLabel, defaultEducationSystemData.copy.privateLabel),
      otherServicesTitle: text(copy.otherServicesTitle, defaultEducationSystemData.copy.otherServicesTitle),
      levelLabels: Object.fromEntries(educationLevels.map((level) => [level, text(levelLabels[level], defaultEducationSystemData.copy.levelLabels[level])])) as Record<EducationLevel, string>,
      enrollmentNote: text(copy.enrollmentNote, defaultEducationSystemData.copy.enrollmentNote),
      teacherNote: text(copy.teacherNote, defaultEducationSystemData.copy.teacherNote),
      sources: text(copy.sources, defaultEducationSystemData.copy.sources),
    },
    schools: sector(source.schools, defaultEducationSystemData.schools),
    schoolLevels: levels(source.schoolLevels, defaultEducationSystemData.schoolLevels),
    schoolSummary: sector(source.schoolSummary, defaultEducationSystemData.schoolSummary),
    students: sector(source.students, defaultEducationSystemData.students),
    studentLevels: levels(source.studentLevels, defaultEducationSystemData.studentLevels),
    studentSummary: sector(source.studentSummary, defaultEducationSystemData.studentSummary),
    teachers: sector(source.teachers, defaultEducationSystemData.teachers),
    otherServices: {
      services: text(otherServices.services, defaultEducationSystemData.otherServices.services),
      students: text(otherServices.students, defaultEducationSystemData.otherServices.students),
    },
  }
}

export function setEducationSystemData(metrics: Record<string, unknown>, data: EducationSystemData) {
  return { ...metrics, educationSystem: data }
}
