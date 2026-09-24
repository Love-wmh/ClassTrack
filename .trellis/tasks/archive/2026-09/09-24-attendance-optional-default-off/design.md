# 技术设计：出勤能力默认关闭并做成可选项

> 目标：一个**设备级开关**管住「出勤标记入口 + 出勤统计呈现」两件事，默认关闭；
> 关闭 = 不显示，**绝不**改数据；开启后逐项回到改动前。
>
> 底线：**不删除、不过滤、不重写任何已有出勤数据**。D 支线只给 `ClassMark` **补一个字段**（schema v3 → v4），
> 不改变既有标记的语义（旧数据一律按「已做出勤判断」补齐），旧备份照常导入。

## D1 开关存在哪：独立 store + 纯逻辑模块（照 `updateStore` 的先例）

**决策**：新建两个文件，与更新检测的设置完全同构。

```
app/lib/attendance/settings.ts     # 纯逻辑：默认值 + 坏值收窄（可被 vitest 直接钉住）
app/lib/attendance/settings.test.ts
app/store/attendanceStore.ts       # zustand + persist，key = class-track-attendance
```

```ts
// app/lib/attendance/settings.ts
export type AttendanceSettings = { enabled: boolean }

/** 「出勤统计」默认**关闭**（用户 2026-09-24 口径）：首装与升级后的老设备一律关闭。 */
export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = { enabled: false }

/** localStorage 是外部输入：非布尔一律回落 fallback，而不是让坏值进逻辑分支。 */
export function normalizeAttendanceSettings(stored: unknown, fallback = DEFAULT_ATTENDANCE_SETTINGS): AttendanceSettings {
  const source = (stored ?? {}) as Record<string, unknown>
  return { enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled }
}
```

```ts
// app/store/attendanceStore.ts
export const ATTENDANCE_STORAGE_KEY = 'class-track-attendance'

export const useAttendanceStore = create<AttendanceStore>()(
  persist(
    (set) => ({ ...DEFAULT_ATTENDANCE_SETTINGS, setAttendanceEnabled: (enabled) => set({ enabled }) }),
    {
      name: ATTENDANCE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ enabled: state.enabled }),
      merge: (persistedState, currentState) => ({ ...currentState, ...normalizeAttendanceSettings(persistedState, currentState) }),
    }
  )
)
```

**为什么不放进 `useClassStore`**（与 `updateStore` 头注释同一条理由，必须写进代码注释）：

1. 它是**设备相关偏好**（换设备/导入备份时不该跟着走），进 `partialize` 就会被卷进备份 JSON 与迁移逻辑；
2. 放进去要动 `AppData` 类型 + schema 版本 + `migrations.ts` + `createEmptyAppData` 五处，纯属自找回归风险；
3. 读取方（课表页、看板页、个人中心、数据管理）都是「读一个布尔」，独立 store 的订阅成本更低。

**读取方式**：`useAttendanceStore((state) => state.enabled)`（单字段订阅，符合 `state-management.md` 的分层要求）。

## D2 关闭时课表侧改什么（逐文件）

所有组件都改成**受控 prop**（`attendanceEnabled: boolean`），页面负责从 store 读一次往下传。
理由：组件可被 `renderToStaticMarkup` 直接断言两态，测试不需要 store / localStorage。

| 文件 | 改动 | 关闭态表现 |
|---|---|---|
| `SchedulePage.tsx` | 读 store，向 Header / Table / Dialog 传 `attendanceEnabled` | — |
| `ScheduleCourseCell.tsx` | 新增 `attendanceEnabled`；关闭时不加状态类、不画色条 `span`、不画角标图标；`title` 退化为 `${name}，点击查看详情` | 纯课程格：底色（`getCourseColor`）+ 课名 + 教室 + 备注 |
| `ScheduleHeader.tsx` | 新增 `attendanceEnabled`；`{attendanceEnabled && (<>两个按钮 + ConfirmDialog</>)}`；左侧动作组列数用 `cn` 切换 | 手机端 `grid-cols-[2.25rem_2.25rem_2.25rem]`（上一周 / 下一周 / 添加到桌面），桌面端 `sm:flex` 自然收窄 |
| `ScheduleTable.tsx` | 透传 `attendanceEnabled` 给课程格 | — |
| `ScheduleCourseDialog.tsx` | 新增 `attendanceEnabled`；关闭时不渲染出勤切换 `Button` | 弹窗只剩 课程信息 + 备注 + 取消/保存 |
| `hooks/useWeekAttendance.ts` | 不改（关闭时无人调用；`markWeekAsAttended/Unattended` 也保留在 store 里） | — |

**色条/外圈必须一起收**：现在是「未标记也画红圈」，只收图标会留下一个说不清含义的红框。

## D3 备注与出勤解耦（关闭时备注照旧）

`note` 存在同一个 `ClassMark` 里，但功能上独立：

- 课程格备注走 `mark?.note`（不受开关影响，继续显示）；
- 弹窗备注 textarea 与 `setNote` 继续工作；
- 顶栏两个批量按钮只改 `isAttended`，与备注无关 → 关闭时整组隐藏即可；
- 代课管理只读 `note`（`utils.ts:44`）→ 零改动。

`SchedulePage` 仍然要读 `classMarks` 并算 `selectedMark`（备注需要它），**不要**为了「干净」把 `classMarks` 在关闭时置空——那会连带把备注一起藏掉。

## D4 导入时的自动补标：保留不动

`importClasses` 里的 `createPastClassMarks` 继续执行（`dataSlice.ts:172`）。

- 它表达的是「导入时刻之前已经结束的课次」，与用户是否开启出勤无关；用户打开开关时应当立刻看到
  「过去几周按已上记录」的完整数据，而不是一片空白。
- 若改成「关闭时不补标」，同一次导入会在开关前后产生**不同数据**，且开启后无法补救（当时又没补）——
  这是不可预测性，不是省事。
- 关闭状态下这些标记只是不显示；开启后可见。**记录为决策，不写代码分支。**

## D5 关闭时看板怎么组合（组件受控 + 页面负责编排）

`DashboardPage` 读一次开关，按状态渲染两套组合；所有被收起的组件保持原样，只加 `attendanceEnabled` prop 或干脆不渲染。

**开启态** = 与改动前逐项一致（回归要求）：

```
副标题：展示课程完成度、缺勤率、课程分布和风险课程分析。
[无日期基线提示卡]
DashboardOverview（8 张卡）
├ 周趋势            ├ 风险课程
├ 课程完成度排行     ├ 星期分布
├ 课程类别分析      ├ 课程性质分析
├ 节次分布
```

**关闭态**：

```
副标题：展示课程分布与课表结构分析。
[AttendanceOffHint 提示卡]        ← 新增，带「去开启」
DashboardOverview                 ← 只 3 张：课程实例 / 总课次数量 / 备注数量
├ 星期分布（只画「总课次」）        ← 单列，占满
├ 课程类别分析      ├ 课程性质分析
├ 节次分布（只画「总课次」）
```

组件级改动：

| 文件 | 改动 |
|---|---|
| `DashboardOverview.tsx` | 新增 `attendanceEnabled`；关闭时只渲染 `课程实例` / `总课次数量` / `备注数量` 三张卡，网格 `xl:grid-cols-3`（开启态保持 `xl:grid-cols-4`） |
| `WeekdayDistributionChart.tsx` | 新增 `attendanceEnabled`；关闭时不渲染 `已上` / `缺勤` 两个 `Bar`，`description` 改为「观察一周内的课程分布。」 |
| `SectionDistributionChart.tsx` | 同上（`总课次` 之外的两个 `Bar` 收起，`description` 改为「按上课节次统计课程密度。」） |
| `WeeklyTrendChart.tsx` / `RiskCourseList.tsx` / `CourseRanking.tsx` | **不改代码**，由 `DashboardPage` 决定不渲染 |
| `DashboardEmptyState.tsx` | 新增 `attendanceEnabled`；关闭时空态文案不提「完成度、缺勤率」 |
| `components/AttendanceOffHint.tsx` | **新增**：提示卡 + `useNavigate()` 跳 `/profile`（跳转照 `ProfileGuideDialog` 的写法） |

**不引入 `useDashboardStats` 的开关分支**：统计计算是纯函数且只依赖 store，关掉渲染后多算的部分没有副作用；
给 hook 加参数会把「显示开关」混进「统计口径」，反而更难验证「开启态逐项不变」。

## D6 提示卡文案（诚实性）

```
标题：出勤统计已关闭
说明：完成度、缺勤率、周趋势和风险课程都依赖出勤标记。现在只显示课程分布类统计；
      已记录的出勤数据仍保留在本地与备份中。
按钮：去开启
```

设置卡（个人中心）文案：

```
标题：出勤统计        角标：已开启 / 已关闭
说明：开启后可以在课程表标记每节课是否上（含「全部已上 / 全部未上」批量标记），
      并在数据看板看到完成度、缺勤率、周趋势与风险课程。
关闭时补一句：关闭只是不显示，已记录的出勤数据不会被删除。
```

两处都必须出现「数据没删」这一句 —— 用户看不到标记时的第一反应是「我的记录丢了」。

## D7 计数行

`ProfilePage.tsx` 与 `DataManagementPage.tsx` 各自读一次 `enabled`，`已标记课程` 那一行改为条件渲染；其余行不动。

## D8 schema 升级清单（v3 → v4，只补一个字段）

D 支线给 `ClassMark` 补 `attendanceMarked: boolean`，业务 schema 版本随之 3 → 4。
**升级清单固定为四处 + 一个归一化函数**；少改一处类型检查就会失败（这是好事：漏改不会静默）。

| 位置 | 改动 |
|---|---|
| `app/lib/types.ts` | `ClassMark` 加 `attendanceMarked: boolean`（行尾中文注释）；`AppData.schemaVersion: 4` |
| `app/store/migrations.ts` | `CLASS_TRACK_SCHEMA_VERSION = 4`；`normalizeClassMarks` 从直通转换改成真归一化（见 D9） |
| `app/store/slices/dataSlice.ts` | 两处 `schemaVersion: 3` → `4`（`createEmptyAppData` 之外的那两处初始状态） |
| `app/store/index.ts` | **不改**：`classMarks` 已在 `partialize` 列表里，新字段在值内部 |
| `createEmptyAppData` | **不改**：它写的是常量 `CLASS_TRACK_SCHEMA_VERSION`（已提到 4）与空的 `classMarks: {}` |

备份契约保持兼容：`useDataExportImport` 不改（`classMarks` 原样进出）；旧备份导入会经
`normalizeImportedData → migrateClassTrackState → normalizeClassMarks` 补齐字段。

## D9 数据模型与迁移：字段语义 + 旧数据补齐

```ts
export interface ClassMark {
  classId: string
  week: number
  isAttended: boolean // 是否上课
  note: string // 备注
  attendanceMarked: boolean // 这一条是否做过真实的出勤判断（只写备注时为 false）
}
```

写入侧是 **4 处「已判断」+ 1 处「未判断」**，全部集中在 `dataSlice.ts` 与 `store/utils.ts`：

| 调用点 | `attendanceMarked` |
|---|---|
| `toggleAttendance`（新建与切换都算） | `true` |
| `markWeekAsAttended` | `true` |
| `markWeekAsUnattended` | `true` |
| `createPastClassMarks`（导入时补标） | `true` |
| `setNote` 新建标记时 | `false`（只写了备注，没做出勤判断） |

`setNote` 命中已有标记时**只改 `note`**，不动 `attendanceMarked`（沿用既有行为；空备注也照旧建「未判断」标记，不做额外特判）。

**旧数据补齐**（`normalizeClassMarks` 变成真归一化，同时覆盖 persist 迁移与备份导入两条通道）：

```ts
attendanceMarked: raw.attendanceMarked !== false   // 缺字段 / 非法值 → true（=已判断，保持既有统计口径）
```

- 老账无法反推：「只写了备注」与「标了未上又写备注」在旧数据里完全同形，一律按**已判断**处理 → **现有统计零变化**。
- 非对象条目（`null` / 字符串）在归一化时丢弃：原有直通转换会让 UI 读到 `undefined`，丢弃不损失有效信息。

## D10 统计口径：三个谓词成为唯一来源（看板侧）

```ts
// app/features/dashboard/utils.ts（与 expandCourseSessions 同文件，被 useDashboardStats 与 groupByName 共用）
export function isAttendedSession(session: CourseSession)  // mark?.isAttended === true
export function isAbsentSession(session: CourseSession)    // 已判断 && !isAttended
export function isUnmarkedSession(session: CourseSession)  // !已判断（含「只写了备注」）
```

`isAttendanceMarked(mark)` 放在 `app/store/utils.ts`（与 `getMarkKey` 同处，沿用「标记相关契约只有一个来源」的既有约定）：

```ts
export function isAttendanceMarked(mark: ClassMark | undefined): boolean {
  if (!mark) return false
  // 运行时仍可能是 undefined（外部 JSON 手改过 / 迁移前就进过内存）：按「已判断」处理
  return mark.attendanceMarked !== false
}
```

- `useDashboardStats` 里的 6 处过滤表达式与 `groupByName` 的 3 处全部换成这三个谓词：**不允许**再出现第二份 `mark && !mark.isAttended`。
- 口径修正的可见后果（开启出勤时）：只写备注的课次由**缺勤**变成**未标记** → 缺勤率下降、标记覆盖率下降、风险课程可能下榜。这是本次唯一的行为变更，必须写进 `verification.md`。
- 文案同步：「未标记课次」卡的描述由「已发生但还没有记录状态」改为「已发生但还没有标记是否上课」。

**课表侧的显示语义本次不动**：无标记与「只写了备注」都按既有的「未上」形态呈现（红圈 + 红色角标），
不引入第三态。理由：第三态会让**每一节未标记的课**（今天的默认状态）外观全变，属于用户没要的视觉改动；
本次只把「统计说的是什么」修正准确。

## D11 验证策略

| 层 | 手段 | 覆盖 |
|---|---|---|
| 纯逻辑（开关） | `app/lib/attendance/settings.test.ts` | A2 / A4：默认关、坏值回落、合法值保持 |
| 纯逻辑（口径） | `app/features/dashboard/utils.test.ts` 补 3 个谓词的用例；`app/store/utils.test.ts` 补 `isAttendanceMarked` 与 `createPastClassMarks` 的字段 | E1 / E2 / E3 / E5 |
| 迁移 | `app/store/migrations.test.ts` 补：旧标记补 `attendanceMarked: true`、显式 `false` 保留、非对象条目丢弃、空数据仍等于 `createEmptyAppData()` | E4 |
| 组件两态 | `renderToStaticMarkup`（既有先例：`UpdateAvailableDialog.test.ts`） | B1 / B2 / B3 / C1 / C3 / C4 |
| 门禁 | `pnpm typecheck` / `lint` / `format:check` / `test` / `build` | D3 |
| 视觉 | `pnpm dev` + 浏览器（375px 宽）截图：课表开/关、看板开/关、弹窗、个人中心卡 | B2 / C2 / D4 |
| 数据 | 关闭态导出备份 → 检查 `classMarks`；开启后标记回来；旧备份导入后字段补齐 | D1 / E4 |

组件测试的**具体形式**（照既有先例写，避免造新机制）：

```tsx
// app/features/schedule/ScheduleCourseCell.test.ts（示意）
const html = renderToStaticMarkup(createElement(ScheduleCourseCell, { course, mark, attendanceEnabled: false, ... }))
expect(html).not.toContain('ring-rose')
expect(html).toContain(noteText)   // 备注仍在
```

## D12 兼容性与边界

- **旧数据**：`classMarks` 含大量旧标记的设备，升级后界面看不到它们（口径：一律关闭）——这是**已确认**
  的产品口径，不是缺陷；设置卡文案要能自解释。
- **多标签页/多窗口**：zustand persist 不做跨标签同步（全项目现状，`updateStore` 同样如此），本次不引入新机制。
- **SSR/首屏**：store 初始化即读 localStorage，默认 `false`；不存在「先闪一下开启态」的问题（默认就是关）。
- **无课程**：看板空态与课表空态不依赖开关，只有看板空态文案做条件化。
- **Android WebView / PWA**：纯 Web 层改动，无需 `cap sync` 之外的原生改动。

## 回滚形状

- 代码回滚：本任务全部是「多一层的条件渲染 + 一个字段的补齐」，按阶段 `git revert` 即可。
- 数据回滚：**不需要**。A/B/C 支线没有任何写业务数据的代码路径（开关只影响渲染）；
  D 支线给已有标记补的 `attendanceMarked: true` 对旧代码是无害的多余字段（旧代码只读 `isAttended` / `note`），
  回滚后应用照常运行，只是那个字段留在 localStorage 里不再被读。
- 阶段边界即回滚边界：`switch`（A）→ `settings-card`（B 的入口）→ `attendance-semantics`（D 的数据层）→
  `schedule-gate`（B）→ `dashboard-gate`（C）。D 的 `revert` 会把统计口径退回「只写备注 = 缺勤」，
  与 A/B/C 三支无关。
## 决策清单（供 review 用）

| # | 决策 | 理由 |
|---|---|---|
| D1 | 独立 store（key `class-track-attendance`），不进 `useClassStore` | 设备偏好、不进备份、不动 schema（照 `updateStore` 先例） |
| D2 | 组件全部受控 prop，页面读 store | 两态可被 SSR 单测钉住，改动面最小 |
| D3 | 备注与出勤解耦，关闭时备注照旧 | 备注是独立功能（代课管理依赖 `note`），共用存储 ≠ 同一功能 |
| D4 | 导入自动补标保留 | 与开关无关的数据事实；改了会让开关前后数据不一致 |
| D5 | 看板不加统计层开关，只在渲染层编排 | 保证「开启态逐项不变」这条回归要求最好验证 |
| D6 | 两处文案都写明「数据没删」 | 用户看不到标记的第一反应是「记录丢了」 |
| D7 | 计数行随开关隐藏 | 它本身就是出勤统计 |
| D8 | schema v3 → v4，只补 `ClassMark.attendanceMarked` 一个字段 | 显式记下「这一条是否做出勤判断」是修掉「写备注 = 缺勤」的唯一办法（启发式会误伤真请假） |
| D9 | 旧标记一律补成「已判断」 | 老账同形无法反推；这样现有统计零变化，不制造历史数据变动 |
| D10 | 三个谓词收敛到 `dashboard/utils.ts` + `store/utils.ts` | 六处过滤表达式各写一遍迟早会分叉（`getMarkKey` 收敛的教训） |
| D10b | 课表不引入「未标记」第三态 | 会让每一节未标记的课外观全变，属于用户没要的视觉改动 |
| D11 | 沿用 `renderToStaticMarkup` + 纯模块单测 + 迁移单测 | 项目既有测试机制，不新增依赖 |
