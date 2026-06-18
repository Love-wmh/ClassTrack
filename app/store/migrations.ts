import type { AppData, Class, ClassMark, School, Semester } from '~/lib/types'

export const CLASS_TRACK_SCHEMA_VERSION = 2

type LegacyAppData = Partial<Omit<AppData, 'semesters' | 'currentSemesterId' | 'schemaVersion'>> & {
  semesters?: unknown
  currentSemesterId?: unknown
  schemaVersion?: unknown
}

type CreateSemesterInput = {
  name?: string
  code?: string
  schoolId?: string
  classes?: Class[]
  classMarks?: Record<string, ClassMark>
  currentWeek?: number
  firstWeekStartDate?: string | null
}

export function createEmptyAppData(): AppData {
  return {
    school: null,
    classes: [],
    classMarks: {},
    currentWeek: 1,
    isInitialized: false,
    firstWeekStartDate: null,
    semesters: [],
    currentSemesterId: null,
    schemaVersion: CLASS_TRACK_SCHEMA_VERSION,
  }
}

export function createSemester(input: CreateSemesterInput = {}, now = new Date().toISOString()): Semester {
  const classes = Array.isArray(input.classes) ? input.classes : []
  const code = input.code?.trim() || inferSemesterCode(classes)
  const name = input.name?.trim() || formatSemesterName(code) || '新学期'

  return {
    id: createSemesterId(code || name, now),
    name,
    code,
    schoolId: input.schoolId,
    classes,
    classMarks: input.classMarks || {},
    currentWeek: input.currentWeek || 1,
    firstWeekStartDate: input.firstWeekStartDate ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

export function migrateClassTrackState(persistedState: unknown): AppData {
  const rawState = isRecord(persistedState) ? (persistedState as LegacyAppData) : {}
  const semesters = normalizeSemesters(rawState.semesters)

  if (semesters.length > 0) {
    const currentSemesterId =
      typeof rawState.currentSemesterId === 'string' && semesters.some((semester) => semester.id === rawState.currentSemesterId)
        ? rawState.currentSemesterId
        : semesters[0].id
    const activeSemester = semesters.find((semester) => semester.id === currentSemesterId) || semesters[0]

    return {
      school: normalizeSchool(rawState.school),
      classes: activeSemester.classes,
      classMarks: activeSemester.classMarks,
      currentWeek: activeSemester.currentWeek,
      isInitialized: Boolean(rawState.isInitialized || activeSemester.classes.length > 0),
      firstWeekStartDate: activeSemester.firstWeekStartDate,
      semesters,
      currentSemesterId: activeSemester.id,
      schemaVersion: CLASS_TRACK_SCHEMA_VERSION,
    }
  }

  const classes = normalizeClasses(rawState.classes)
  const classMarks = normalizeClassMarks(rawState.classMarks)
  const firstWeekStartDate = normalizeNullableString(rawState.firstWeekStartDate)
  const currentWeek = normalizeWeek(rawState.currentWeek)

  if (classes.length === 0 && Object.keys(classMarks).length === 0 && !firstWeekStartDate) {
    return {
      ...createEmptyAppData(),
      school: normalizeSchool(rawState.school),
      isInitialized: Boolean(rawState.isInitialized),
    }
  }

  const migratedSemester = createSemester({
    name: formatSemesterName(inferSemesterCode(classes)) || '历史学期',
    code: inferSemesterCode(classes),
    schoolId: normalizeSchool(rawState.school)?.id,
    classes,
    classMarks,
    currentWeek,
    firstWeekStartDate,
  })

  return {
    school: normalizeSchool(rawState.school),
    classes: migratedSemester.classes,
    classMarks: migratedSemester.classMarks,
    currentWeek: migratedSemester.currentWeek,
    isInitialized: Boolean(rawState.isInitialized || classes.length > 0),
    firstWeekStartDate: migratedSemester.firstWeekStartDate,
    semesters: [migratedSemester],
    currentSemesterId: migratedSemester.id,
    schemaVersion: CLASS_TRACK_SCHEMA_VERSION,
  }
}

export function normalizeImportedData(data: unknown): AppData | null {
  if (!isRecord(data)) return null

  return migrateClassTrackState(data)
}

export function inferSemesterCode(classes: Class[]) {
  const counts = classes.reduce<Record<string, number>>((result, classItem) => {
    const semester = classItem.semester?.trim()
    if (!semester) return result
    result[semester] = (result[semester] || 0) + 1
    return result
  }, {})

  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] || ''
}

export function formatSemesterName(code: string) {
  const trimmed = code.trim()
  const match = trimmed.match(/^(\d{4})-(\d{4})-(\d+)$/)
  if (!match) return trimmed

  return `${match[1]}-${match[2]} 第${toChineseNumber(Number(match[3]))}学期`
}

export function createSemesterId(seed: string, now = new Date().toISOString()) {
  const base = `${seed || 'semester'}-${now}`
  let hash = 0

  for (let index = 0; index < base.length; index += 1) {
    hash = (hash * 31 + base.charCodeAt(index)) >>> 0
  }

  return `semester-${hash.toString(36)}`
}

export function ensureUniqueSemesterId(semester: Semester, semesters: Semester[]) {
  if (!semesters.some((item) => item.id === semester.id)) return semester

  let index = 2
  let id = `${semester.id}-${index}`
  while (semesters.some((item) => item.id === id)) {
    index += 1
    id = `${semester.id}-${index}`
  }

  return { ...semester, id }
}

function normalizeSemesters(value: unknown): Semester[] {
  if (!Array.isArray(value)) return []

  return value.filter(isRecord).map((item) => {
    const classes = normalizeClasses(item.classes)
    const code = normalizeString(item.code) || inferSemesterCode(classes)
    const name = normalizeString(item.name) || formatSemesterName(code) || '历史学期'
    const now = new Date().toISOString()

    return {
      id: normalizeString(item.id) || createSemesterId(code || name),
      name,
      code,
      schoolId: normalizeString(item.schoolId) || undefined,
      classes,
      classMarks: normalizeClassMarks(item.classMarks),
      currentWeek: normalizeWeek(item.currentWeek),
      firstWeekStartDate: normalizeNullableString(item.firstWeekStartDate),
      createdAt: normalizeString(item.createdAt) || now,
      updatedAt: normalizeString(item.updatedAt) || now,
    }
  })
}

function normalizeClasses(value: unknown): Class[] {
  return Array.isArray(value) ? (value as Class[]) : []
}

function normalizeClassMarks(value: unknown): Record<string, ClassMark> {
  return isRecord(value) ? (value as Record<string, ClassMark>) : {}
}

function normalizeSchool(value: unknown): School | null {
  if (!isRecord(value)) return null
  const id = normalizeString(value.id)
  const name = normalizeString(value.name)
  if (!id || !name) return null
  return { id, name }
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeWeek(value: unknown) {
  const week = Number(value)
  return Number.isFinite(week) && week > 0 ? Math.floor(week) : 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function toChineseNumber(value: number) {
  const numbers: Record<number, string> = {
    1: '一',
    2: '二',
    3: '三',
    4: '四',
  }

  return numbers[value] || String(value)
}
