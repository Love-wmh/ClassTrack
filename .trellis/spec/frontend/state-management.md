# State Management

> 全局业务数据由 Zustand 持久化管理，页面和 hook 从 store 订阅并计算派生结果。

---

## Overview

项目使用 Zustand 5、`immer` middleware、`persist` middleware 和 `createJSONStorage(() => localStorage)`。有两个相互独立的 store：`app/store/index.ts` 导出的 `useClassStore` 持有全部业务数据，localStorage key 为 `class-track-storage`；`app/store/mobileNavigationStore.ts` 导出的 `useMobileNavigationStore` 只持有底部导航顺序，key 为 `class-track-mobile-navigation`。

slice 组合遵循现有类型和初始化方式：

```ts
// app/store/types.ts
export type StoreSlice<T> = StateCreator<ClassStore, [['zustand/immer', never]], [], T>
```

```ts
// app/store/index.ts
immer((...args) => ({
  ...createDataSlice(...args),
  ...createUiSlice(...args),
}))
```

`dataSlice` 放持久化业务数据和 mutation；`uiSlice` 放不持久化的弹窗开关、导入向导选择项和 Markdown 编辑会话。

---

## State Categories

`AppData` 同时保存两套结构：扁平投影 `classes`、`classMarks`、`currentWeek`、`firstWeekStartDate`、`courseMetadata`，以及多学期真相 `semesters: Semester[]` 与 `currentSemesterId`。UI 读取扁平字段；学期数组保存各学期完整内容。

这不是普通的两份可随意修改的缓存：mutation 修改扁平字段后必须调用 `dataSlice.ts` 末尾的私有 `syncCurrentSemester(state, patch)`，把变化同步回当前学期并刷新 `updatedAt`。反方向，`setCurrentSemester`、`deleteSemester`、`importClasses` 需要把选中学期投影回扁平字段。漏掉任一侧会造成数据不一致。

局部交互状态留在组件或 `uiSlice`；没有服务端 state 或 URL state 体系。`importClasses` 在当前已有课程且推断出的学期代码不同的时候自动创建新学期。

---

## When to Use Global State

需要跨页面持久化的课程、出勤、学期、学校和课程元数据进入 `useClassStore`；移动底部导航排序进入独立的 `useMobileNavigationStore`。仅一个组件的输入值、打开状态或临时选择不要扩展业务 store，除非现有导入/弹窗流程已由 `uiSlice` 负责。

新 slice 应复用 `StoreSlice<T>`，在 `app/store/slices/` 增加并由 `app/store/index.ts` 组合，而不是在页面中散落 `setState`。读取方式按依赖范围选择：

```ts
const { school, classes, classMarks, currentWeek } = useClassStore()
```

`app/features/dashboard/hooks/useDashboardStats.ts` 使用整体订阅，因为统计依赖多个字段；只依赖少量字段的 hook 可使用 `useClassStore((state) => state.classes)`。

---

## Server State

当前无 server state：没有后端、`fetch`、React Query 或 SWR，业务数据全部存 localStorage。整体备份导入导出例外使用 `useClassStore.getState()` 读取快照和 `useClassStore.setState(...)` 写入，真实实现位于 `app/features/data-management/hooks/useDataExportImport.ts`。

持久化配置在 `app/store/index.ts` 明确列出 `partialize` 字段。schema 当前为 `CLASS_TRACK_SCHEMA_VERSION = 3`，通过 persist 的 `version` 和 `migrate: migrateClassTrackState` 处理旧数据。外部数据要经过 `normalizeImportedData()` / `migrateClassTrackState()`，内部再使用 `normalizeClasses`、`normalizeClassMarks`、`normalizeCourseMetadata`、`normalizeWeek`、`normalizeNullableString` 等归一化函数。

升级 schema 的固定动作是：先改 `app/lib/types.ts` 的 `AppData`，提升版本号，在 `app/store/migrations.ts` 增加迁移分支，更新 `partialize`，最后更新 `createEmptyAppData`。不可只改类型而遗漏持久化和迁移。

---

## Common Mistakes

- 忘记 `syncCurrentSemester` 会让扁平投影和 `semesters` 真相分叉；新增 mutation 要逐一检查同步 patch。
- 切换、删除或导入学期时只改 `semesters` 不投影到扁平字段，同样会产生错误 UI。
- 出勤标记键契约是 `getMarkKey(classId, week)`，值为 `` `${classId}-${week}` ``，唯一来源是 `app/store/utils.ts`。`app/features/dashboard/utils.ts` 与 `app/features/schedule/ScheduleTable.tsx` 均从此处导入（2026-09 已把原先三处重复实现收敛为一处）；新增读取出勤标记的代码必须复用该函数，不要手写字符串拼接。
- 注意 `` `${course.dayOfWeek}-${section}` `` 是课表网格坐标，与出勤标记键无关，不要与 `getMarkKey` 混用。
- 新增持久字段却不改 `partialize`、迁移和空数据，会导致刷新或旧版本导入丢数据。
- 不要把移动导航状态混入业务 store；它已有独立 key 和 `app/store/mobileNavigationStore.ts`。
