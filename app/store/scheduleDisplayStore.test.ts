import { describe, expect, it } from 'vitest'
import { scheduleDisplayPersistOptions, useScheduleDisplayStore } from './scheduleDisplayStore'

describe('scheduleDisplayStore', () => {
  it('默认显示出勤状态、不显示非本周课程、不收起无课日期列、开启边缘滑动切换周', () => {
    const state = useScheduleDisplayStore.getState()

    expect(state.showAttendanceStatus).toBe(true)
    expect(state.showOutOfWeekCourses).toBe(false)
    // 「收起整周无课的日期列」会让列宽随当前展示周变化，属于用户显式选择才开启的取舍
    expect(state.collapseEmptyWeekdayColumns).toBe(false)
    // 「左右边缘滑动切换周」是补强手势（滑到边缘才有反应），默认开启
    expect(state.edgeSwipeWeekSwitch).toBe(true)
  })

  it('开关可切换', () => {
    useScheduleDisplayStore.getState().setShowAttendanceStatus(false)
    useScheduleDisplayStore.getState().setShowOutOfWeekCourses(true)

    expect(useScheduleDisplayStore.getState().showAttendanceStatus).toBe(false)
    expect(useScheduleDisplayStore.getState().showOutOfWeekCourses).toBe(true)

    useScheduleDisplayStore.getState().setShowAttendanceStatus(true)
    useScheduleDisplayStore.getState().setShowOutOfWeekCourses(false)
  })

  it('收起无课日期列的开关可切换', () => {
    useScheduleDisplayStore.getState().setCollapseEmptyWeekdayColumns(true)

    expect(useScheduleDisplayStore.getState().collapseEmptyWeekdayColumns).toBe(true)

    useScheduleDisplayStore.getState().setCollapseEmptyWeekdayColumns(false)

    expect(useScheduleDisplayStore.getState().collapseEmptyWeekdayColumns).toBe(false)
  })

  it('边缘滑动切换周的开关可切换', () => {
    useScheduleDisplayStore.getState().setEdgeSwipeWeekSwitch(false)

    expect(useScheduleDisplayStore.getState().edgeSwipeWeekSwitch).toBe(false)

    useScheduleDisplayStore.getState().setEdgeSwipeWeekSwitch(true)

    expect(useScheduleDisplayStore.getState().edgeSwipeWeekSwitch).toBe(true)
  })

  it('持久化白名单包含四个显示开关（漏一个会让旧数据丢值）', () => {
    const partialize = scheduleDisplayPersistOptions.partialize

    expect(partialize).toBeTypeOf('function')

    const persisted = partialize?.(useScheduleDisplayStore.getState()) as Record<string, unknown> | undefined

    expect(persisted).toBeDefined()
    expect(Object.keys(persisted ?? {}).sort()).toEqual(
      ['collapseEmptyWeekdayColumns', 'showAttendanceStatus', 'showOutOfWeekCourses', 'edgeSwipeWeekSwitch'].sort()
    )
    expect(persisted?.collapseEmptyWeekdayColumns).toBe(false)
    expect(persisted?.edgeSwipeWeekSwitch).toBe(true)
  })

  it('旧数据缺少新字段时回落到默认值（merge 不能把 false 当成 undefined 丢掉）', () => {
    const merge = scheduleDisplayPersistOptions.merge

    expect(merge).toBeTypeOf('function')

    const current = useScheduleDisplayStore.getState()
    // 模拟「只有 v1 两个字段」的旧持久化数据
    const merged = merge?.({ showAttendanceStatus: false, showOutOfWeekCourses: true }, current) as Record<string, unknown>

    expect(merged.showAttendanceStatus).toBe(false)
    expect(merged.showOutOfWeekCourses).toBe(true)
    expect(merged.collapseEmptyWeekdayColumns).toBe(false)

    // 反过来：显式持久化的 true 必须被保留（不能因为 `?? ` 与 falsy 判断写反而丢掉）
    const mergedTrue = merge?.({ collapseEmptyWeekdayColumns: true }, current) as Record<string, unknown>

    expect(mergedTrue.collapseEmptyWeekdayColumns).toBe(true)
  })

  it('边缘滑动切换周：缺字段回落默认 true，显式 false 必须保留（F7 的持久化侧）', () => {
    const merge = scheduleDisplayPersistOptions.merge

    expect(merge).toBeTypeOf('function')

    const current = useScheduleDisplayStore.getState()
    // 旧数据里根本没有这个字段 → 必须回落到「默认开启」
    const missingField = merge?.({ showAttendanceStatus: true, showOutOfWeekCourses: false }, current) as Record<string, unknown>

    expect(missingField.edgeSwipeWeekSwitch).toBe(true)

    // 用户显式关掉后落盘的 false 是合法值，不能被 `??` / falsy 判断吃掉
    const explicitlyOff = merge?.({ edgeSwipeWeekSwitch: false }, current) as Record<string, unknown>

    expect(explicitlyOff.edgeSwipeWeekSwitch).toBe(false)
  })

  it('持久化 key 保持 class-track-schedule-display（不能混进业务 store）', () => {
    expect(scheduleDisplayPersistOptions.name).toBe('class-track-schedule-display')
  })
})
