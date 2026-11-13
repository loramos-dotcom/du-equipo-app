import {test} from 'node:test'
import assert from 'node:assert/strict'
import {
  educationLevels,
  educationValueText,
  defaultEducationSystemData,
  getEducationSystemData,
  setEducationSystemData,
  type EducationSystemData,
} from '../src/gestion/components/educationSystemData.ts'

function operationalValues(data: EducationSystemData) {
  return [
    ...[data.schools, data.schoolSummary, data.students, data.studentSummary, data.teachers]
      .flatMap(sector => [sector.total, sector.state, sector.private]),
    ...[data.schoolLevels, data.studentLevels]
      .flatMap(levels => educationLevels.flatMap(level => [levels[level].total, levels[level].state, levels[level].private])),
    data.otherServices.services,
    data.otherServices.students,
    data.copy.enrollmentNote,
    data.copy.teacherNote,
    data.copy.sources,
  ]
}

function syntheticReceivedData(): EducationSystemData {
  const data = getEducationSystemData({})
  const sector = () => ({total: '9.876.543*', state: '0', private: '9.876.543'})
  for (const key of ['schools', 'schoolSummary', 'students', 'studentSummary', 'teachers'] as const) data[key] = sector()
  for (const key of ['schoolLevels', 'studentLevels'] as const) {
    for (const level of educationLevels) data[key][level] = sector()
  }
  data.students.total = '1 234 567'
  data.otherServices = {services: '0', students: '9.876.543'}
  data.copy = {
    ...data.copy,
    title: 'Visualización sintética',
    enrollmentNote: 'Nota sintética de matrícula.',
    teacherNote: 'Nota sintética de docentes.',
    sources: 'Fuente: escenario de prueba, sin información institucional.',
  }
  return data
}

test('El modelo público inicial no incluye cifras ni notas operativas y conserva las etiquetas genéricas', () => {
  assert.ok(operationalValues(defaultEducationSystemData).every(value => value === ''))
  const empty = getEducationSystemData({})
  assert.ok(operationalValues(empty).every(value => value === ''))
  assert.equal(empty.copy.schoolsLabel, 'escuelas')
  assert.deepEqual(Object.keys(empty.schoolLevels), [...educationLevels])
  assert.deepEqual(Object.keys(empty.studentLevels), [...educationLevels])
})

test('Una respuesta poblada conserva todas las cifras formateadas, notas y textos recibidos', () => {
  const received = syntheticReceivedData()
  const before = structuredClone(received)
  const normalized = getEducationSystemData({educationSystem: received})
  assert.deepEqual(normalized, before)
  assert.deepEqual(received, before)
  assert.equal(educationValueText(normalized.schools.total), received.schools.total)
  assert.equal(educationValueText(normalized.students.total), received.students.total)
  assert.equal(educationValueText(normalized.schools.state), '0')
})

test('Datos parciales o nulos permanecen ausentes sin rellenarse con cifras antiguas ni ceros inventados', () => {
  const data = getEducationSystemData({educationSystem: {
    schools: {total: '0', state: null},
    students: {state: 0},
    schoolLevels: {initial: {total: '9.876.543*'}},
    copy: {sources: ''},
  }})
  assert.deepEqual(data.schools, {total: '0', state: '', private: ''})
  assert.deepEqual(data.students, {total: '', state: '0', private: ''})
  assert.equal(data.schoolLevels.initial.total, '9.876.543*')
  assert.equal(data.schoolLevels.primary.total, '')
  assert.equal(data.copy.sources, '')
  assert.equal(educationValueText(data.schools.state), '—')
  assert.equal(educationValueText(data.students.state), '0')
})

test('Una edición permite guardar y volver a cargar el dato sin alterar otras métricas ni el registro anterior', () => {
  const received = syntheticReceivedData()
  const metrics = {educationSystem: received, anotherMetric: {label: 'Dato sintético', visible: true}}
  const previous = structuredClone(metrics)
  const edited = getEducationSystemData(metrics)
  edited.schoolLevels.primary.total = '0'
  edited.otherServices.students = ''
  edited.copy.sources = 'Fuente: edición sintética.'
  const saved: Record<string, unknown> = setEducationSystemData(metrics, edited)
  assert.deepEqual(metrics, previous)
  assert.equal(saved.anotherMetric, metrics.anotherMetric)
  assert.deepEqual(getEducationSystemData(saved), edited)
  assert.equal(getEducationSystemData(saved).otherServices.students, '')
})

test('Las lecturas no comparten sectores editables ni arrastran datos de una vista anterior', () => {
  const first = getEducationSystemData({})
  first.schools.total = '9.876.543*'
  first.schoolLevels.initial.total = '0'
  first.copy.levelLabels.initial = 'Nivel sintético'
  const next = getEducationSystemData({})
  assert.equal(first.schoolLevels.primary.total, '')
  assert.equal(next.schools.total, '')
  assert.equal(next.schoolLevels.initial.total, '')
  assert.equal(next.copy.levelLabels.initial, 'Inicial')
  assert.ok(operationalValues(defaultEducationSystemData).every(value => value === ''))
})

test('La presentación distingue ausencia de cero y conserva separadores, espacios y marcas suministradas', () => {
  for (const value of [undefined, null, '', '  ', '\n']) assert.equal(educationValueText(value), '—')
  for (const value of ['0', '9.876.543*', '1 234 567', ' 9.876.543 ']) assert.equal(educationValueText(value), value)
  for (const payload of [null, [], 'contenido inválido']) {
    assert.ok(operationalValues(getEducationSystemData({educationSystem: payload})).every(value => value === ''))
  }
})
