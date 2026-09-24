/**
 * 「星期分布」与「节次分布」两张图在出勤开关两态下的**说明文案与数据系列**。
 *
 * 为什么单独抽成模块：`已上 / 缺勤` 是出勤口径的系列，关闭出勤时必须消失。而这两张图走
 * recharts 的 `ResponsiveContainer`，服务端渲染拿不到任何系列名，单测断言不到 DOM ——
 * 于是把「哪几个系列 + 什么说明」抽成纯函数，由单测直接钉住，组件只负责按结果画。
 */

export type WeekdayDistributionConfig = {
  description: string
  series: Array<{ key: '总课次' | '已上' | '缺勤'; fill: string }>
}

export type SectionDistributionConfig = {
  description: string
  series: Array<{ key: 'total' | 'attended' | 'absent'; name: string; fill: string }>
}

const TOTAL_FILL = '#111827'
const ATTENDED_FILL = '#10b981'
const ABSENT_FILL = '#ef4444'

/**
 * 「星期分布」的说明与系列。
 *
 * 关闭出勤统计时只保留「总课次」：一张只画总课次的分布图仍然回答「一周里哪天课最多」，
 * 保留它比整块撤掉更有用，同时承诺不越界。
 *
 * @param attendanceEnabled 「出勤统计」开关是否开启。
 * @returns 该状态下的说明文案与要渲染的系列。
 */
export function getWeekdayDistributionConfig(attendanceEnabled: boolean): WeekdayDistributionConfig {
  return attendanceEnabled
    ? {
        description: '观察一周内课程负担和缺勤分布。',
        series: [
          { key: '总课次', fill: TOTAL_FILL },
          { key: '已上', fill: ATTENDED_FILL },
          { key: '缺勤', fill: ABSENT_FILL },
        ],
      }
    : {
        description: '观察一周内的课程分布。',
        series: [{ key: '总课次', fill: TOTAL_FILL }],
      }
}

/**
 * 「节次分布」的说明与系列；规则同上。
 *
 * @param attendanceEnabled 「出勤统计」开关是否开启。
 * @returns 该状态下的说明文案与要渲染的系列。
 */
export function getSectionDistributionConfig(attendanceEnabled: boolean): SectionDistributionConfig {
  return attendanceEnabled
    ? {
        description: '按上课节次统计课程密度和完成情况。',
        series: [
          { key: 'total', name: '总课次', fill: TOTAL_FILL },
          { key: 'attended', name: '已上', fill: ATTENDED_FILL },
          { key: 'absent', name: '缺勤', fill: ABSENT_FILL },
        ],
      }
    : {
        description: '按上课节次统计课程密度。',
        series: [{ key: 'total', name: '总课次', fill: TOTAL_FILL }],
      }
}
