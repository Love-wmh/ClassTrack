import type { Class } from '~/lib/types'
import { getCourseKey } from '~/store/utils'
import type { SectionTime } from './utils'

/**
 * 补课可选的「源课程」。
 *
 * 补课只能从**现有课程**里选（用户诉求），所以这里把整学期课程按课程身份去重：
 * 同一门课（同 `getCourseKey`）只给一个选项，并记下它原本的节次长度，用来决定补课默认占几节。
 */
export type MakeupCourseOption = {
  /** 去重键（= `getCourseKey`），也作为列表项的 React key。 */
  key: string
  /** 作为模板的源课程（补课会克隆它的名称/教师/教室/课程号等）。 */
  source: Class
  /** 源课程原本的节次长度（endSection - startSection + 1），决定补课默认跨几节。 */
  length: number
}

/** 单元格占用键：`${dayOfWeek}-${section}`，与 `ScheduleTable` 的 `occupiedCells` 同构。 */
export function cellKey(dayOfWeek: number, section: number) {
  return `${dayOfWeek}-${section}`
}

/**
 * 把整学期课程去重成「可选源课程」列表。
 *
 * 按 `getCourseKey`（课程号-名称-教师）去重，取每组第一条作为模板，按课程名排序，方便在选择框里查找。
 *
 * @param classes 整学期课程（含已手动补课的）。
 * @returns 去重后的可选源课程，按课程名升序。
 */
export function getMakeupCourseOptions(classes: Class[]): MakeupCourseOption[] {
  const byKey = new Map<string, MakeupCourseOption>()

  for (const source of classes) {
    const key = getCourseKey(source)
    if (byKey.has(key)) continue
    byKey.set(key, {
      key,
      source,
      length: Math.max(1, source.endSection - source.startSection + 1),
    })
  }

  return Array.from(byKey.values()).sort((left, right) => left.source.name.localeCompare(right.source.name, 'zh-Hans-CN'))
}

/**
 * 计算补课从 `startSection` 起、最多 `desiredLength` 节时实际能占到的结束节次。
 *
 * 跟随源课程的节次长度，但遇到**已被占用的格子**或**超出第 12 节**就截断——补课绝不与现有课程重叠。
 *
 * @param occupied 当前周已占用单元格集合（键用 `cellKey`）。
 * @param dayOfWeek 目标星期。
 * @param startSection 起始节次（点击的空格子）。
 * @param desiredLength 期望占用的节数（通常为源课程长度）。
 * @param maxSection 课表最大节次，默认 12。
 * @returns 实际结束节次（≥ startSection）。
 */
export function getMakeupEndSection(
  occupied: ReadonlySet<string>,
  dayOfWeek: number,
  startSection: number,
  desiredLength: number,
  maxSection = 12
): number {
  let end = startSection
  for (let next = startSection + 1; next < startSection + desiredLength && next <= maxSection; next += 1) {
    if (occupied.has(cellKey(dayOfWeek, next))) break
    end = next
  }
  return end
}

/** 生成手动补课的唯一 id，避免与导入课程的 id 冲突。 */
export function createManualClassId() {
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 基于源课程构建一节「补课」`Class`。
 *
 * 补课与普通课程完全同构：复制源课程的名称/教师/教室/课程号等（因此颜色、看板统计、课程管理都自然归到同一门课），
 * 只把它放到目标 周次/星期/节次，并按目标节次重算上下课时间（源课的时间对应的是它自己的节次，不能照搬）。
 *
 * @param source 作为模板的源课程。
 * @param placement 目标位置与可推导的节次时间。
 * @returns 可直接 `addClass` 的补课对象（带 `isManual: true`）。
 */
export function buildMakeupClass(
  source: Class,
  placement: {
    week: number
    dayOfWeek: number
    startSection: number
    endSection: number
    sectionTimes: Record<number, SectionTime>
  }
): Class {
  const { week, dayOfWeek, startSection, endSection, sectionTimes } = placement

  return {
    ...source,
    id: createManualClassId(),
    dayOfWeek,
    startSection,
    endSection,
    startTime: sectionTimes[startSection]?.start ?? '',
    endTime: sectionTimes[endSection]?.end ?? '',
    weeks: [week],
    isManual: true,
  }
}
