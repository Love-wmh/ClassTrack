# 技术设计：移动端课表整周可见与信息密度优化

## 0. 问题定义与基线证据

### 基线（改动前，实测）

用 412×915、DPR 2 的视口打开 `http://localhost:5173/`（种子数据：20 条 2026-2027-1 课程，第 3 周），实测现状：

| 现象 | 证据 | 根因 |
| --- | --- | --- |
| 只看到 3.5 天，必须横向滚动 | 容器 `scrollWidth = 760`，`clientWidth = 388` | `ScheduleTable.tsx` 内层网格 `min-w-[760px]`，7 列被固定撑到 760px |
| 课名被截断成两行 | `毛泽东思想和中国特色…` | `ScheduleCourseCell.tsx` 课名 `line-clamp-2` |
| 教师从未显示 | DOM 中无 `course.teacher` | `ScheduleCourseCell.tsx` 只渲染 `name` 与 `classroom` |
| 节次列只有数字，没有时间 | 节次列只有 `1..12` | `constants.ts` 只有 `sections`，没有节次时间表 |
| 课程块内容只占块高上半部 | 2 节块 130px 高，文字约 45px | 12 行 `minmax(0,1fr)` 填满视口，块高由视口决定，与内容无关 |

基线与复现步骤、种子数据见 `research/mobile-schedule-baseline.md`。

### 目标形态

1x（整周可见，列宽 ≈ 48px）→ 2x（列宽 ≈ 96px，教室/教师/备注出现，可横向拖动）。缩放只改列宽，不改字号：**列变宽后同样的字数换行更少，信息反而更多**。

## D1. 网格去掉固定最小宽度，改为按可用宽度均分

**决策**：手机端去掉 `min-w-[760px]`，桌面端保留。

```tsx
<div className="relative flex min-h-0 flex-1 flex-col">
  <div
    ref={scrollRef}
    data-schedule-scroll
    {...containerProps}
    className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain rounded-md border border-border bg-card shadow-xs [touch-action:pan-x_pan-y]"
  >
    <div
      ref={gridRef}
      data-schedule-grid
      data-zoom-level={zoom}
      data-zoom-tier={detailLevel}
      className="grid h-full min-w-[calc(100%*var(--schedule-zoom,1))] grid-cols-[2rem_repeat(7,minmax(0,1fr))] grid-rows-[2.25rem_repeat(12,minmax(2.75rem,1fr))] md:min-w-[760px] md:grid-cols-[4rem_repeat(7,minmax(0,1fr))]"
      style={{ '--schedule-zoom': String(zoom) } as CSSProperties}
    >
```

**为什么用百分比 `min-width` 而不是 `width`**：`min-width: calc(100% * var(--zoom))` 让 1x 时网格宽度恰好等于容器宽度（无横向滚动），大于 1x 时才出现滚动宽度；比例基准是“容器可用宽度”，不依赖任何测得像素。百分比在 `overflow` 容器里对子元素解析的是容器的 padding box 宽度，不会与子元素自身宽度形成循环。

**列宽推导（实测值）**：412px 视口 → 页面 `px-2`（16px）+ 边框 2px → 可用 394px；节次列 2rem（32px）→ 362 / 7 ≈ **52px/列**。360px 视口 → 342 - 32 = 310 / 7 ≈ **44px/列**（满足 A3 的 ≥44px）。两者都不需要横向滚动。

**手机端内边距从 `px-3` 收到 `px-2`**：这不是审美偏好，而是上面 44px 列宽下限的必要条件——用 `px-3` 时 360px 视口只有 43px/列。桌面端由 `sm:px-5` 覆盖，不受影响。

**未采纳**：把 7 列改成横向滚动的 2~3 天窗口。用户明确要求 1x 整周一眼看全，滚动的价值交给放大档位。

## D2. 行高保持 12 行等分视口（不改成内容自适应）

**决策**：继续用 `grid-rows-[2.25rem_repeat(12,minmax(2.75rem,1fr))]`，行高随视口高度均分，但给每行一个 2.75rem 的下限（节号 + 两行 9px 时间的高度），视口过矮（横屏）时网格高于容器、由滚容器竖向滚动兜底。

**理由**：2 节块在 412×915 上约 116px 高、50px 宽，11px 中文按 3~4 字/行计算，21 字的课名约 6 行 = 90px，能完整放下；也就是说**纵向空间不是瓶颈，宽度才是**（这正是用户说的“手机高度明显大于宽度”）。

**未采纳**：`grid-auto-rows: minmax(1.75rem, auto)` 的内容自适应行高。它会让不同日期的同一节次高度不一致（跨列错位），并让下方节次位置随内容跳动，比“多出一些空白”更伤可读性。若将来出现“1 节块塞长课名”的普遍场景，再单独开任务处理。

## D3. 课程块内课名不截断，改为竖向铺满

`ScheduleCourseCell.tsx` 的课名改为手机端不限行数、桌面端保持 `line-clamp-2`：

```tsx
<span className="block text-[11px] font-medium leading-[1.2] text-slate-950 md:line-clamp-2 md:text-sm md:leading-5">{course.name}</span>
```

- 响应式前缀只加 `md:`，因此 <768px 完全不加 clamp，块内自然换行；
- 整块 `overflow-hidden` 已存在，块高不足时由块边界裁剪（A/B3），不会溢出到相邻节次。

**信息顺序（自上而下，先重要后次要）**：课名 → 单双周徽标 → 教室 → 教师 → 备注。空间不足时被裁掉的总是最后的次要字段，而不是课名。

## D4. 考勤状态图标不再占文本宽度

现状是课名与图标同一行 `flex items-start justify-between`，图标吃掉 14px（50px 列宽的 28%）。改为：

```tsx
{/* 内容列 */}
<div className="flex min-h-0 flex-1 flex-col pl-1">...</div>
{/* 状态图标：手机端绝对定位到块右下角，桌面端回到行内 */}
<div className={cn('absolute bottom-0.5 right-0.5 rounded-sm bg-white/70 md:static md:mt-0.5 md:bg-transparent', isAttended ? 'text-emerald-600' : 'text-rose-600')}>
  {isAttended ? <CheckCircle2 className="size-3 md:size-4" /> : <CircleAlert className="size-3 md:size-4" />}
</div>
```

外层容器加 `md:flex-row md:items-start md:justify-between md:gap-1`，使桌面端 DOM 结构与视觉效果与改动前一致（图标回到右上角行内）。左侧 3px 的绿/红竖条保留，作为不依赖图标的状态指示。

## D5. 节次时间：放在最左列，由课程数据推导

**用户约束**：时间放在最左侧节次列（`1/2/3` 那个格子），不放进课程块。

**数据可得性**：解析器只提供“块级”时间（`KSSJ = 08:00`、`JSSJ = 09:40` 对应 `KSJC=1 → JSJC=2`），没有单节时间表。因此不能凭空造出 `08:45 / 08:55`。

**推导规则**（`app/features/schedule/utils.ts` 新增纯函数）：

```ts
export type SectionTime = { start?: string; end?: string }

/**
 * 从课程数据推导每个节次的边界时间。
 *
 * 解析数据只有块级时间（一节课可能跨多节），因此规则是：
 * 单节课程（startSection === endSection）同时提供该节的 start 与 end；
 * 跨节课程只在 startSection 提供 start、在 endSection 提供 end。
 * 同一节次出现多个候选时取众数；票数相同取字典序最小者，保证结果稳定。
 */
export function deriveSectionTimes(classes: Class[]): Record<number, SectionTime>
```

- 输入用**整个学期**的 `classes`（而非 `weekClasses`），只在本周出现的节次也能拿到时间；在 `SchedulePage` 里 `useMemo(() => deriveSectionTimes(classes), [classes])` 算好后作为 `sectionTimes` prop 传入 `ScheduleTable`。
- 渲染：节号一行，下面最多两行时间（`08:00` / `09:40`），`text-[9px] leading-3 text-muted-foreground`；`start`/`end` 缺失就不渲染该行，因此未使用的节次（如 11/12）只显示节号。
- 节次列在手机端宽度 2rem（32px），`08:00` 用等宽数字（`tabular-nums`）在 9px 下约 26px，放得下。

**已知限制**：2 节块只能推导出“第 1 节 08:00 开始”“第 2 节 09:40 结束”，中间的 `08:45 / 08:55` 无法从数据得到。这是数据源限制，不是实现缺陷；在设计的验收里不作为失败项。

## D6. 表头：节次列显示月份

节次列表头单元格在**手机端**显示当前显示周的月份（`format(getDayDate(firstWeekStartDate, currentWeek, 1), 'M月')`，跨月周取周一所在月份），桌面端保持原来的 `节`（`md:hidden` / `hidden md:inline` 两个 span 切换），这样 A2 的桌面截图对比不受影响。

## D7. 缩放：只改宽度的分档缩放（1x / 1.5x / 2x）

**档位与信息分级**（`utils.ts` 纯函数，可测）：

```ts
export const ZOOM_TIERS = [1, 1.5, 2] as const
export type ScheduleDetailLevel = 'compact' | 'standard' | 'full'

/** 把连续缩放值吸附到最近的档位。 */
export function snapZoomTier(value: number): number
/** 把任意输入裁剪到合法缩放区间。 */
export function clampZoom(value: number): number
/** 档位对应的信息分级：<1.35 概览、<1.9 标准、其余完整。 */
export function getDetailLevel(zoom: number): ScheduleDetailLevel
```

| 档位 | 列宽（412px 视口） | 课程块显示 |
| --- | --- | --- |
| 1x | 52px（实测） | 课名（不截断）+ 单双周徽标 + 状态色条/图标 |
| 1.5x | 80px（实测） | 追加教室 |
| 2x | 108px（实测） | 追加教师与备注；容器出现横向滚动（394 → 788px） |

**为什么缩放只改列宽、不改字号**：`zoom`/`transform: scale` 会等比放大字号与列宽，换行位置不变，信息不增加（就是用户否掉的“纯放大镜”）。只改列宽时，同样字号在更宽的列里换行更少，长课名占的行数下降，腾出的行高正好容纳教室/教师——这才是“放大后信息变多”。

**为什么是 3 档而不是连续**：连续缩放需要每帧重排 7 列 × 12 行网格，且信息分级没有明确的触发点；离散档位让“松手后吸附”成为可测断言（D1/D2），也让验收可复现。

## D8. 双指缩放的实现

新增 feature 私有 hook `app/features/schedule/hooks/useScheduleZoom.ts`：

```ts
export function useScheduleZoom(): {
  zoom: number
  detailLevel: ScheduleDetailLevel
  scrollRef: RefObject<HTMLDivElement | null>
  gridRef: RefObject<HTMLDivElement | null>
  containerProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onDoubleClick }
  zoomIn: () => void
  zoomOut: () => void
  canZoomIn: boolean
  canZoomOut: boolean
}
```

**手势流程**：

1. `onPointerDown`：把 `pointerId → {x, y}` 记入 Map，并对该 pointer 调用 `setPointerCapture`；当 Map 里正好 2 个 pointer 时进入手势，记录 `startDistance`、`startZoom = 当前档位`。
2. `onPointerMove`：更新坐标；手势激活时 `next = clampZoom(startZoom * distance / startDistance)`，**直接写 DOM**：`gridRef.current.style.setProperty('--schedule-zoom', String(next))`，并按捏合中心补偿横向滚动（`scrollLeft = (scrollLeft + centerX) * ratio - centerX`，读完 `scrollWidth` 强制一次布局）。同时对 `pointerType === 'touch'` 的事件调用 `preventDefault()`，避免 WebView 同时平移。
3. `onPointerUp` / `onPointerCancel`：移出 Map；当剩余 pointer < 2 且手势激活时结束手势，`setZoom(snapZoomTier(next))` 提交一次 React 状态。

**为什么手势期间不 setState**：每帧 `setState` 会重渲染整张网格（7×12 单元 + 20 个课程块），在 WebView 上会掉帧（N2）。CSS 变量只触发样式重算，React 只在松手后渲染一次，顺便完成信息分级切换。

**为什么 1x 必须精确等于 1**：`min-width: calc(100% * var(--schedule-zoom))` 在 `var` 为 1 时恰好不溢出，这是 A1「无横向滚动」的机理；`clampZoom` 的下界就是 1。

**双击**：鼠标走 `onDoubleClick`（1x ↔ 2x）；触摸端另外用 `pointerType === 'touch'` 的两次 `pointerup` 做判定（间隔 < 320ms、位移 < 24px）作为兜底。

**真机修证（2026-09-20，Android 37 模拟器实测）**：Android WebView 在第二次抬起后**同时**派发我们的 `pointerup` 判定与浏览器合成的 `dblclick`，两条路径各切换一次档位、相互抵消，表现为“真机双击没反应”（桌面 Chrome 只派发 `dblclick`，所以 Web 侧断言曾经全绿却漏掉了它）。修法是在 `toggleZoom` 上加 400ms 去抖窗口，窗口内的第二次调用直接返回，两条路径保留其一即可。

**控件**：`ScheduleTable` 内、滚容器外层右下角浮层（`absolute bottom-2 right-2 z-30`，由 `isMobile &&` 条件渲染，桌面端不进 DOM）渲染 `− 档位 +`，到边界时对应按钮 `disabled`。浮层覆盖区是右下角最后几节，通常为空；这是为换取“不加高手机端表头”的取舍，记入已知限制。

## D9. 桌面端零改动的边界

| 能力 | 手机端 (<768px) | 桌面端 (≥768px) |
| --- | --- | --- |
| 网格最小宽度 | 无（`100% * zoom`） | 保持 `min-w-[760px]` |
| 列宽/字号 | 新节次列 2rem，课名 11px | 保持 4rem 节次列、14px 课名 |
| 课名行数 | 不截断 | 保持 `line-clamp-2` |
| 教室 | 仅 ≥1.5x | 一直显示（现状） |
| 教师/备注 | 仅 2x | 教师不显示、备注保持现状 |
| 缩放/控件/手势 | 启用 | 不启用（`useIsMobile()` 为 false 时 `zoom` 恒为 1，控件不渲染） |

**判断依据统一用 `app/hooks/use-mobile.ts` 的 `useIsMobile()`**（`max-width: 767px`，`useSyncExternalStore`，符合 hook-guidelines），而不是 `window.innerWidth` 直接读值。

## D10. 数据流

```
useClassStore (classes / weekClasses / classMarks / currentWeek)
  └─ SchedulePage
       ├─ useMemo: weekClasses        → props 给 ScheduleTable（现状）
       ├─ useMemo: deriveSectionTimes(classes) → sectionTimes prop（新增）
       └─ ScheduleTable
            ├─ useScheduleZoom() → zoom / detailLevel / 手势 props / 控件
            ├─ 节次列：section + sectionTimes[section] 的时间行（新增）
            ├─ 表头：月份 + 周几 + 日期（现状改月份）
            └─ ScheduleCourseCell（weekClasses × 1）
                 props: course / mark / onClick
                        + showClassroom / showTeacher / showNote（新增）
```

课程块 props 用扁平布尔值而非 `detailLevel` 字符串：组件只关心“显示不显示”，分级策略（含桌面端覆盖）留在 `ScheduleTable` 一处决定。

```ts
const isMobile = useIsMobile()
const showClassroom = isMobile ? detailLevel !== 'compact' : true
const showTeacher = isMobile && detailLevel === 'full'
const showNote = isMobile ? detailLevel === 'full' : true
```

## D11. 文件与职责

| 文件 | 改动 |
| --- | --- |
| `app/features/schedule/constants.ts` | 新增 `ZOOM_TIERS`、`ZOOM_MIN/MAX`、`DETAIL_THRESHOLDS`、`SECTION_TIME_FALLBACK` 相关常量 |
| `app/features/schedule/utils.ts` | 新增 `deriveSectionTimes`、`getWeekParityLabel`、`clampZoom`、`snapZoomTier`、`getDetailLevel`（全为纯函数） |
| `app/features/schedule/utils.test.ts` | **新增**，覆盖上述纯函数（含并列票数稳定性、空输入、混合周次） |
| `app/features/schedule/hooks/useScheduleZoom.ts` | **新增**，手势、档位状态、滚动补偿、双击判定 |
| `app/features/schedule/ScheduleTable.tsx` | 网格类名、`--schedule-zoom` 变量、`sectionTimes`/`data-schedule-scroll`、节次列时间、月份表头、缩放浮层、分级 props |
| `app/features/schedule/ScheduleCourseCell.tsx` | 课名不截断、单双周徽标、教室/教师/备注分级、状态图标定位 |
| `app/features/schedule/SchedulePage.tsx` | `useMemo` 计算 `sectionTimes` 并下传 |

不改：`app/store/**`、`app/routes/**`、`app/lib/**`、`android/**`、`ScheduleHeader.tsx`。

## D12. 风险、缓解与回滚

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| WebView 上 `pointermove.preventDefault()` 无效，双指时同时平移 | 缩放体验抖动 | 仅为体验降级，不影响档位切换；`touch-action: pan-x pan-y` 已排除原生 pinch-zoom，实测以 D1 断言为准 |
| `min-width` 百分比在极端窄视口（<320px）触发横向滚动 | 1x 仍可横滚 | A1 只承诺 360/412 两个视口；`clampZoom` 下界 1 保证不放大时正好 `100%` |
| 缩放浮层遮挡右下角课程块 | 1 个小图标区域 | 覆盖区为最后节次右下角；浮层半透明、`pointer-events` 只在自己身上，课程块点击不受影响（E3 覆盖） |
| 页面级双指缩放（表头/导航空白区）仍会缩放整个 App | 视觉错乱 | 本次不改 `root.tsx` 的 viewport（改动超出范围）；若真机复现，另开任务加 `maximum-scale` |
| 真机 Android WebView 与 Chromium 桌面差异 | 真机手势体验与桌面不一致 | 桌面 Chromium 断言 + `cap:sync` 资产校验；真机验收由产品在测试版 APK 上执行，作为残余风险记录 |

**回滚**：改动集中在 `app/features/schedule/**` 的 4 个文件 + 1 个新 hook + 1 个新测试文件，无数据迁移、无 store 变更。回滚即 `git revert` 该分支的任务提交；1x 网格类名与 `ScheduleCourseCell` 的旧结构在 diff 中完整可见。

## 已知限制（交付口径）

- 2 节块的“节中空档时间”（如 08:45/08:55）无法从现有解析数据推导，节次列只显示可推导的起止点。
- 1 节块塞入 18 字以上课名时，1x 档位仍会被块高裁剪；放大到 ≥1.5x 可完整显示。
- 缩放档位不持久化，退出页面回到 1x。
- 桌面端不提供缩放，行为与视觉与改动前一致。

## 附录：验证工具链

本机复现手机端渲染（可在一次 bash 调用内完成）：

```bash
export XDG_RUNTIME_DIR=/tmp/claude/ab-runtime   # /run/user/1000 挂载为 ro，agent-browser 建不了 socket
mkdir -p "$XDG_RUNTIME_DIR" /tmp/claude          # TMPDIR=/tmp/claude 必须存在，否则 pnpm 直接崩
cd <repo> && setsid nohup pnpm dev > /tmp/dev.log 2>&1 &   # 后台进程不能跨 bash 调用存活
agent-browser set viewport 412 915 2
agent-browser open http://localhost:5173/
agent-browser eval --stdin < research/seed-schedule-fixture.js   # 写 localStorage 后需重新 open 一次
agent-browser screenshot /tmp/shots/after-mobile-412.png
```
## D13. 测试挂钩（data 属性契约）

自动化验证靠 DOM 属性定位，不靠中文文案或 Tailwind 类名。这些属性是本次交付的一部分，后续改动不得静默移除：

| 属性 | 位置 | 用途 |
| --- | --- | --- |
| `data-schedule-scroll` | 课表滚动容器 | 断言 `scrollWidth === clientWidth`（A1）、读 `scrollLeft` |
| `data-schedule-grid` | 内层网格 | 定位网格、读 `min-width` 计算值 |
| `data-zoom-level` | 内层网格 | 当前档位数值（`zoom` 提交值） |
| `data-zoom-tier` | 内层网格 | 当前信息分级（`compact`/`standard`/`full`） |
| `data-day-head` | 每个日期表头单元格 | 读列宽、确认 7 列都在视口内 |
| `data-section-row` | 每个节次行单元格 | 读节号与其时间文案 |
| `data-course-cell` | 课程块按钮 | 读字号、块高、点击回归 |
| `data-course-name` | 课程块内课名元素 | 断言 `textContent` 完整且 `webkit-line-clamp: none` |
| `data-course-parity` | 课程块内单双周徽标 | 断言 1x 可见、桌面端不渲染（用可见性而非 textContent，避免与备注文案混淆） |
| `data-schedule-zoom-control` | 缩放浮层 | 断言桌面端不渲染、手机端可见 |

反例（不要这样做）：用 `textContent.includes('毛泽东思想和中国特色')` 定位课程块、用 `:nth-child(3)` 定位列 —— 文案会改写、列顺序会被响应式调整。


测量脚本（无横向滚动断言）：

```js
const el = document.querySelector('[data-schedule-scroll]')
({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, ok: el.scrollWidth === el.clientWidth })
```
