# 课表左右边缘阻尼手势切换上下周（可选开关，默认开启）

> 前台页面 = 课表主页（`index` 路由 → `app/features/schedule/SchedulePage.tsx`）。
> 本任务只做**手机端触摸**的前台手势 + 一个默认开启的可选开关；桌面端不启用。

## Goal

手机端课表是「整周一次看全」的页面，翻周目前只有一个 36px 的顶栏图标按钮（`上一周` / `下一周`）。
用户要求（2026-09-29）：**横向滑到课表最左/最右边缘后继续拖动时，用常见的阻尼（橡皮筋）跟手位移，
松手超过阈值即切换上一周 / 下一周**。做成可选开关，**默认开启**。

### 用户口径确认记录（2026-09-29）

| 问题 | 确认结果 |
|---|---|
| 是否走 Trellis 任务流程 | 是：建任务目录 + `prd.md` + `design.md` + `implement.md`，门禁通过后再归档 |
| 触发语义 | **先滚动、到边缘后阻尼切周**；并明确要求「**未缩放（1x，本来不能横向滚动）时也要阻尼 + 切换**」 |
| 生效端 | **仅手机端触摸**（`useIsMobile()` 为真 且 指针来自触摸）；桌面端鼠标拖拽不启用 |
| 视觉反馈档位 | **跟手位移 + 松手回弹/切换**；**不预渲染相邻周**内容，切周瞬间换内容 + 轻量淡入 |
| 分支 | 新分支 `feat/schedule-edge-swipe-week-switch`（从 `master` 开出，PR 目标 `master`） |

## 现状与事实（动手前必读）

| 事实 | 出处 | 对本任务的含义 |
|---|---|---|
| 横向滚动容器是 `div[data-schedule-scroll]`，带 `overflow-x-auto overflow-y-auto overscroll-contain [touch-action:pan-x_pan-y]` | `ScheduleTable.tsx` | 手势要挂在这个容器上；`overscroll-contain` 已经关掉了原生 overscroll 链与边缘发光，阻尼只能由我们自己画 |
| 1x 时网格 `min-w-[calc(100%*var(--schedule-zoom,1))]`，宽度恰好等于容器宽 → **无横向滚动** | `mobile-schedule-layout.md`、`ScheduleTable.tsx` | 1x 下「已经在边缘」恒成立，所以 1x 横滑天然进入阻尼分支 |
| 缩放 1.5x/2x 时网格宽 = 容器宽 × zoom → **有横向滚动** | 同上 | 缩放态必须「先正常滚动，滚到该方向边缘才阻尼」 |
| 双指缩放 / 双击 / 单指纵向滚动已由 `hooks/useScheduleZoom.ts` 占用 | `useScheduleZoom.ts`、`mobile-schedule-layout.md` 的 Gesture Implementation | 新手势**只能**碰横向轴，且不得抢走 pinch / 双击 / 纵向滚动 / 课程格点按 |
| `containerProps`（pointer 事件）挂在同一个滚动容器上，用于双击判定 | `ScheduleTable.tsx` → `useScheduleZoom()` | 触摸横滑时浏览器会 `pointercancel`（即使该方向根本不能滚），`pointerup` 坐标会被替换成「取消点」坐标 → 连续两次横滑可能被误判成双击触发缩放。**必须一起修**（D6） |
| 已有纯函数 `resolveScrollEdges({scrollLeft, scrollWidth, clientWidth}) → 'none'\|'start'\|'end'\|'both'` + 单测（容差 1px） | `app/lib/scroll-edges.ts` | 边缘判定**复用**它，不另写一份几何判据 |
| 显示类可选开关只有一个落点：`useScheduleDisplayStore`（key `class-track-schedule-display`）+ 个人中心「课表显示」卡片 | `scheduleDisplayStore.ts`、`ScheduleDisplaySettings.tsx` | 新开关必须走同一条路：初始值 / `partialize` / `merge` 三处同步维护 |
| 单测环境是 **node**（`vitest.config.ts`: `environment: 'node'`, `include: app/**/*.test.ts`），组件只能 SSR 渲染断言 | `vitest.config.ts`、`ScheduleHeader.test.ts` | 手势只能靠**纯函数单测 + 真机触摸验收**，不要指望 jsdom 拖拽测试 |
| `scheduleSourceGuard.test.ts` 守卫整个 `app/features/schedule/**`：禁 `text-[Npx]`、禁 `sm:` | 同左 | 新代码必须遵守 |
| 真机触摸验收有现成套路（AVD `Medium_Phone` + `adb shell input swipe/tap` + WebView CDP 断言 DOM 数值） | 项目 skill `classtrack-android-webview-verify` | AC 里的触摸项按它执行；`adb input` 坐标是设备像素（×dpr 2.625） |

## 范围

### 做

1. 手机端课表滚动容器上的横向边缘阻尼手势：跟手位移（阻尼曲线）→ 松手回弹或切周（含切周动画）。
2. 边界行为：第 1 周 / 最后一周方向上仍给阻尼位移，松手回弹、不切周。
3. 新增可选开关「左右边缘滑动切换周」，落在个人中心「课表显示」卡片，**默认开启**，随 `class-track-schedule-display` 持久化。
4. 修掉 `useScheduleZoom` 里「横滑被误判成双击 → 缩放被切换」的缺陷（D6）。
5. 纯函数单测 + store/设置项单测 + 真机触摸验收。

### 不做（明确排除）

- 桌面端鼠标拖拽切周。
- 相邻周内容预渲染 / 真正的跨屏跟手翻页（用户明确选了「不预渲染」）。
- 纵向拖动切周、双指左右捏合切周、顶栏以外的新入口。
- 改动手势外的滚动/缩放行为（1x 无横向滚动、缩放只改列宽等信息不变）。
- `prefers-reduced-motion` 的订阅式支持：**只**在动画提交时读一次 `matchMedia` 做降级，不引入订阅与状态。

## 验收标准

### 开关与持久化

- [ ] **AC-1** 个人中心「课表显示」卡片出现「左右边缘滑动切换周」开关，`id="schedule-display-edge-swipe-week"`，`aria-label` 与标签一致，说明文案写明「仅手机端 / 阻尼松手切周」；SSR 渲染断言能定位到它。
- [ ] **AC-2** 新字段默认值为 `true`（默认开启）。
- [ ] **AC-3** 持久化白名单（`partialize`）与 `merge` 同步包含新字段：旧数据缺字段时回落到 `true`；显式持久化的 `false` 必须被保留（不能被 `??` / falsy 判断吃掉）。持久化 key 仍是 `class-track-schedule-display`。

### 手势行为

- [ ] **AC-4** 开关关闭时：横滑**完全没有**跟手位移、不切周；纵向滚动、双指缩放、双击缩放、课程格点按全部照常。
- [ ] **AC-5** 桌面端（≥768px）：鼠标拖拽与触摸横滑都不切周、不产生位移。
- [ ] **AC-6** **1x（无横向滚动）**：横向拖动即出现阻尼跟手位移；松手超过阈值 → 切换上一周 / 下一周（顶栏「第 N 周」随之变化）；不足阈值 → 回弹到原位，周次不变。
- [ ] **AC-7** **缩放态（有横向滚动）**：横向拖动先按原生方式滚动课表；滚动到该方向边缘后继续同方向拖动才出现阻尼位移；松手超过阈值切周。滚动未到边缘时**不得**出现位移。
- [ ] **AC-8** **边界**：第 1 周右滑、第 `maxWeek` 周左滑：仍有阻尼位移（有「到头了」的反馈），松手回弹，`currentWeek` 不变。
- [ ] **AC-9** 方向正确：手指右滑（内容右移）→ 上一周；手指左滑 → 下一周。切周时的滑出 / 滑入方向与手指方向一致（不出现「反向弹回」）。
- [ ] **AC-10** 阻尼曲线**单调不减且有上界**：跟手位移的绝对值随手指位移单调增，且恒 ≤ 位移上限（拖再远也不会超过）。

### 零回归与实现约束

- [ ] **AC-11** 纵向拖动不产生任何横向位移、不影响纵向滚动；单指轻点课程格仍打开课程详情弹窗。
- [ ] **AC-12** 触摸端双击缩放仍生效，且**连续两次横滑不会被误判为双击**（`pointercancel` 的坐标不得再被当成 tap 坐标）。
- [ ] **AC-13** 拖动期间**不触发 React 状态更新**（不 setState、不因拖动重渲染 7×12 网格）；切周只提交一次 `setCurrentWeek`。
- [ ] **AC-14** 手势结束后内联 `transform` / `opacity` / `transition` / `data-week-swipe-state` 全部复位：不留残留位移、不留残留半透明；手势被取消（第二根手指出现、组件卸载、周次被顶栏按钮改变）时同样清理。
- [ ] **AC-15** 既有 DOM 测试挂钩不变：`data-schedule-scroll` / `data-schedule-grid` / `data-day-head` / `data-section-row` / `data-course-*` / `data-schedule-zoom-control` 全部保留且语义不变；1x 时 `[data-schedule-scroll]` 仍满足 `scrollWidth === clientWidth`。

### 证据与门禁

- [ ] **AC-16** `pnpm test` 覆盖新增纯函数（阻尼/方向判定/阈值/边界/滑入方向）与开关的默认值 + 持久化回落。
- [ ] **AC-17** `pnpm typecheck`、`pnpm lint`（`--max-warnings 0`）全绿。
- [ ] **AC-18** **真机触摸验收**（AVD + APK + `adb shell input swipe`）：AC-6 / AC-7 / AC-8 / AC-11 / AC-12 的关键路径各至少一次，证据（DOM 数值 + 截图）归档到本任务 `research/`。真机不可用时必须如实上报为未验证，不得按通过处理。
- [ ] **AC-19** 规格更新：`mobile-schedule-layout.md` 增补手势契约与测试挂钩，`state-management.md` 的显示开关清单同步新字段。

## 已评估但未做（口径留痕）

| 项 | 为什么不做 |
|---|---|
| 相邻周预渲染的整页跟手翻页 | 用户明确选了「不预渲染相邻周」；同时渲染 2~3 套 7×12 网格的成本与风险都不值 |
| `pointer` 事件 + `touch-action: pan-y` + 自己实现横向滚动与惯性 | 会拿走缩放态下原生的横向滚动和甩动惯性（真回归），换来的只是「不依赖 touchmove 观测」这一条 |
| 桌面端鼠标按住拖动切周 | 用户选择仅手机端；桌面还有方向键与顶栏按钮 |
| 手势后在顶栏加「上一周/下一周」的滑动提示动画 | 顶栏已禁用态明确，额外的提示动画不在需求内 |
