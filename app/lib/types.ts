// 原始课程数据类型 (来自 mockClass.json)
export interface RawClass {
  KCM: string // 课程名称
  SKJS: string // 授课教师
  JASMC: string // 教室名称
  KSSJ: string // 开始时间
  JSSJ: string // 结束时间
  SKXQ: number // 上课星期 (1-7)
  KSJC: number // 开始节次
  JSJC: number // 结束节次
  SKZC: string // 上课周次 (二进制字符串)
  XNXQDM: string // 学年学期代码
  KCH: string // 课程号
  JXBID: string // 教学班ID
  KCXZDM_DISPLAY: string // 课程性质显示
  KCLBDM_DISPLAY: string // 课程类别显示
}

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

// 学校类型
export interface School {
  id: string
  name: string
}

// 解析器类型
export interface ClassParser {
  id: string
  name: string
  description: string
  parse: (data: any) => Class[]
}

// 应用状态类型
export interface AppData {
  school: School | null
  classes: Class[]
  classMarks: Record<string, ClassMark>
  currentWeek: number
  isInitialized: boolean
  firstWeekStartDate: string | null // 第一周第一天的日期 (ISO 日期字符串)
}
