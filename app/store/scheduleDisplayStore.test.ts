import { describe, expect, it } from 'vitest'
import { useScheduleDisplayStore } from './scheduleDisplayStore'

describe('scheduleDisplayStore', () => {
  it('默认显示出勤状态、不显示非本周课程', () => {
    const state = useScheduleDisplayStore.getState()

    expect(state.showAttendanceStatus).toBe(true)
    expect(state.showOutOfWeekCourses).toBe(false)
  })

  it('开关可切换', () => {
    useScheduleDisplayStore.getState().setShowAttendanceStatus(false)
    useScheduleDisplayStore.getState().setShowOutOfWeekCourses(true)

    expect(useScheduleDisplayStore.getState().showAttendanceStatus).toBe(false)
    expect(useScheduleDisplayStore.getState().showOutOfWeekCourses).toBe(true)

    useScheduleDisplayStore.getState().setShowAttendanceStatus(true)
    useScheduleDisplayStore.getState().setShowOutOfWeekCourses(false)
  })
})
