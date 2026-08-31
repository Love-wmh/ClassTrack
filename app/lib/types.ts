// 解析后的课程数据类型
export interface Class {
  id: string // 唯一标识符
  name: string // 课程名称
  teacher: string // 教师
  classroom: string // 教室
  startTime: string // 开始时间
  endTime: string // 结束时间
  dayOfWeek: number // 星期几 (1-7)
  startSection: number // 开始节次
  endSection: number // 结束节次
  weeks: number[] // 周次数组
  semester: string // 学年学期
  courseId: string // 课程号
  classId: string // 教学班ID
  courseType: string // 课程性质
  courseCategory: string // 课程类别
}

// 课程标记类型
export interface ClassMark {
  classId: string
  week: number
  isAttended: boolean // 是否上课
  note: string // 备注
}

export type CourseFieldContentType = 'text' | 'markdown'

export interface CourseField {
  id: string
  label: string
  content: string
  contentType: CourseFieldContentType
  canDelete: boolean
}

export interface CourseMetadata {
  fields: CourseField[]
}

export type CourseMetadataMap = Record<string, CourseMetadata>

// 学校类型
export interface School {
  id: string
  name: string
}

// 学期类型
export interface Semester {
  id: string
  name: string
  code: string
  schoolId?: string
  classes: Class[]
  classMarks: Record<string, ClassMark>
  currentWeek: number
  firstWeekStartDate: string | null
  courseMetadata: CourseMetadataMap
  createdAt: string
  updatedAt: string
}

// 解析器类型
export interface ClassParser {
  id: string
  name: string
  description: string
  parse: (data: unknown) => Class[]
}

// 书签脚本适配器类型
export interface BookmarkletAdapter {
  id: string
  schoolId: string
  name: string
  description: string
  educationalSystemUrl: string
  defaultTerm: string
  createScript: (params: { term: string }) => string
}

// 应用状态类型
export interface AppData {
  school: School | null
  classes: Class[]
  classMarks: Record<string, ClassMark>
  currentWeek: number
  isInitialized: boolean
  firstWeekStartDate: string | null // 第一周第一天的日期 (ISO 日期字符串)
  semesters: Semester[]
  currentSemesterId: string | null
  courseMetadata: CourseMetadataMap
  schemaVersion: 3
}
