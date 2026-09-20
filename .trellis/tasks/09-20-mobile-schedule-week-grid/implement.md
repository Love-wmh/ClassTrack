# 执行计划：移动端课表整周可见与信息密度优化

## 执行约定

- 分支：`feat/mobile-schedule-week-grid`（从 `master` 切出，任务 `set-branch` 绑定）。
- 只动 `app/features/schedule/**` + 新增 `.trellis/spec/frontend/mobile-schedule-layout.md`；不改 store、路由、`app/lib/**`、`android/**`、`ScheduleHeader.tsx`。
- 每个阶段结束跑该阶段的校验，再进入下一阶段；任一阶段门禁失败不得继续叠加改动。
- 提交粒度：P1、P2+P3、P4、P5 各一次提交（中文主题，`feat(schedule): ...`）。
- 视觉验证脚本见 `design.md` 附录；种子数据用 `research/seed-schedule-fixture.js`。

## 需要的既有参考资料

- `.trellis/spec/frontend/component-guidelines.md`：props/命名/Tailwind/`cn()` 约定。
- `.trellis/spec/frontend/hook-guidelines.md`：feature hook 组织与 `useSyncExternalStore` 用法。
- `.trellis/spec/frontend/quality-guidelines.md`：五项门禁、禁止的抑制手段、vitest 只收 `*.test.ts`。
- `research/mobile-schedule-baseline.md`：改动前实测数据与复现步骤。
- `design.md`：D1~D12 决策与已知限制，实现与本文件冲突时以 `design.md` 为准。

## P0. 基线确认（不产出代码）

- [x] 用 412×915 / 360×800 / 1440×900 三个视口拍下改动前截图，记录 `scrollWidth`/`clientWidth`。
- [x] 记录：412 视口 `scrollWidth = 760`、`clientWidth = 388`；课名被 `line-clamp-2` 截断；教师字段缺失。
- 产物：`research/mobile-schedule-baseline.md`、`research/baseline-mobile-412.png`、`research/seed-schedule-fixture.js`。

## P1. 纯逻辑与常量（先写可测函数，再写 UI）

### 文件

- `app/features/schedule/constants.ts`
  - 新增 `ZOOM_TIERS = [1, 1.5, 2] as const`、`ZOOM_MIN = 1`、`ZOOM_MAX = 2`、`DETAIL_STANDARD_THRESHOLD = 1.35`、`DETAIL_FULL_THRESHOLD = 1.9`。
  - 保留既有 `dayNames` / `weekDays` / `sections` / `courseColors` 不动。
- `app/features/schedule/utils.ts`
  - `export type SectionTime = { start?: string; end?: string }`
  - `export function deriveSectionTimes(classes: Class[]): Record<number, SectionTime>`（规则见 `design.md` D5）
  - `export function getWeekParityLabel(weeks: number[]): string`（全奇 → `单周`，全偶 → `双周`，混合/空 → `''`）
  - `export function clampZoom(value: number): number`
  - `export function snapZoomTier(value: number): number`
  - `export function getDetailLevel(zoom: number): ScheduleDetailLevel`
- `app/features/schedule/utils.test.ts`（**新增**）

### 测试用例（全部不依赖当前时刻）

1. `deriveSectionTimes`：2 节块（1-2 / 08:00-09:40）→ 节 1 `{start:'08:00'}`、节 2 `{end:'09:40'}`，节 11/12 无条目。
2. `deriveSectionTimes`：单节课程（9-9 / 18:30-19:45）→ 节 9 `{start:'18:30', end:'19:45'}`。
3. `deriveSectionTimes`：同一节次出现两个候选时间时取众数；票数相同取字典序最小（两次调用结果一致）。
4. `deriveSectionTimes([])` → `{}`；课程 `startTime`/`endTime` 为空串时忽略该条。
5. `getWeekParityLabel([1,3,5])` → `单周`；`[2,4]` → `双周`；`[1,2,3]` → `''`；`[]` → `''`。
6. `clampZoom`：`0.5 → 1`、`3 → 2`、`1.5 → 1.5`。
7. `snapZoomTier`：`1.1 → 1`、`1.4 → 1.5`、`1.8 → 2`（断言吸附的是最近档位，边界值按实现定义写清）。
8. `getDetailLevel`：`1 → compact`、`1.5 → standard`、`2 → full`。

### 校验

```bash
pnpm test          # 含新增 utils.test.ts，全绿
pnpm typecheck
```

**通过判据**：新用例全部通过且用例数从 16 增加；`pnpm test` 无其它回归。
**回滚点**：本阶段只新增纯函数与常量，回滚不影响 UI。

## P2. 网格、节次列与表头（手机端整周可见）

### 文件

- `app/features/schedule/SchedulePage.tsx`
  - 新增 `const sectionTimes = useMemo(() => deriveSectionTimes(classes), [classes])`，下传 `sectionTimes`。
- `app/features/schedule/ScheduleTable.tsx`
  - props 增加 `sectionTimes: Record<number, SectionTime>`。
  - 滚容器加 `data-schedule-scroll`、`[touch-action:pan-x_pan-y]`、`overflow-y-auto`。
  - 内层网格：手机端 `min-w-[calc(100%*var(--schedule-zoom,1))]` + `grid-cols-[2rem_repeat(7,minmax(0,1fr))]`（实测回填：2.25rem 会让 360px 视口列宽掉到 43px，收到 2rem 后为 44px）；桌面端 `md:min-w-[760px]` + `md:grid-cols-[4rem_repeat(7,minmax(0,1fr))]`。**不要在手机端保留 `min-w-[760px]`**。行高同步改为 `grid-rows-[2.25rem_repeat(12,minmax(2.75rem,1fr))]`（给节号+两行时间一个下限）。
  - `style={{ '--schedule-zoom': zoom }}`（P2 先固定为常量 `1`，P4 接入 hook）。
  - 节次列表头单元格：显示 `format(getDayDate(firstWeekStartDate, currentWeek, 1), 'M月')`，date 为空时回退 `节`。
  - 节次行单元格：节号 + 最多两行时间（`sectionTimes[section]?.start / .end`，`text-[9px] leading-3 tabular-nums text-muted-foreground`），缺失时不渲染该行。

### 校验

```bash
# 412 / 360 视口：无横向滚动 + 7 列表头全部可见 + 列宽
agent-browser eval --stdin <<'EOF'
const el = document.querySelector('[data-schedule-scroll]')
const heads = [...el.querySelectorAll('[data-day-head]')].map((n) => Math.round(n.getBoundingClientRect().width))
({ noHScroll: el.scrollWidth === el.clientWidth, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, colWidths: heads })
EOF
```

**通过判据（对应 A1/A3/C1）**：412 与 360 两个视口 `noHScroll === true`；412 列宽 ≥ 44、360 列宽 ≥ 40；节次列出现 `08:00`、`09:40` 等时间；14 列不得被裁掉。
**回滚点**：仅网格类名与表头文本，`git revert` 本阶段提交即可回到 760px 版本。

## P3. 课程块信息分层与课名不截断

### 文件

- `app/features/schedule/ScheduleCourseCell.tsx`
  - props 增加 `showClassroom: boolean`、`showTeacher: boolean`、`showNote: boolean`。
  - 课名：手机端不限行数（`text-[11px] leading-[1.2]`），桌面端保留 `md:line-clamp-2 md:text-sm md:leading-5`。
  - 单双周徽标：`getWeekParityLabel(course.weeks)` 非空时在课名下渲染 `text-[9px] leading-3 text-slate-500`。
  - 教室 `showClassroom`、教师 `showTeacher`、备注 `showNote` 分别控制渲染；教师用 `course.teacher`。
  - 状态图标：手机端 `absolute bottom-0.5 right-0.5 rounded-sm bg-white/70`，桌面端 `md:static md:mt-0.5 md:bg-transparent`；外层加 `md:flex-row md:items-start md:justify-between md:gap-1`，保证桌面端视觉不变。
- `app/features/schedule/ScheduleTable.tsx`
  - `useIsMobile()` + `getDetailLevel(zoom)` 计算三个布尔值，传给每个 `ScheduleCourseCell`。

### 校验

```bash
agent-browser eval --stdin <<'EOF'
const cell = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('毛泽东思想和中国特色'))
const name = cell.querySelector('[data-course-name]')
({ text: name.textContent, clamp: getComputedStyle(name).webkitLineClamp, boxHeight: name.getBoundingClientRect().height, cellHeight: cell.getBoundingClientRect().height })
EOF
```

**通过判据（对应 B1~B4）**：1x 档位下 `name.textContent` 与 `course.name` 完全一致（无省略号）；`webkitLineClamp` 为 `none`；课名文本高度不超过课程块高度（不溢出到相邻节次）；`单周` 徽标只出现在周次全奇的课程块；课名元素可用宽度不被图标挤占。
**回滚点**：本阶段与 P2 同一提交或紧邻提交；两处回滚均不涉及数据结构。

## P4. 双指缩放与缩放入口

### 文件

- `app/features/schedule/hooks/useScheduleZoom.ts`（**新增**）
  - 状态：`zoom`（已提交档位，初始 `1`）、`detailLevel`（由 `getDetailLevel(zoom)` 派生）。
  - refs：`scrollRef`、`gridRef`。
  - 手势：`onPointerDown/Move/Up/Cancel`，Map 记录 pointer，双指时按 `design.md` D8 直接写 `--schedule-zoom` 并补偿 `scrollLeft`，松手时 `setZoom(snapZoomTier(...))`。
  - 双击：鼠标 `onDoubleClick`；触摸用两次 `pointerup` 的时间与位移判定。
  - `zoomIn` / `zoomOut`：在 `ZOOM_TIERS` 上前后移动一档；`canZoomIn` / `canZoomOut` 到边界为 false。
- `app/features/schedule/ScheduleTable.tsx`
  - 接入 hook，把 `containerProps` 挂到滚容器、`ref` 挂到两个 div、`style` 用 `zoom`。
  - 浮层控件：`md:hidden`，`absolute bottom-2 right-2 z-30`，`−` / 档位文本 / `+`，边界禁用；加 `data-schedule-zoom-control` 供断言。

### 校验

```bash
# 1) 双指捏合（两个 touch pointer，间距翻倍 → 松手应吸附到 2x）
# 2) 按钮：1x → 1.5x → 2x，再点 + 保持 2x（disabled）
# 3) 双击：1x ↔ 2x
# 4) 2x 下 scrollWidth > clientWidth，且课程块字号与 1x 相同
agent-browser eval --stdin <<'EOF'
const el = document.querySelector('[data-schedule-scroll]')
const cell = el.querySelector('button[data-course-cell]')
const before = { zoom: el.dataset.zoomLevel, fontSize: getComputedStyle(cell).fontSize }
// ...派发 pointer 事件后重新读
EOF
```

**通过判据（对应 D1~D6）**：双指手势后档位变化并吸附；−/+ 逐档且边界禁用；双击切换；2x 下 `scrollWidth > clientWidth` 且课程块字号与 1x 一致；2x 出现教室（1.5x 档位出现教室、1x 不出现）；`document.querySelector('[data-schedule-zoom-control]')` 在 1440 视口为 `null`。
**回滚点**：删除 hook 与新浮层，`zoom` 回退为常量 1（P2 的形态仍然可用）。

## P5. 桌面端回归与全量门禁

- [x] 1440×900 截图与 `research/baseline-desktop-1440.png` 逐项对比：7 列、`min-w-[760px]` 生效、课名 `line-clamp-2`、教室显示、无缩放控件、无手势影响（实测列宽 154、`min-width = 760px`、18/18 课名 clamp=2、可见节次时间 0、控件不在 DOM）。
- [x] 手机端回归：点击课程块打开详情弹窗、`<`/`>` 换周、键盘左右键换周、底部导航不遮挡课表（桌面 Chrome 与 Android 模拟器各跑一遍，见 `verification.md` E3/F 段）。
- [ ] 五项门禁：

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

- [x] `pnpm cap:sync:android` 无报错（Android 资产与 `build/client` 一致性由 `scripts/check-android-assets.js` 保证）。

**通过判据（对应 E1~E4）**：五项门禁全绿；桌面端截图与基线一致；真机验收明确标注为「由产品负责人在测试版 APK 上执行」的残余风险，不声称已验证。

## P6. Spec 更新与收尾

- [x] 新增 `.trellis/spec/frontend/mobile-schedule-layout.md`：移动端课表契约（整周自适应、信息分级档位、节次时间推导规则、桌面端边界、缩放不持久化、`data-schedule-scroll` / `--schedule-zoom` / `data-schedule-zoom-control` 供测试挂钩的约定）。
- [x] 在 `.trellis/spec/frontend/index.md` 的 Guidelines Index 增加一行指向该 spec，状态 `Implemented`。
- [x] `verification.md` 记录每项验收的真实证据（命令输出、截图路径、实测数值）与「未验证项 + 阻塞原因」。
- [x] 提交：`feat(schedule): 手机端课表整周可见并支持双指缩放`（中文主题），正文列改动与验证命令。
- [x] 真机（Android 模拟器）验收：见 `verification.md` F 段；过程中发现并修复「双击被 `dblclick` 与 `pointerup` 双重触发抵消」的真机缺陷。

## 阶段依赖与顺序

```
P0 基线（已完成）
  └─ P1 纯逻辑+测试 ──┬─→ P3 课程块分层（依赖 P1 的 getWeekParityLabel）
                      └─→ P2 网格/节次列（依赖 P1 的 deriveSectionTimes）
                              └─→ P4 缩放（依赖 P2 的 --schedule-zoom 变量）
                                      └─→ P5 桌面回归 + 门禁 ─→ P6 spec + 收尾
```

P2 与 P3 可并行实施、合并校验；P4 必须等 P2 的 CSS 变量与容器挂钩就位。
