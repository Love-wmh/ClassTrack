# Type Safety

> TypeScript 使用严格模式，跨边界数据依靠显式类型和手写归一化保护。

---

## Overview

`tsconfig.json` 开启 `strict: true`、`noEmit`、`verbatimModuleSyntax: true`、`moduleResolution: bundler`，目标和 lib 为 ES2022，JSX 使用 `react-jsx`。因此类型导入必须写成 `import type`，项目没有 `@ts-ignore`、`@ts-expect-error` 或 `eslint-disable`。

```ts
import type { Class, ClassMark } from '~/lib/types'

export function getMarkKey(classId: string, week: number) {
  return `${classId}-${week}`
}
```

上例对应 `app/store/utils.ts` 的类型导入和 mark key 工具使用；共享类型、纯函数和 UI props 都应保持可推断且明确的边界。

---

## Type Organization

跨 feature 的领域类型集中在 `app/lib/types.ts`，包括 `Class`、`ClassMark`、`CourseField`、`CourseMetadataMap`、`School`、`Semester`、`ClassParser`、`BookmarkletAdapter`、`TermContext` 和 `AppData`。局部类型就近定义：`StoreSlice` 在 `app/store/types.ts`，`DataSlice`/`UiSlice` 在对应 slice，`CourseSession`/`DashboardRange` 在 `app/features/dashboard/utils.ts`，导出输入输出在 `app/lib/exportFile.ts`，各组件自己的 props 紧邻组件。

feature 业务组件 props 的既有形式通常是紧邻组件的非导出 `type`；但 shadcn/ui 和少量共享组件存在 `interface` 例外（如 `app/components/ui/badge.tsx`、`app/components/ui/date-picker.tsx`、`app/components/common/BookmarkletButton.tsx`）：

```ts
type ScheduleTableProps = {
  weekClasses: Class[]
  classMarks: Record<string, ClassMark>
  currentWeek: number
  firstWeekStartDate: string | null
  onCourseClick: (course: Class) => void
}
```

此类型来自 `app/features/schedule/ScheduleTable.tsx`。常量元组和派生联合类型也是既有模式，例如 `app/features/layout/navigation.ts` 中的 `NAV_ITEM_IDS as const` 派生 `NavItemId`。

---

## Validation

项目没有 zod、yup 或 io-ts。localStorage 和备份 JSON 等外部输入通过 `app/store/migrations.ts` 的 `normalizeImportedData()` 及 `normalizeClasses`、`normalizeClassMarks`、`normalizeCourseMetadata`、`normalizeWeek`、`normalizeNullableString` 手写检查和归一化；不符合条件时返回 `null` 或安全默认值。UI 导入流程使用 `resolve({ success: false, error })` 报告失败，不能把 `unknown` 直接当成 `AppData` 使用。

解析器入口是现实中的特殊边界：`app/lib/parsers/tianjin-university-of-technology/parser.ts` 与 `app/lib/parsers/tianjin-polytechnic-university/parser.ts` 当前使用 `parse(data: any)` 接教务原始 JSON，随后映射为强类型 `Class[]`。仓库目前有 3 处该 warning；除这些解析器入口外，不要扩散 `any`。

---

## Common Patterns

使用判别式联合表达有限状态，例如 `ImportMethod = 'backup' | 'parser'`、`CourseFieldContentType = 'text' | 'markdown'`。集合键明确写 `Record<string, T>`；可缺失或可为空的值显式写 `?` 或 `| null`，如 `firstWeekStartDate: string | null`。

复杂日期、迁移和统计逻辑使用中文 JSDoc，说明为什么这样计算，并包含 `@param` / `@returns`；字段注释采用 `app/lib/types.ts` 中的行尾 `//` 中文注释。简单 JSX 不添加无意义注释。

---

## Forbidden Patterns

- 不要在普通业务代码使用 `any`、类型逃逸或无依据的类型断言；解析器原始 JSON 入口是已存在的 `any` 例外。组件 props 应遵循所属目录的既有类型形式：feature 组件通常用非导出 `type XxxProps`，而不要把 UI/共享组件中现存的 `interface` 当成需要重构的技术债。
- 不要违反 `verbatimModuleSyntax`，类型必须用 `import type { X }`。
- 不要引入未经项目采用的 schema 验证库；遵循现有 normalize 约定，尤其是 localStorage、导入备份和解析器边界。
- 不要用 `@ts-ignore`、`@ts-expect-error` 或 `eslint-disable` 掩盖错误。
- 不要把共享领域类型复制到 feature；局部计算类型才放在使用它的文件附近。
