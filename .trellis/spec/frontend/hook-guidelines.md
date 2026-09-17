# Hook Guidelines

> Hook 按 feature 归属组织，负责组合 Zustand 状态、派生数据和事件处理。

---

## Overview

feature 私有 hook 放在 `app/features/<feature>/hooks/`，全局 hook 放在 `app/hooks/`；共享组件自己的 hook 可与组件同目录，例如 `app/components/stepper/useStepper.ts`。一个 hook 文件通常只导出一个 hook 函数，并返回具名对象而不是数组元组。

```ts
export function useDashboardStats() {
  const { school, classes, classMarks, currentWeek, firstWeekStartDate } = useClassStore()

  return useMemo(() => {
    const maxWeek = classes.reduce((max, classItem) => Math.max(max, ...classItem.weeks), 1)
    const range = getDashboardRange(firstWeekStartDate, currentWeek, maxWeek)
    const sessions = expandCourseSessions(classes, classMarks, range)
```

以上是 `app/features/dashboard/hooks/useDashboardStats.ts` 的真实开头，展示整体订阅和 memo 派生。

完整统计聚合见 `app/features/dashboard/hooks/useDashboardStats.ts`；它还返回 `range`、`overview`、趋势和分组结果等具名字段。

---

## Custom Hook Patterns

Hook 主要做三类工作：订阅 store、用 `useMemo` 计算派生数据、用 `useCallback` 稳定事件处理。复杂日期/统计逻辑可以放在同 feature 的 `utils.ts`，hook 只负责组合。`useSubstituteManagement` 返回包含 setter 和 `handleXxx` 回调的聚合对象；`useCourseManagement` 返回课程集合及计数。

```ts
export function useCourseManagement() {
  const classes = useClassStore((state) => state.classes)
  const courseMetadata = useClassStore((state) => state.courseMetadata)
  const currentSemesterId = useClassStore((state) => state.currentSemesterId)

  return useMemo(() => {
    const courses = Array.from(groupClassesByCourse(classes).values())
      .map((courseClasses) => toCourseInfo(courseClasses, courseMetadata, currentSemesterId))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))
```

以上是 `app/features/course-management/hooks/useCourseManagement.ts` 的真实片段，展示选择器订阅与 memo 派生。`app/features/substitute-management/hooks/useSubstituteManagement.ts` 另有 `useCallback` 包装导入和导出回调。

以上分别对应 `app/features/course-management/hooks/useCourseManagement.ts` 与 `app/features/substitute-management/hooks/useSubstituteManagement.ts` 中的既有风格。hook 不把数据访问偷偷扩展成独立 service 层，除非已有模块模式明确需要。

订阅浏览器外部系统（`matchMedia`、`resize`、`storage` 等）时使用 `useSyncExternalStore`，不要用 `useState` + `useEffect` 手动同步——后者会在 effect 内同步 setState，被 `react-hooks/set-state-in-effect` 拦下：

```ts
import { useSyncExternalStore } from 'react'

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onStoreChange: () => void) {
  const mediaQueryList = window.matchMedia(MOBILE_QUERY)
  mediaQueryList.addEventListener('change', onStoreChange)
  return () => mediaQueryList.removeEventListener('change', onStoreChange)
}

function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches
}

function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
```

这是 `app/hooks/use-mobile.ts` 的实际写法。它与旧的 `useState` + `useEffect` 版本有一处行为差异：首帧即返回真实值，旧版本首帧返回 `false`，会让移动端短暂渲染桌面布局。这是修复，不要改回去。

---

## Data Fetching

项目是 `ssr: false` 的纯 SPA，没有 React Query、SWR、`fetch` 或服务端数据流。所谓数据获取就是从 Zustand store 读取；导入向导中的文件读取是原生 `FileReader` 包装成 Promise，见 `app/components/import-flow/useImportFlow.ts`。

需要多字段时使用整体订阅，例如 `useDashboardStats`；只依赖一两个字段时可使用选择器订阅，例如 substitute 管理相关 hook 的 `useClassStore((state) => state.classes)`。只有 `useDataExportImport` 这类整体快照导入导出逻辑使用 `useClassStore.getState()` / `setState()` 命令式访问。

---

## Naming Conventions

函数使用 `useXxx`，文件实际同时采用 `useXxx.ts` 和连字符形式，不能假定仓库已经统一：`app/features/dashboard/hooks/useDashboardStats.ts`、`app/features/schedule/hooks/useWeekAttendance.ts` 与 `app/hooks/use-mobile.ts` 都是真实例子。新 hook 放在最窄的归属目录，不因短暂复用就立即提升为全局 hook。

---

## Common Mistakes

- 不要返回没有字段名的数组元组；当前 hook API 以具名对象聚合值为主。
- 派生值要核对 `useMemo` 依赖，回调要核对 `useCallback` 依赖，避免捕获旧 store 数据。
- effect 内同步 setState、渲染期调整 state、渲染期访问 ref 会被 `react-hooks` 规则拦下（`set-state-in-effect`、`set-state-in-render`、`refs`）。三者在本仓库都是 error 级别，因此连 React 文档推荐的「渲染期调整 state」写法也不可用。
- 正确替代：订阅外部系统用 `useSyncExternalStore`（`app/hooks/use-mobile.ts`）；共享的状态转移放在事件处理器内的纯 updater 里（`app/components/stepper/useStepper.ts` 把 `current` 与 `previous` 合并成单个 state 对象，在同一 updater 内原子更新）；展示组件只接收 props，不自己记住「上一步」这类派生状态（`app/components/stepper/Stepper.tsx`）。
- 不要虚构 server-state cache；本项目没有后端，文件导入边界必须显式处理异常和失败结果。
