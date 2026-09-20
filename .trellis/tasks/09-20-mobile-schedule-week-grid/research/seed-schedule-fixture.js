const code = '2026-2027-1'
const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
const odd = [1, 3, 5, 7, 9, 11, 13, 15]
const mk = (o) => ({
  id: o.id,
  name: o.name,
  teacher: o.teacher,
  classroom: o.classroom,
  startTime: o.startTime,
  endTime: o.endTime,
  dayOfWeek: o.dayOfWeek,
  startSection: o.startSection,
  endSection: o.endSection,
  weeks: o.weeks,
  semester: code,
  courseId: o.id,
  classId: o.id,
  courseType: '必修',
  courseCategory: '专业课',
})

const classes = [
  mk({ id: 'm1', name: '毛泽东思想和中国特色社会主义理论体系概论', teacher: '王芳', classroom: '28-A203', startTime: '08:00', endTime: '09:40', dayOfWeek: 1, startSection: 1, endSection: 2, weeks: all }),
  mk({ id: 'm2', name: '毛泽东思想和中国特色社会主义理论体系概论', teacher: '王芳', classroom: '28-A203', startTime: '14:00', endTime: '15:40', dayOfWeek: 3, startSection: 5, endSection: 6, weeks: all }),
  mk({ id: 'c1', name: '计算机组成与结构', teacher: '李双喜', classroom: '28-A408', startTime: '08:00', endTime: '09:40', dayOfWeek: 2, startSection: 1, endSection: 2, weeks: all }),
  mk({ id: 'c2', name: '计算机组成与结构', teacher: '李双喜', classroom: '28-A408', startTime: '14:00', endTime: '15:40', dayOfWeek: 2, startSection: 5, endSection: 6, weeks: all }),
  mk({ id: 'c3', name: '计算机组成与结构', teacher: '李双喜', classroom: '28-A408', startTime: '16:10', endTime: '17:50', dayOfWeek: 4, startSection: 7, endSection: 8, weeks: all }),
  mk({ id: 'o1', name: '面向对象的程序设计', teacher: '李磊', classroom: '4-0101', startTime: '08:00', endTime: '09:40', dayOfWeek: 3, startSection: 1, endSection: 2, weeks: all }),
  mk({ id: 'o2', name: '面向对象的程序设计', teacher: '李磊', classroom: '4-0101', startTime: '14:00', endTime: '15:40', dayOfWeek: 1, startSection: 5, endSection: 6, weeks: all }),
  mk({ id: 'd1', name: '数据结构', teacher: '佟丽', classroom: '28-B103', startTime: '08:00', endTime: '09:40', dayOfWeek: 4, startSection: 1, endSection: 2, weeks: all }),
  mk({ id: 'd2', name: '数据结构', teacher: '佟丽', classroom: '28-B103', startTime: '10:10', endTime: '11:50', dayOfWeek: 2, startSection: 3, endSection: 4, weeks: all }),
  mk({ id: 'e1', name: '大学英语Ⅲ', teacher: '吴自选', classroom: '28-B106', startTime: '10:10', endTime: '11:50', dayOfWeek: 1, startSection: 3, endSection: 4, weeks: odd }),
  mk({ id: 'p1', name: '概率与统计（Python）', teacher: '张珈玮', classroom: '6-0303', startTime: '10:10', endTime: '11:50', dayOfWeek: 4, startSection: 3, endSection: 4, weeks: all }),
  mk({ id: 'p2', name: '概率与统计（Python）', teacher: '张珈玮', classroom: '6-0303', startTime: '16:10', endTime: '17:50', dayOfWeek: 1, startSection: 7, endSection: 8, weeks: all }),
  mk({ id: 'n1', name: '专业英语听说写Ⅱ', teacher: '赵源超', classroom: '28-B101', startTime: '10:10', endTime: '11:50', dayOfWeek: 5, startSection: 3, endSection: 4, weeks: all }),
  mk({ id: 'n2', name: '专业英语听说写Ⅱ', teacher: '赵源超', classroom: '28-B205', startTime: '16:10', endTime: '17:50', dayOfWeek: 2, startSection: 7, endSection: 8, weeks: odd }),
  mk({ id: 's1', name: '体育Ⅲ', teacher: '刘瀚文', classroom: '排球场2号场地', startTime: '14:00', endTime: '15:40', dayOfWeek: 5, startSection: 5, endSection: 6, weeks: all }),
  mk({ id: 'r1', name: '改革开放史', teacher: '肖莉梅', classroom: '1-0206', startTime: '18:30', endTime: '20:05', dayOfWeek: 2, startSection: 9, endSection: 10, weeks: all }),
  mk({ id: 'z1', name: '形势与政策', teacher: '陈静', classroom: '1-0103', startTime: '08:00', endTime: '09:40', dayOfWeek: 6, startSection: 1, endSection: 2, weeks: all }),
  mk({ id: 'x1', name: '大学物理实验', teacher: '孙涛', classroom: '9-B203', startTime: '10:10', endTime: '11:50', dayOfWeek: 7, startSection: 3, endSection: 4, weeks: all }),
]

const classMarks = {
  'm1-3': { classId: 'm1', week: 3, isAttended: true, note: '' },
  'e1-3': { classId: 'e1', week: 3, isAttended: true, note: '单周' },
  'd1-3': { classId: 'd1', week: 3, isAttended: false, note: '带实验报告' },
  'n2-3': { classId: 'n2', week: 3, isAttended: true, note: '单周' },
}

const now = new Date().toISOString()
const semester = {
  id: 'sem-1',
  name: '2026-2027 第1学期',
  code,
  schoolId: 'tjut',
  classes,
  classMarks,
  currentWeek: 3,
  firstWeekStartDate: '2026-08-31',
  courseMetadata: {},
  createdAt: now,
  updatedAt: now,
}

const state = {
  school: { id: 'tjut', name: '天津理工大学' },
  classes,
  classMarks,
  currentWeek: 3,
  isInitialized: true,
  firstWeekStartDate: '2026-08-31',
  semesters: [semester],
  currentSemesterId: 'sem-1',
  courseMetadata: {},
  schemaVersion: 3,
}

localStorage.setItem('class-track-storage', JSON.stringify({ state, version: 3 }))
'seeded:' + classes.length
