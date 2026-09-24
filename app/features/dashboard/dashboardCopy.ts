/**
 * 数据看板在「出勤统计」两种状态下的文案。
 *
 * 为什么单独抽成模块：这些句子是**对用户的承诺**（开启时承诺完成度/缺勤率/风险课程，
 * 关闭时不能继续承诺），改一处忘一处就会出现「看板说好的东西找不到」。
 * 抽出来之后两态都有单测钉住，页面只负责按状态取用。
 */

/** 页面副标题：开启态与改动前逐字一致。 */
export function getDashboardSubtitle(attendanceEnabled: boolean): string {
  return attendanceEnabled ? '展示课程完成度、缺勤率、课程分布和风险课程分析。' : '展示课程分布与课表结构分析。'
}

/** 无课程时的空态说明；关闭态不再承诺完成度与缺勤率。 */
export function getDashboardEmptyDescription(attendanceEnabled: boolean): string {
  return attendanceEnabled
    ? '请先导入课程表，数据看板会自动生成完成度、缺勤率和课程分布分析。'
    : '请先导入课程表，数据看板会自动生成课程分布与课表结构分析。'
}

/**
 * 关闭出勤时顶部那条提示卡的文案。
 *
 * 「已记录的出勤数据仍保留在本地与备份中」这句**不能删**：用户看不到标记时的第一反应是记录丢了。
 */
export const ATTENDANCE_OFF_HINT = {
  title: '出勤统计已关闭',
  description:
    '完成度、缺勤率、周趋势和风险课程都依赖出勤标记。开启后可以在课程表标记每节课是否上，数据看板会恢复这些统计；已记录的出勤数据仍保留在本地与备份中。',
  action: '去开启',
} as const
