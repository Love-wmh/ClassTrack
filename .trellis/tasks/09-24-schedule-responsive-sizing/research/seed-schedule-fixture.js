/**
 * 前台课表响应式尺度验收夹具。
 *
 * 用途：给 `class-track-storage`（persist version 4）灌一份「覆盖全部格型」的课程数据，
 * 让浏览器验收脚本能逐格断言字号 / 溢出 / 丢行顺序。
 *
 * 用法（必须走 storage 通道再 reload，直接 eval 写 localStorage 会被运行中的应用回写覆盖）：
 *   node -e 'const fs=require("fs");const s={};new Function("localStorage",fs.readFileSync(process.argv[1],"utf8"))({setItem:(k,v)=>s[k]=String(v),getItem:()=>null});fs.writeFileSync("/tmp/claude/seed.json",s["class-track-storage"])' research/seed-schedule-fixture.js
 *   agent-browser storage local set class-track-storage "$(cat /tmp/claude/seed.json)"
 *   agent-browser reload
 *
 * 覆盖面（对应 implement.md 0.3）：
 *   - 20 字超长中文课名 × 2 节格 / 1 节矮格（极端兜底场景）
 *   - 含不可断拉丁 token 的课名（`概率与统计 (Python)`）
 *   - 1 节格的短课名
 *   - 单双周课（`data-course-parity`）
 *   - 非本周课（当前周 3 不在 weeks 内）
 *   - 周六 / 周日整周无课
 *   - currentWeek = 9 时全周无课（供 AC-D5 全空周保护）
 *   - 出勤标记（已上 / 未上 + 备注）
 */

const SEMESTER_CODE = '2026-2027-1'
/** 课程覆盖周：1–8。于是 currentWeek = 9 时整周无课（供全空周验收）。 */
const teachWeeks = [1, 2, 3, 4, 5, 6, 7, 8]
const oddWeeks = [1, 3, 5, 7]

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
  semester: SEMESTER_CODE,
  courseId: o.id,
  classId: o.id,
  courseType: '必修',
  courseCategory: '专业课',
})

const classes = [
  // ① 20 字超长课名 × 2 节格（1-2 / 5-6）—— 现状会被兜底缩字号
  mk({ id: 'mao-12', name: '毛泽东思想和中国特色社会主义理论体系概论', teacher: '王芳', classroom: '28-A203', startTime: '08:00', endTime: '09:40', dayOfWeek: 1, startSection: 1, endSection: 2, weeks: teachWeeks }),
  mk({ id: 'mao-56', name: '毛泽东思想和中国特色社会主义理论体系概论', teacher: '王芳', classroom: '28-A203', startTime: '14:00', endTime: '15:40', dayOfWeek: 3, startSection: 5, endSection: 6, weeks: teachWeeks }),
  // ② 20 字超长课名 × **1 节矮格**（16:10 单节）—— AC-A6 的极端场景
  mk({ id: 'mao-11', name: '毛泽东思想和中国特色社会主义理论体系概论', teacher: '王芳', classroom: '28-A203', startTime: '16:10', endTime: '16:55', dayOfWeek: 1, startSection: 11, endSection: 11, weeks: teachWeeks }),

  // ③ 不可断拉丁 token：`(Python)` 的 min-content 比内边距盒还宽 —— AC-A3 的关键格子
  mk({ id: 'py-34', name: '概率与统计 (Python)', teacher: '张珈玮', classroom: '6-0303', startTime: '10:10', endTime: '11:50', dayOfWeek: 4, startSection: 3, endSection: 4, weeks: teachWeeks }),
  mk({ id: 'py-78', name: '概率与统计 (Python)', teacher: '张珈玮', classroom: '6-0303', startTime: '16:10', endTime: '17:50', dayOfWeek: 1, startSection: 7, endSection: 8, weeks: teachWeeks }),

  // ④ 普通长度课名（对照组：应当得到与 ① 相同的字号）
  mk({ id: 'os-12', name: '面向对象的程序设计', teacher: '李磊', classroom: '4-0101', startTime: '08:00', endTime: '09:40', dayOfWeek: 3, startSection: 1, endSection: 2, weeks: teachWeeks }),
  mk({ id: 'os-56', name: '面向对象的程序设计', teacher: '李磊', classroom: '4-0101', startTime: '14:00', endTime: '15:40', dayOfWeek: 1, startSection: 5, endSection: 6, weeks: teachWeeks }),
  mk({ id: 'ds-12', name: '数据结构', teacher: '佟丽', classroom: '28-B103', startTime: '08:00', endTime: '09:40', dayOfWeek: 4, startSection: 1, endSection: 2, weeks: teachWeeks }),
  mk({ id: 'co-12', name: '计算机组成与结构', teacher: '李双喜', classroom: '28-A408', startTime: '08:00', endTime: '09:40', dayOfWeek: 2, startSection: 1, endSection: 2, weeks: teachWeeks }),

  // ⑤ 1 节格的短课名（应能拿到比矮格长课名更大的可用行数）
  mk({ id: 'pe-9', name: '体育', teacher: '刘瀚文', classroom: '排球场', startTime: '18:30', endTime: '19:15', dayOfWeek: 5, startSection: 9, endSection: 9, weeks: teachWeeks }),

  // ⑥ 单双周课（`data-course-parity` 只在手机端渲染）
  mk({ id: 'en-odd', name: '专业英语听说写II', teacher: '赵源超', classroom: '28-B101', startTime: '10:10', endTime: '11:50', dayOfWeek: 5, startSection: 3, endSection: 4, weeks: oddWeeks }),

  // ⑦ 非本周课：当前周 3 不在 weeks 内（开启「淡化显示非本周课程」后占格，算「有课」）
  mk({ id: 'out-56', name: '形势与政策', teacher: '孙宁', classroom: '2-0301', startTime: '14:00', endTime: '15:40', dayOfWeek: 2, startSection: 5, endSection: 6, weeks: [4, 5, 6] }),

  // ⑧ 周六有课：D 组开启后「周六有课、周日无课」应只收窄周日
  mk({ id: 'sat-78', name: '创新创业实践', teacher: '周涛', classroom: '实训楼', startTime: '16:10', endTime: '17:50', dayOfWeek: 6, startSection: 7, endSection: 8, weeks: teachWeeks }),
]

const classMarks = {
  // 已上（打勾）
  'mao-12-3': { classId: 'mao-12', week: 3, isAttended: true, note: '', attendanceMarked: true },
  // 未上 + 备注（触发淡化 + 备注行）
  'ds-12-3': { classId: 'ds-12', week: 3, isAttended: false, note: '带实验报告', attendanceMarked: true },
  // 只写备注、没做出勤判断（不得被算成缺勤）
  'co-12-3': { classId: 'co-12', week: 3, isAttended: false, note: '调课到周五', attendanceMarked: false },
}

const now = new Date().toISOString()
const semester = {
  id: 'sem-1',
  name: '2026-2027 第1学期',
  code: SEMESTER_CODE,
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
  schemaVersion: 4,
}

localStorage.setItem('class-track-storage', JSON.stringify({ state, version: 4 }))
// 回读用的写入标记，避免用表达式语句结尾（仓库 ESLint 会拒绝未使用的表达式）
localStorage.setItem('class-track-seed-size', String(classes.length))
