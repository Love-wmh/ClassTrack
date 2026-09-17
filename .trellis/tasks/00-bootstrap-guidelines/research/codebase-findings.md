# ClassTrack 代码库事实清单（用于填充 .trellis/spec/frontend/*）

> 由主 agent 于本轮任务中对仓库做只读扫描后得出。**全部结论均有真实文件/命令输出为证。**
> 填充 spec 时的铁律：**写代码实际长什么样，不写「应该」长什么样**。
> 已有 6 个 spec 文件当前是 `(To be filled by the team)` 空模板。

---

## 0. 项目概况与可用命令

| 项 | 值 |
|---|---|
| 包名 | `classtrack`（private，`type: module`） |
| 远端 / 分支 | `https://github.com/Love-wmh/ClassTrack.git` / `master`，126 commits |
| 源码根 | `app/`（133 个 `.ts`/`.tsx`，约 8838 行）+ `scripts/` |
| 构建 | `pnpm build`（= `react-router build`）✅ 实测通过 |
| 类型检查 | `pnpm typecheck`（= `react-router typegen && tsc`）✅ 实测通过 |
| Lint | `pnpm lint`（= `eslint . --report-unused-disable-directives --max-warnings 0`）❌ **实测失败** |
| 格式化 | `pnpm format` / `pnpm format:check`（prettier） |
| 开发 | `pnpm dev`；生产 `pnpm start` |
| Android | `pnpm cap:install:android` / `cap:build:android` / `cap:sync:android` / `cap:open:android` |
| **测试** | **不存在**。无 vitest/jest/playwright，无 `test` 脚本，无 `.github/workflows` CI |

- 路径别名：`~/*` → `./app/*`（`tsconfig.json` 的 `paths`，Vite 用 `resolve.tsconfigPaths: true`）。
- `react-router.config.ts` 中 `ssr: false` → **纯 SPA**，无 loader/action/服务端数据流。
- 无后端。数据全在 `localStorage`。

---

## 1. 目录结构事实（`directory-structure.md`）

```
app/
├── routes.ts                 # 路由表，唯一注册处
├── routes/_layout.tsx        # 仅 `export { default } from '~/features/layout/AppLayout'` 转发
├── routes/*.tsx              # 6 个路由入口，每个只有一行 re-export
├── root.tsx                  # Layout / App / ErrorBoundary 三导出
├── app.css                   # 全局样式（@theme / @custom-variant / 关键帧），322 行
├── components/
│   ├── ui/                   # shadcn/ui 生成物，允许就地改（见下）
│   ├── common/               # 跨 feature 复用业务组件（OptionCard、SemesterSelect、FileSelector…）
│   ├── dialog/               # 全局弹窗（ConfirmDialog、ImportDialog、MarkdownEditorDialog…）
│   ├── import-flow/          # 导入向导步骤组件 + useImportFlow
│   ├── markdown/             # MarkdownEditor（Milkdown 封装）
│   ├── stepper/              # 自研步骤条（Stepper + useStepper + 4 子组件 + index.ts）
│   └── pwa/                  # PwaUpdatePrompt
├── features/                 # 业务页面模块（**主要组织结构**）
│   └── <feature>/
│       ├── <Feature>Page.tsx        # 页面根组件，default export
│       ├── components/              # 该 feature 私有组件
│       ├── hooks/                   # 该 feature 私有 hook（useXxx.ts）
│       ├── constants.ts             # 字面量/调色板（仅 schedule 有）
│       ├── utils.ts                 # 该 feature 的纯函数
│       └── export.ts                # 导出逻辑（仅 substitute-management 有）
├── hooks/                    # 全局 hook（目前只有 use-mobile.ts）
├── lib/                      # 框架无关层：types.ts / utils.ts / exportFile.ts
│   ├── parsers/<school>/     # 学校 JSON → Class[] 解析器（index.ts 注册 + parser.ts + types.ts）
│   └── bookmarklets/<school>/ # 教务页面注入脚本（index.ts 适配器 + script.ts）
└── store/                    # Zustand store（index.ts / types.ts / migrations.ts / utils.ts / slices/ / mobileNavigationStore.ts）
```

**6 个 feature**：`schedule`、`dashboard`、`course-management`、`substitute-management`、`data-management`、`profile`、`layout`。

**真实存在的组织规律（必须写进 spec）**：
1. 每个 feature 一个目录，页面组件位于目录根且名字以 `Page.tsx` 结尾。
2. `app/routes/*.tsx` 只是 re-export 壳；**不要**在 `routes/` 里写逻辑。
3. 只有被 ≥2 个 feature 使用的组件才进 `app/components/`；单 feature 用的放 `features/<f>/components/`。
4. 解析器/书签脚本必须成对出现在 `lib/parsers/<school>/` 与 `lib/bookmarklets/<school>/`，且在各自的 `index.ts` 注册（`parsers`、`schools`、`bookmarkletAdapters` 三个数组）。
5. 顶层 `docs/` 存放中文设计方案与修复记录（14 篇），是历史决策依据。

**命名**：组件文件 `PascalCase.tsx`；hook `use-Xxx.ts`（文件用连字符，如 `use-mobile.ts`、`useWeekAttendance.ts`、`useDashboardStats.ts` —— **两种都存在**）；纯函数与常量 `camelCase.ts`；slice `xxxSlice.ts`；学校目录全小写连字符。

---

## 2. 组件约定事实（`component-guidelines.md`）

**标准结构**（以 `app/features/schedule/ScheduleTable.tsx` 为准）：

```ts
import { format } from 'date-fns'
import type { Class, ClassMark } from '~/lib/types'
import { cn } from '~/lib/utils'
import ScheduleCourseCell from './ScheduleCourseCell'

type ScheduleTableProps = {
  weekClasses: Class[]
  classMarks: Record<string, ClassMark>
  currentWeek: number
  firstWeekStartDate: string | null
  onCourseClick: (course: Class) => void
}

export default function ScheduleTable({ weekClasses, classMarks, currentWeek, firstWeekStartDate, onCourseClick }: ScheduleTableProps) {
  ...
}
```

可写入 spec 的硬事实：
- props 类型用 **`type XxxProps = {...}`** 紧邻组件上方，**不用 interface**，不导出。
- 组件：**页面组件 `export default function`**；**私有子组件 `export default function`**（同目录单独文件）；`app/components/ui/*` 与少量共享组件用 **named export**（`export function MarkdownEditor`）。同一 feature 内子组件用相对路径 `./Xxx` 导入，跨 feature 用 `~/`。
- 解构 props 直接写在参数位置，`no prop-types`（TS 提供类型）；**没有** `React.FC`、没有 children 透传模式（除 `Layout`）。
- 无状态派生用 `useMemo`（`ScheduleTable` 里 `occupiedCells = new Set(...)` 每次 render 重算，未 memo —— 存在但不强制）。
- 样式：**Tailwind 原子类内联，无 CSS Module / styled-components**；条件类名统一 `cn()`（`clsx` + `tailwind-merge`，见 `app/lib/utils.ts`）。
- 响应式：**移动优先**，`sm:` / `md:` 断点；JS 侧判断用 `useIsMobile()`（断点 768px，`app/hooks/use-mobile.ts`）；布局大量使用 `min-h-0 min-w-0 flex-1 overflow-hidden` 防止 flex 溢出。
- 图标统一 `lucide-react`，用法 `<item.icon className="h-5 w-5" />`。
- `app/components/ui/*` 是 shadcn CLI 生成的组件，**本项目允许并实际直接修改**（有多个提交：`fix(button.tsx): 优化了按钮组件的样式`、`fix: 汉化了日期选择器`、`feat: 侧边栏全面使用shadcn组件`）。改样式优先调 `className`/`cva` variants，不要替换整个文件。
- 交互反馈统一 `sonner` 的 `toast`（`import { toast } from 'sonner'`）。
- **无障碍**：**没有** aria-label / 键盘可达性的系统性实践；`ScheduleCourseCell`、`NavItem` 等以 div/button 混用。spec 应写「当前没有 a11y 规范，不强制新增」而不是编造标准。

---

## 3. Hook 约定事实（`hook-guidelines.md`）

- 位置：feature 私有 → `app/features/<f>/hooks/`；全局 → `app/hooks/`。
- 命名：`useXxx`，文件 `useXxx.ts`（**也大量存在连字符文件名**，如 `use-mobile.ts`）。两者都在用，spec 应同时承认。
- 结构：**一个 hook 文件 = 一个导出函数**，返回**具名对象的聚合值**，而非数组元组：
  - `useDashboardStats()` → `{ school, classes, range, overview, weeklyTrend, ..., hasClasses, formatPercent }`
  - `useCourseManagement()` → `{ courses, totalCourses, totalCourseInstances, hasCourses }`
  - `useSubstituteManagement()` → 20+ 个字段（含 setter 与 `handleXxx` 回调）
  - `useImportFlow()`、`useWeekAttendance()`、`useStepper()` 同风格
- 派生数据一律 `useMemo`（依赖数组列出 store 订阅到的字段）；事件处理用 `useCallback`（`useSubstituteManagement` 中 `importDates`/`handleImportTomorrow`/`handleImportSelectedDates`/`handleExport` 全部 `useCallback`）。
- **无数据获取层**：没有 React Query / SWR / fetch。所有「数据获取」= 读 Zustand store；`useImportFlow` 里文件读取走原生 `FileReader` + `Promise` 包装。
- 反例（现存，应作为「常见坑」记录）：
  - `app/hooks/use-mobile.ts:14` 与 `app/components/stepper/useStepper.ts:21` 在 effect 内**同步调用 setState**（`react-hooks/set-state-in-effect` 报错），说明这类写法会被 lint 拦住。
  - `app/components/stepper/Stepper.tsx:20` 在渲染期访问 ref（`react-hooks/refs` 报错）。

---

## 4. 状态管理事实（`state-management.md`）—— 本 spec 最重要

**技术**：Zustand 5 + `immer` middleware + `persist` middleware，`createJSONStorage(() => localStorage)`。

**两个独立 store**：
| store | localStorage key | 内容 |
|---|---|---|
| `useClassStore`（`app/store/index.ts`） | `class-track-storage` | 全部业务数据 |
| `useMobileNavigationStore`（`app/store/mobileNavigationStore.ts`） | `class-track-mobile-navigation` | 底部导航顺序 |

**slice 组合模式**（新 state 必须照此加）：
```ts
// app/store/types.ts
export type StoreSlice<T> = StateCreator<ClassStore, [['zustand/immer', never]], [], T>
// app/store/index.ts
immer((...args) => ({ ...createDataSlice(...args), ...createUiSlice(...args) }))
```
- `dataSlice`：持久化业务数据 + 所有 mutation。`uiSlice`：**不持久化**的 UI 状态（弹窗开关、导入向导选中项、Markdown 编辑器会话）。
- `partialize` 明确列出要持久化的字段 —— 新增持久字段必须同时改 `partialize`、`AppData`（`app/lib/types.ts`）和 `migrations.ts`。

**核心双结构（最容易踩坑）**：
`AppData` 同时持有：
- **扁平投影**：`classes` / `classMarks` / `currentWeek` / `firstWeekStartDate` / `courseMetadata`
- **多学期真相**：`semesters: Semester[]` + `currentSemesterId`

约束：
- 每个 mutation 在改扁平字段后**必须**调用私有 helper `syncCurrentSemester(state, patch)`（`dataSlice.ts` 末尾）把改动写回当前学期并刷新 `updatedAt`；反之 `setCurrentSemester` / `deleteSemester` / `importClasses` 会把学期内容投影回扁平字段。**漏掉任一侧就会数据不一致。**
- 跨学期新建条件：`importClasses` 在「已有学期有课程」且「推断出的学期代码不同」时自动开新学期。
- 学期 ID 由 `createSemesterId()` 哈希生成 + `ensureUniqueSemesterId()` 去重。

**版本迁移**：`CLASS_TRACK_SCHEMA_VERSION = 3`，persist 的 `version` + `migrate: migrateClassTrackState`。所有外部数据（localStorage 旧结构、导入的备份 JSON）都必须经 `normalizeImportedData()` / `migrateClassTrackState()` 归一化，内部用 `normalizeClasses` / `normalizeClassMarks` / `normalizeCourseMetadata` / `normalizeWeek` / `normalizeNullableString` 防御。
**升级 schema 的固定动作**：改 `AppData` → 提升 `CLASS_TRACK_SCHEMA_VERSION` → 在 `migrateClassTrackState` 增加分支 → 更新 `partialize` → 更新 `createEmptyAppData`。

**读取风格（两种并存，spec 需说明何时用哪种）**：
- **整体订阅**：`const { classes, classMarks, currentWeek } = useClassStore()`（用于页面 / 需要多字段的 hook，如 `useDashboardStats`、`useCourseManagement`）
- **选择器订阅**：`useClassStore((state) => state.classes)`（用于只依赖 1-2 个字段的 hook，如 `useSubstituteManagement`）
- **命令式读取**：`useClassStore.getState()` + `useClassStore.setState(...)`（仅在导出的 `useDataExportImport` 中，用于整体导入/导出快照）

**mark 键契约**：出勤标记键 = `getMarkKey(classId, week)` = `` `${classId}-${week}` ``。⚠️ **当前重复定义在 3 处**：`app/store/utils.ts`、`app/features/dashboard/utils.ts`，且 `app/features/schedule/ScheduleTable.tsx` 里还有手写 `` classMarks[`${classId}-${week}`] `` 与 `` `${course.dayOfWeek}-${section}` ``。spec 应记录「单一来源应为 `~/store/utils` 的 `getMarkKey`，但 dashboard 与 schedule 存在重复实现」这一现实。

---

## 5. 类型安全事实（`type-safety.md`）

- `tsconfig.json`：`strict: true`、`verbatimModuleSyntax: true`、`noEmit`、`moduleResolution: bundler`、`target/lib ES2022`、`jsx: react-jsx`。
- `verbatimModuleSyntax` 的直接后果：**类型导入必须写 `import type { X }`**（全仓库严格遵守，无例外）。
- **共享类型集中在 `app/lib/types.ts`**（102 行）：`Class`、`ClassMark`、`CourseField`、`CourseMetadata(Map)`、`School`、`Semester`、`ClassParser`、`BookmarkletAdapter`、`TermContext`、`AppData`。
- 局部类型就近定义在同文件：`StoreSlice`（`store/types.ts`）、`DataSlice`/`UiSlice`（各自 slice）、`CourseSession`/`DashboardRange`（`dashboard/utils.ts`）、`ExportFileInput`/`ExportFileResult`（`lib/exportFile.ts`）、各 `XxxProps`。
- **无 schema 校验库**（无 zod/yup/io-ts）。外部数据校验靠**手写 normalize 函数 + 返回 `null`**（`normalizeImportedData`）+ `Array.isArray` 检查，UI 侧用 `resolve({ success: false, error })` 回报。
- 判别式联合在 UI 状态里使用：`type ImportMethod = 'backup' | 'parser'`、`type CourseFieldContentType = 'text' | 'markdown'`、`export type NavItemId = (typeof NAV_ITEM_IDS)[number]`。
- 常量元组 + 派生类型是既有模式：`NAV_ITEM_IDS as const` → `NavItemId` → `normalizeNavigationOrder()` 做运行时收敛。
- **已存在的 `any`（3 处，warning 未清零）**：`app/lib/parsers/*/parser.ts` 的 `parse(data: any)`。解析边界故意用 `any` 接教务原始 JSON，随后映射成强类型 `Class`。spec 应写明「解析器入口允许 `any`，其余位置不允许」这一现实。
- 无 `@ts-ignore` / `@ts-expect-error` / `eslint-disable`（零使用）。

---

## 6. 质量事实（`quality-guidelines.md`）

**工具链**：ESLint 10 flat config（`eslint.config.js`）+ `typescript-eslint` recommended + `eslint-plugin-react` + `react-hooks` + `react-refresh` + `eslint-plugin-prettier/recommended`。
**Prettier**：`semi: false`、`singleQuote: true`、`printWidth: 140`、`tabWidth: 2`、`trailingComma: es5`。
**Husky**：`pre-commit` → `pnpm lint-staged`（`*.{ts,tsx}` = `eslint --fix` + `prettier --write`；`*.{js,jsx,json,css}` = `prettier --write`）；`commit-msg` → `pnpm commitlint --edit`。
**Commitlint**：conventional commits；`type-enum` = `build/chore/ci/docs/feat/fix/perf/refactor/revert/style/test`；subject/type 非空。**提交信息实际用中文描述**（见 `git log`，如 `fix: 恢复手机 Markdown 插图入口`）。

**Lint 当前真实状态（实测 `npx eslint . --format json`，共 1021 problems / 1015 errors / 6 warnings，仅 10 个文件）**：

| 文件 | 问题数 | 其中 prettier |
|---|---|---|
| `.pi/extensions/trellis/index.ts` | **1010** | 1003 |
| `commitlint.config.cjs` | 2 | 2 |
| `app/**` 共 7 文件 | 9 | 0 |

其余 9 个业务问题的确切位置：
- `app/components/stepper/Stepper.tsx:20` → `react-hooks/refs`（渲染期访问 ref）**error**
- `app/components/stepper/useStepper.ts:21` → `react-hooks/set-state-in-effect` **error**
- `app/hooks/use-mobile.ts:14` → `react-hooks/set-state-in-effect` **error**
- `app/components/ui/{badge,button,sidebar}.tsx` → `react-refresh/only-export-components` **warning**
- `app/lib/parsers/{tianjin-university-of-technology,tianjin-polytechnic-university}/parser.ts` → 3× `no-explicit-any` **warning**

**根因**：`eslint.config.js` 的 `ignores` 只列 `node_modules/dist/build/.vite/.idea/.vscode/.react-router/coverage/android/ios`，**没有忽略 Trellis init 生成的 `.pi/`、`.claude/`、`.codex/`、`.agents/`、`.codebuddy/`**，因此 `pnpm lint`（README 里作为门禁命令）开箱即失败。
**spec 里应当如何表述**：如实写「`pnpm typecheck` 与 `pnpm build` 是当前可信门禁；`pnpm lint` 因 agent 配置目录未被 eslint 忽略而必然失败，判断自己的改动是否干净时应按文件过滤（如 `npx eslint app/...`）」。不要写「lint 必须全绿」这种与事实不符的要求。

**测试**：**无测试框架、无测试文件、无 CI**。当前验证手段 = `pnpm typecheck` + `pnpm build` + `pnpm dev` 手测 + 真机 `pnpm cap:install:android`。spec 必须如实记录（不要编造「必须写单测」）。最容易因缺测试而回归的纯逻辑区域：`app/store/migrations.ts`、`app/lib/parsers/*`、`app/store/utils.ts`、`app/features/dashboard/utils.ts`。

**其它**：`console.log/warn/error` 出现在 9 个文件（含 `lib/bookmarklets/*/script.ts` 这类「注入到教务页面的脚本」——那里用 console 是刻意的）。无 `TODO`/`FIXME`。

---

## 7. 语言风格事实（每个 spec 都要体现）

- **注释用中文，复杂逻辑写 JSDoc 块**（含 `@param` / `@returns` 说明），对「为什么这样算」而不只是「做了什么」作解释 —— 见 `app/store/utils.ts`（57 行中文注释）、`app/lib/types.ts`（逐字段中文行内注释）、`app/features/dashboard/utils.ts`、`app/features/schedule/utils.ts`。
- 简单组件/JSX 不写注释。**注释密度不均衡是有意的**：算法/日期/迁移逻辑密集，展示组件接近零注释。
- **UI 文案全部中文**（`'课程表'`、`'数据看板'`、`'未记录教师'` 等兜底文案随处可见）；`<html lang="zh-CN">`。
- 类型字段注释用行尾 `//` 形式（`app/lib/types.ts`）。

---

## 8. 已知技术债 / 不一致（spec 里作为「当前状态」记录，不要当成规范去推广）

1. `getMarkKey` 三处重复（见 §4）。
2. `app/hooks/use-mobile.ts` 文件名连字符 vs `hooks/useWeekAttendance.ts` 驼峰 —— 两种并存。
3. `.pi/` 等 agent 目录未进 eslint ignores，导致 `pnpm lint` 失败（见 §6）。
4. 无测试、无 CI（见 §6）。
5. 3 处 `any`（解析器边界）未清零。
6. 3 个 `react-hooks` 规则 error 未修（effect 内 setState / 渲染期 ref）。

---

## 9. 交付物与边界

**要写的文件（6 个，全部当前为 `(To be filled by the team)` 占位）**：
1. `.trellis/spec/frontend/directory-structure.md`
2. `.trellis/spec/frontend/component-guidelines.md`
3. `.trellis/spec/frontend/hook-guidelines.md`
4. `.trellis/spec/frontend/state-management.md`
5. `.trellis/spec/frontend/type-safety.md`
6. `.trellis/spec/frontend/quality-guidelines.md`

**每个文件必须**：
- 保留原有标题层级（`# Title` + `> 一句话描述` + `---` 分节）。
- 用**中文**书写，与仓库语言一致。
- 每节填满真实内容；引用**真实文件路径**，至少给出 2 个可核验的真实代码片段（不要假想代码）。
- 代码示例必须与仓库风格一致：无分号、单引号、`import type`、`type XxxProps`、`cn()`、140 列。

**禁止**：
- 不要修改 `app/` 下任何源码；不要新增依赖；不要改 `eslint.config.js`。
- 不要写入「理想的」目标状态（例如「所有组件必须有测试」）。
- 不要动 `.trellis/spec/guides/`（已预填，PRD 明确只要求 frontend）。

**验证**：写完执行 `git diff --stat .trellis/spec/frontend/` 并自查每个文件不含 `To be filled by the team`；`grep -rn "To be filled" .trellis/spec/frontend/` 必须无输出。

---

## 附：扫描后的变更记录（2026-09-17，由主 agent 于提交前补记）

本文档上述结论中有两处已被后续改动影响，以此节为准：

- §0 与 §6 的「`pnpm lint` 因 agent 配置目录未被 eslint ignores 排除而必然失败 / 1021 problems」**已失效**：`eslint.config.js` 的 `ignores` 已新增 `.agents/**`、`.claude/**`、`.codebuddy/**`、`.codex/**`、`.pi/**`，实测 `pnpm lint` 降为 **11 problems（5 errors / 6 warnings）**，全部是 `app/` 与 `commitlint.config.cjs` 的既有问题。
- §8 第 3 条「agent 目录未进 eslint ignores」作为技术债**已消除**；§8 第 1、2、4、5、6 条仍然成立。

§6 关于「无测试、无 CI」的结论与 §7 的语言风格结论不受影响，仍然有效。
`.trellis/spec/frontend/quality-guidelines.md` 已按新状态同步更新。
