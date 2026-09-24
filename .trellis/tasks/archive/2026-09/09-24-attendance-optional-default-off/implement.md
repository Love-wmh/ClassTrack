# 执行计划：出勤能力默认关闭并做成可选项

> 顺序：P0 开关本体 → P1 设置卡与计数行 → P2 数据模型与统计口径 → P3 课表隐藏 → P4 看板隐藏 → P5 文档 → P6 验证。
> 每个阶段结束都跑一次门禁，并单独提交（阶段边界 = 回滚边界）。
>
> 阶段与支线的对应：P0/P1 = A（开关本体）；P2 = D（备注与出勤解耦）；P3 = B（课表侧）；P4 = C（看板侧）。
> **P2 必须先于 P4**：看板口径要读 `attendanceMarked`，字段没落地前改口径只会写出一堆临时判断。

## 交付物清单

**新增（6）**

- `app/lib/attendance/settings.ts` — 默认值与坏值收窄（纯逻辑）
- `app/lib/attendance/settings.test.ts`
- `app/store/attendanceStore.ts` — zustand persist，key `class-track-attendance`
- `app/features/profile/AttendanceSettings.tsx` — 个人中心「出勤统计」卡（Switch）
- `app/features/dashboard/components/AttendanceOffHint.tsx` — 看板关闭态提示卡 + 「去开启」
- 组件两态测试：`app/features/schedule/ScheduleCourseCell.test.ts`、`app/features/schedule/ScheduleHeader.test.ts`、
  `app/features/dashboard/components/DashboardOverview.test.ts`（文件名按实现落点微调，但必须真的存在且进 vitest 的 `app/**/*.test.ts` 范围）

**修改**

- 数据层（D）：`app/lib/types.ts`、`app/store/migrations.ts`、`app/store/slices/dataSlice.ts`、`app/store/utils.ts`
  + `app/store/migrations.test.ts`、`app/store/utils.test.ts`
- 看板口径与呈现（C + D）：`app/features/dashboard/hooks/useDashboardStats.ts`、`app/features/dashboard/utils.ts`
  + `utils.test.ts`、`DashboardPage.tsx`、`components/DashboardOverview.tsx`、`components/WeekdayDistributionChart.tsx`、
  `components/SectionDistributionChart.tsx`、`components/DashboardEmptyState.tsx`
- 课表（B）：`SchedulePage.tsx`、`ScheduleHeader.tsx`、`ScheduleTable.tsx`、`ScheduleCourseCell.tsx`、`ScheduleCourseDialog.tsx`
- 计数行：`app/features/profile/ProfilePage.tsx`、`app/features/data-management/DataManagementPage.tsx`
- 文档：`README.md`、`.trellis/spec/frontend/mobile-schedule-layout.md`、`.trellis/spec/frontend/state-management.md`

**明确不改（提交信息里要写清「为什么没改」）**

- `app/store/index.ts`（`classMarks` 已在 `partialize` 里；`createEmptyAppData` 用的是常量）
- `app/features/substitute-management/**`（只读 `note`）
- `app/store/slices/dataSlice.ts` 里 `setNote` 的「空备注也建标记」行为（本次不做特判，见 design D9）
- `android/**`、`app/lib/widget-snapshot.ts`（桌面小工具不含出勤信息）

---

## P0 开关本体（A1–A4）

- [ ] `app/lib/attendance/settings.ts`：`AttendanceSettings` / `DEFAULT_ATTENDANCE_SETTINGS`（`enabled: false`）/
      `normalizeAttendanceSettings(stored, fallback)`；中文 JSDoc 写明「默认关闭是 2026-09-24 用户口径」与「localStorage 是外部输入」
- [ ] `app/lib/attendance/settings.test.ts`：
  - 默认值常量必须是 `false`
  - `undefined` / `null` / `{}` / `{enabled: 'yes'}` / `{enabled: 'false'}` / `{enabled: 1}` / `{enabled: 0}` → `false`
  - `{enabled: true}` → `true`；自定义 `fallback` 时坏值落到该 fallback
- [ ] `app/store/attendanceStore.ts`：`ATTENDANCE_STORAGE_KEY` / `useAttendanceStore` / `setAttendanceEnabled`；
      `partialize` 只写 `enabled`；`merge` 走 `normalizeAttendanceSettings`；头注释说明为什么独立于 `useClassStore`
- [ ] 门禁：`pnpm test`、`pnpm typecheck`

**回滚点 R0**：纯新增文件。

## P1 设置卡与计数行（A3、D2）

- [ ] `app/features/profile/AttendanceSettings.tsx`：Card `id="card-attendance"`、标题「出勤统计」、
      角标「已开启 / 已关闭」（照 `AppUpdateSettings` 的 Badge 写法）、Switch（`useAttendanceStore`）、
      关闭态补一句「关闭只是不显示，已记录的出勤数据不会被删除」
- [ ] `ProfilePage.tsx`：在「学期设置」之后挂 `<AttendanceSettings />`；`已标记课程` 那一行条件渲染
- [ ] `DataManagementPage.tsx`：`已标记课程` 那一行条件渲染，其余计数行不动
- [ ] 门禁：`pnpm lint`、`pnpm format:check`、`pnpm typecheck`

**回滚点 R1**：设置卡可独立 revert。

## P2 数据模型与统计口径（D：E1–E5）

- [ ] `app/lib/types.ts`：`ClassMark` 加 `attendanceMarked: boolean`（行尾中文注释）；`AppData.schemaVersion: 4`
- [ ] `app/store/migrations.ts`：`CLASS_TRACK_SCHEMA_VERSION = 4`；`normalizeClassMarks` 改成真归一化
      （保留原 key、非对象条目丢弃、`attendanceMarked: raw.attendanceMarked !== false`）
- [ ] `app/store/slices/dataSlice.ts`：两处 `schemaVersion: 3` → `4`；四处写入点补 `attendanceMarked`
      （`toggleAttendance` 含**切换**分支、`markWeekAsAttended`、`markWeekAsUnattended`、`setNote` 新建时写 `false`）
- [ ] `app/store/utils.ts`：`createPastClassMarks` 写 `attendanceMarked: true`；新增 `isAttendanceMarked(mark)`（含运行时 `undefined` 兜底）
- [ ] `app/features/dashboard/utils.ts`：新增 `isAttendedSession` / `isAbsentSession` / `isUnmarkedSession` 三个谓词
- [ ] `app/features/dashboard/hooks/useDashboardStats.ts`：6 处过滤表达式换成谓词（absent / unmarked / weeklyTrend 三项 / weekdayDistribution 两项 / `groupByName` 三项）
- [ ] `DashboardOverview.tsx`：「未标记课次」描述改为「已发生但还没有标记是否上课」
- [ ] 单测：
  - `migrations.test.ts`：旧标记（无字段）补 `true`；显式 `false` 保留；非对象条目丢弃；原有「空数据等于 `createEmptyAppData()`」不变
  - `store/utils.test.ts`：`createPastClassMarks` 产出 `attendanceMarked: true`；`isAttendanceMarked` 三种输入
  - `dashboard/utils.test.ts`：三个谓词各覆盖（未标记 / 只写备注 / 已上 / 已判断未上）；原有用例的 mark 字面量补新字段
- [ ] 门禁：`pnpm test`、`pnpm typecheck`、`pnpm lint`

**回滚点 R2**：`revert` 后统计口径退回「只写备注 = 缺勤」，与 A/B/C 无关。

## P3 课表侧隐藏（B1–B5）

- [ ] `ScheduleCourseCell.tsx`：新增 `attendanceEnabled`；关闭时不加 `ring-*`、不画左侧色条、不画角标图标、`title` 去掉「已上/未上」；备注分支不动
- [ ] `ScheduleCourseCell.test.ts`：关闭态不含 `ring-emerald`/`ring-rose`/`bg-emerald-500`/`bg-rose-500` 且**仍含备注**；开启态含 `ring-emerald`
- [ ] `ScheduleHeader.tsx`：新增 `attendanceEnabled`；两个按钮 + `ConfirmDialog` 一起条件渲染；左侧动作组列数用 `cn` 切到 `grid-cols-[2.25rem_2.25rem_2.25rem]`
- [ ] `ScheduleHeader.test.ts`：关闭态不含「全部已上」「全部未上」且含新列数类；开启态两个按钮都在
- [ ] `ScheduleTable.tsx`：透传 `attendanceEnabled`
- [ ] `ScheduleCourseDialog.tsx`：新增 `attendanceEnabled`，关闭时不渲染出勤切换按钮（备注与保存按钮不动）
- [ ] `SchedulePage.tsx`：读 `useAttendanceStore((state) => state.enabled)`，传给 Header / Table / Dialog；
      `classMarks` 与 `selectedMark` 的读取保持不变
- [ ] 门禁：`pnpm test`、`pnpm typecheck`、`pnpm lint`

**回滚点 R3**：与 P4 互不依赖。

## P4 看板隐藏（C1–C5）

- [ ] `app/features/dashboard/components/AttendanceOffHint.tsx`：Card + `useNavigate()` 跳 `/profile`，文案按 design D6（必须含「已记录的出勤数据仍保留在本地与备份中」）
- [ ] `DashboardOverview.tsx`：新增 `attendanceEnabled`；关闭时只渲染 课程实例 / 总课次数量 / 备注数量，网格 `xl:grid-cols-3`
- [ ] `WeekdayDistributionChart.tsx` / `SectionDistributionChart.tsx`：新增 `attendanceEnabled`；关闭时不渲染「已上 / 缺勤」两个 `Bar`，`description` 去掉出勤承诺
- [ ] `DashboardEmptyState.tsx`：新增 `attendanceEnabled`，关闭态文案不提「完成度、缺勤率」
- [ ] `DashboardPage.tsx`：读 store；副标题按开关切换；关闭态插入 `<AttendanceOffHint />`（最上面第一张卡的位置）、不渲染 `WeeklyTrendChart` / `RiskCourseList` / `CourseRanking`、星期分布单独占行；空态传 `attendanceEnabled`
- [ ] 看板两态测试：关闭态 HTML 不含「缺勤」「完成度」「标记覆盖率」「周趋势」「风险课程」「课程完成度排行」且含「去开启」；开启态这些都在
- [ ] 门禁：`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`

**回滚点 R4**：看板有条件化与课表有条件化互不影响。

## P5 文档同步（R8）

- [ ] `README.md`：功能特性「出勤标记」改成「默认关闭、可在个人中心开启」；「数据看板」一条说明出勤类统计随开关出现；
      「管理课程」里两处补「（需先开启出勤统计）」；必要时补一句「旧记录的缺勤口径未改动」
- [ ] `.trellis/spec/frontend/mobile-schedule-layout.md`：顶栏段落补条件列数 `grid-cols-[2.25rem_2.25rem_2.25rem]`（出勤关闭时）
- [ ] `.trellis/spec/frontend/state-management.md`：store 列表补 `attendanceStore`（key、设备偏好、不进备份）；
      Common Mistakes 补两条：① 关闭出勤不得置空/过滤 `classMarks`；② 出勤三态判据必须走 `isAttendanceMarked` / 三个谓词，不得再写 `mark && !mark.isAttended`

## P6 验证与取证（D1、D3、D4、E1–E5）

- [ ] 五项门禁逐个跑并记录退出码：`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm test`、`pnpm build`
- [ ] 视觉证据（`pnpm dev`，375px 宽）：
      1. 默认（关闭）课表：无色条/图标/批量按钮，顶栏紧凑
      2. 默认（关闭）看板：提示卡 + 课程实例/总课次/备注数 + 三个分布图（只画总课次）
      3. 个人中心「出勤统计」卡（关闭态）
      4. 打开开关后的课表与看板（色条/图标/两个按钮/完成度/缺勤率/周趋势/风险课程/完成度排行全部回来）
      5. 关闭态课程弹窗（只有备注，无出勤按钮）
      截图落到 `research/` 并在 `verification.md` 里引用
- [ ] 数据复核：关闭态导出备份 → 文件里 `classMarks` 仍在（D1）；开启后标记与统计完整回来
- [ ] 口径复核（E1/E2）：造一条「只写备注」的课次，确认它在看板算**未标记**而不是缺勤；再用切换按钮标一次，确认它变成已上/缺勤
- [ ] 旧数据复核（E4）：用改动前的备份文件导入，确认字段补齐且缺勤率/完成度/未标记数与改动前一致
- [ ] `verification.md` 逐条对应 A1–A4 / B1–B5 / C1–C5 / D1–D4 / E1–E5；未验证项必须写「未验证」
- [ ] 提交前检查：`git diff --stat` 里应出现 `app/lib/types.ts`、`app/store/migrations.ts`、`app/store/slices/dataSlice.ts`（D 支线的预期改动），
      但**不应**出现 `app/store/index.ts`、`app/features/substitute-management/**`、`android/**`

---

## 验证环境备注（本机实测踩到的坑）

本会话的 shell 跑在 netns 隔离的沙箱里，这三条不解决就取不到视觉证据：

1. **每次命令调用是独立的网络命名空间**：`pnpm dev` 与 agent-browser 必须在**同一次调用**内启动，
   否则浏览器那边的 `localhost:5173` 是「另一个命名空间里的空地址」，只会得到 `ERR_CONNECTION_REFUSED`。
2. `$HOME` 是只读挂载，agent-browser 建不了 socket 目录 → 把 `HOME` 与 `XDG_RUNTIME_DIR` / `XDG_CACHE_HOME` /
   `XDG_CONFIG_HOME` / `XDG_STATE_HOME` 全指到 `/tmp` 下的可写目录。
3. 沙箱注入了 `HTTP_PROXY` 指向宿主代理，浏览器会把 `localhost` 也塞给代理 → 启动参数加 `--no-proxy-server`，
   并 `unset` 一组 `*_PROXY` 变量。

另一条交互坑：手机上目标控件常在**底部导航的覆盖范围**里，`click` 会打到底栏上（表现为「点了没反应」）。
先 `scrollintoview` 再 `click`，并回读 `localStorage` 确认状态真的变了（本次就是靠这一步发现点击没生效的）。
## 审查门

1. **P0 之后**：`normalizeAttendanceSettings` 必须是「非布尔回落」，不是真假值转换 —— `Boolean(source.enabled)` 这种写法一律打回。
2. **P2 之后**：逐个确认 5 个写入点都带上了 `attendanceMarked`（尤其 `toggleAttendance` 的**切换分支**与 `setNote` 的 `false`）；
   再确认 `useDashboardStats` 里再没有裸的 `mark && !mark.isAttended`。
3. **P2 之后（老数据）**：导出改动前的备份导入一次，缺勤率/完成度/未标记数必须与改动前逐项相同。
4. **P3 之后**：确认关闭态课表再也看不到出勤，同时备注**仍可见、仍可保存**；任何过滤/清空 `classMarks` 的写法打回。
5. **P4 之后**：把开关打开再走一遍看板，逐项确认与改动前一致（卡片顺序、文案、图表系列、网格列数）。这是本次唯一的回归风险点。

## 失败与回退

- 任一阶段门禁失败：先修到绿再进入下一阶段，不要带着红灯往前走。
- 整体放弃：按阶段 `git revert`；A/B/C/D 互不依赖，只回滚其中一支也不会破坏另一支。
- 数据层无需回滚：本任务不删不改已有标记，只补一个字段（旧代码读不到它也无害）。
