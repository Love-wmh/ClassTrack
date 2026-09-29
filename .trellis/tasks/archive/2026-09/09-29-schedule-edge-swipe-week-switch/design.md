# 设计：课表边缘阻尼手势切换上下周

> 需求见 `prd.md`。实现前先读 `mobile-schedule-layout.md` 的 Gesture Implementation 一节 —— 本设计**不改**它已有的任何约定，只在其上加一条横向轴规则。

---

## 1. 总览

三块改动，互相咬合：

```
① 纯函数核  app/features/schedule/weekSwipe.ts        ← 阻尼曲线 / 方向判定 / 阈值 / 边界 / 滑入方向 / tap 容差
② 手势层    app/features/schedule/hooks/useWeekSwipeGesture.ts   ← touch 观测 → 调 ① → 写 transform/opacity → 提交切周
③ 承接层    ScheduleTable.tsx（stage 包装 + 传 props）、SchedulePage.tsx（传 onWeekChange/maxWeek）
            scheduleDisplayStore.ts + ScheduleDisplaySettings.tsx（可选开关，默认开）
            useScheduleZoom.ts（修「横滑被误判成双击」，AC-12）
```

①是唯一真源：所有数值与判据都在这里，②只做「读 DOM → 调 ① → 写 DOM」。这样手势的数学部分可以在 node 环境的 vitest 里钉死（`vitest.config.ts` 是 `environment: 'node'`，组件只能 SSR 断言，DOM 拖拽测不了）。

---

## 2. 为什么用 touch 事件观测，而不是 pointer / 自己实现滚动

事实（已核对，见 `prd.md` 的事实表）：

- 浏览器**一旦把触摸序列判成滚动接管**，就会给 pointer 序列发 `pointercancel`（**即使该方向根本不能滚动**也会发，Flutter Web 的 glasspane 案例即此），此后 `pointerup` 的坐标是「取消点」而不是手指真实位置。
- `touchmove` 相反：即使浏览器正在滚动，**被动监听器仍会收到每一次 touchmove**（这是被动监听器用于滚动联动效果的官方用法）。

因此：

| 方案 | 结论 |
|---|---|
| A（采用）保留原生滚动 + 原生 `touch-action: pan-x pan-y`，用**被动 `touchmove` 观测**跟手位移，用 `transform` 画阻尼 | 缩放态下的**原生横向滚动与甩动惯性零成本保留**；代价是位移只在「已到边缘」时才画（见 §4 的互斥规则） |
| B `pointer` + `touch-action: pan-y` + 自己实现横向滚动与惯性 | 完全可控，但会**拿走缩放态原生的横向滚动与惯性**（真回归），且代码量翻倍 |
| C 用 pointer 事件直接跟手 | 不可行：`pointercancel` 会中断观测 |

**F1（唯一的技术赌注）**：若真机上「原生滚动期间不再派发 touchmove」，则缩放态下滚到边缘后没有阻尼。真机验收（AC-18）第一件事就是验这个。若 F1 成立 → **停机上报**，改走方案 B（不要在验收失败后静默换实现）。

---

## 3. 阻尼数学与阈值（`weekSwipe.ts`）

符号约定（贯穿全局，写错一个号就会反向）：

| 量 | 含义 |
|---|---|
| `dx = x - startX` | 手指位移，**向右为正** |
| `step` | 目标周：`-1` = 上一周（手指右滑、内容右移、露出左边），`+1` = 下一周 |
| `offset` | 跟手位移（CSS px），**与 `dx` 同号**（内容跟着手指走） |
| `dir = -step` | `offset` 的方向符号 |

```ts
export const SWIPE_AXIS_SLOP_PX = 12          // 方向判定阈值：超过它且 |dx| > |dy| 才算横滑
export const RUBBER_MAX_PX = 96               // 跟手位移的渐近上界（≈412px 屏宽的 23%）
export const SWITCH_DISTANCE_PX = 44          // 松手切周所需的位移
export const SWITCH_VELOCITY_PX_PER_MS = 0.6  // 松手切周的甩动阈值（600 px/s）
export const SWITCH_TRAVEL_PX = 64            // 切周时滑出/滑入的幅度
export const SWITCH_OUT_DURATION_MS = 110
export const SWITCH_IN_DURATION_MS = 170
export const SWITCH_MIN_OPACITY = 0.35        // 切周瞬间的最低不透明度（遮住内容瞬时替换）
export const SNAP_BACK_DURATION_MS = 180
export const VELOCITY_SAMPLE_WINDOW_MS = 120
export const TAP_MOVE_TOLERANCE_PX = 24       // 与 useScheduleZoom 现有双击位移容差同值
```

阻尼曲线（有界橡皮筋，单调、渐近于 `RUBBER_MAX_PX`）：

```ts
dampedOffset(raw) = sign(raw) * RUBBER_MAX_PX * (1 - 1 / (1 + |raw| / RUBBER_MAX_PX))
```

| 手指位移 | 跟手位移 |
|---|---|
| 10px | 9.1px |
| 40px | 28.3px |
| **82px** | **44px ← 达到切周阈值** |
| 200px | 64.9px |
| ∞ | 96px（上界） |

- 达到阈值需要 **82px** 的手指位移（约 412px 屏宽的 20%）；快甩由速度判据兜住，不必拖满。
- 曲线在小幅拖动时几乎 1:1（10px → 9.1px），不会一上手就「发黏」；超过 100px 后明显变钝。
- **不做**时间维度（松手后不继续跟手），松手即决定。

松手判据（`shouldSwitchWeek`）：

```ts
if (!allowSwitch || step === 0) return false
const towards = -velocity * step            // step=-1 时手指向右为正
return Math.abs(offset) >= SWITCH_DISTANCE_PX || towards >= SWITCH_VELOCITY_PX_PER_MS
```

`velocity` 只统计**最近 120ms 且落在同一次阻尼段内**的样本（每次重锚清零，见 §4），避免把原生滚动的速度当成切周甩动。

边界（`canSwitchWeek(step, currentWeek, maxWeek)`）：第 1 周不能往前、第 `maxWeek` 周不能往后。**边界仍然给阻尼位移**（有「到头了」的反馈），只是松手不切周 —— 与顶栏按钮的禁用态语义一致。

---

## 4. 边缘判定与「原生滚动 vs 阻尼」的互斥

边缘判定**复用** `app/lib/scroll-edges.ts` 的 `resolveScrollEdges`（已有 1px 容差与单测），不另写几何判据。

它的返回值与我们的方向映射（**命名容易读反，这里钉死**）：

| `edges` | 含义 | 允许阻尼的方向 |
|---|---|---|
| `'none'` | 内容没溢出（1x 手机端） | **两个方向都允许**（此时「已经在边缘」恒成立） |
| `'end'` | 还在起点（只能往末端滚） | 只允许 `step = -1`（上一周） |
| `'start'` | 已在末端（只能往回滚） | 只允许 `step = +1`（下一周） |
| `'both'` | 两头都有内容（还没到边缘） | 都不允许 → 交给原生滚动 |

```ts
export function sideAllowsRubber(edges: ScrollEdges, step: WeekStep): boolean
```

**互斥规则**（每帧按顺序执行，这是整套手势的核心）：

```
onTouchMove:
  raw = x - anchorX
  step = weekStepFor(raw)                                  // dx>0 → -1；dx<0 → +1；0 → 0
  allowed = step !== 0 && sideAllowsRubber(resolveScrollEdges(el), step)
  if (!allowed) { anchorX = x; samples.length = 0; applyOffset(0) }   // 重锚：位移归零
  else          { applyOffset(dampedOffset(raw)) }
```

- `!allowed` 的三类情形都走「重锚 + 位移归零」：**还没到该方向的边缘**（原生滚动正在工作）、**到了边缘但手指已经反向**（`step` 翻转）、**`step === 0`**。
- 拖到边缘后继续同方向拖：`scrollLeft` 不再变化 → `allowed` 变真 → `raw` 从这一刻开始累加 → 阻尼位移出现。这就是「先滚动、到边缘后阻尼」（AC-7）。
- 1x 时 `edges === 'none'` → `allowed` 恒真 → 横滑立刻跟手（AC-6）。
- **它同时解决了「回程双重位移」**：从边缘往回拖时，原生滚动立刻接管（`scrollLeft` 变化 → `edges` 不再是边缘 → 重锚 → 位移 0），不会出现「原生滚动 + 阻尼位移」同时发生。
- **它也是 F3（合成器滚动导致 `scrollLeft` 滞后）的兜底**：滞后时 `resolveScrollEdges` 判定还没到边缘 → 位移为 0，只会「晚一两帧出现阻尼」，不会闪。
- 位移写入去重：只在数值变化时写 `style.transform`，避免每帧重写同样的值触发样式重算。

---

## 5. DOM 结构与 `transform` 的落点

**决策：把 `transform` 写在滚动容器 `div[data-schedule-scroll]` 自己身上，外面加一层 `overflow-hidden` 的 stage 包装。**

理由：CSS Overflow 规范把**被 transform 的后代**算进滚动溢出区域 —— 若把 `transform` 写在网格 `[data-schedule-grid]` 上，阻尼位移会实时改变滚动容器的 `scrollWidth`，于是 `resolveScrollEdges` 的输入被自己污染（拖出 60px 后 `edges` 从 `'none'` 变成 `'end'`，AC-6 的 1x 分支会自己失效），还可能凭空长出滚动条。把 `transform` 放在滚动容器自身、由外层 `overflow-hidden` 裁剪，则网格的 `scrollWidth` 完全不受影响。

```jsx
<div className="relative flex min-h-0 flex-1 flex-col">              {/* 原有外层，不动 */}
  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">      {/* 新增 stage：只负责裁剪 */}
    <div ref={scrollRef} data-schedule-scroll ...>                    {/* 原有滚动容器，class 逐字符不变 */}
      <div data-schedule-grid ...>…</div>
    </div>
  </div>
  {isMobile && <div data-schedule-zoom-control …>}                    {/* 原有缩放浮层，不动 */}
</div>
```

- stage 是 `flex flex-col`，滚容器保持 `min-h-0 flex-1`，**两层的尺寸分配与改动前逐字符等价**（`clientWidth`/`clientHeight` 不变 → 课程格字号推导、整周铺满全部不变）。
- 所有既有测试挂钩留在原位（AC-15）：`data-schedule-scroll` 还在滚容器上，`scrollWidth === clientWidth` 的 1x 判据仍然成立。
- `transform` / `opacity` / `transition` 由 hook **命令式**写在滚容器的内联样式上；React 不管这三个属性（该元素没有 `style` prop），所以拖动期间的任何重渲染都不会把它们冲掉。
- **不**上 `will-change`：先按无优化跑真机，出现掉帧再议（`will-change` 会让 7×12 网格多一层合成层，内存与层抖动都是净成本）。

---

## 6. 松手动画（不预渲染相邻周）

`dir = -step`，`step = +1` 表示「下一周」（手指左滑）：

**未过阈值 / 边界不可切（回弹，`SNAP_BACK_DURATION_MS`）**

```
transition: transform 180ms ease-out;  transform → translate3d(0,0,0)
定时结束后：清空 transform/opacity/transition，dataset.weekSwipeState = 'idle'
```

**过阈值（三段，总时长 ≈ 110 + 1~2 帧 + 170 ≈ 310ms）**

```
A 滑出 110ms：  transform → translate3d(dir * 64px)   opacity → 0.35        // 沿手指方向继续走
B 换内容：      onSwitchWeek(currentWeek + step)
                transform → translate3d(step * 64px)（瞬时，无 transition）  // 新内容从对侧进入
C 滑入 170ms：  transform → translate3d(0,0,0)       opacity → 1
                结束后清空全部内联样式 → 'idle'
```

- 方向自检：`step=+1`（下一周，手指左滑）时 A 走 `-64px`（旧内容继续向左滑出），B/C 从 `+64px` 滑回 0（新内容从右侧进来）→ 与手指方向一致，不会出现「反向弹回」（AC-9）。
- B 用**瞬时**写入 + C 用 `requestAnimationFrame` 双帧启动动画。`transform` 写在滚容器（React 不管理它）上，因此**B 之后 React 何时提交新周内容都不影响位移的正确性**。
- `prefers-reduced-motion: reduce`：在松手时读一次 `matchMedia(...).matches`，为真则把三段时长都按 0 处理（仍是同步的换周，只是没有过渡）。**不做订阅、不进状态**。
- **取消与清理**（AC-14）：`touchcancel`、第二根手指出现、`enabled` 变假、组件卸载 → 清定时器/rAF + 清全部内联样式 + `'idle'`；动画期间用户在外部改了 `currentWeek`（顶栏按钮 / 键盘）→ 同样是「非自己发起的切换」→ 清动画并复位。

---

## 7. API 契约

### 纯函数核 `app/features/schedule/weekSwipe.ts`

```ts
export type WeekStep = -1 | 1
export const SWIPE_AXIS_SLOP_PX/RUBBER_MAX_PX/SWITCH_*/SNAP_BACK_DURATION_MS/VELOCITY_SAMPLE_WINDOW_MS/TAP_MOVE_TOLERANCE_PX: number

export function dampedOffset(rawDelta: number): number
export function resolveSwipeAxis(dx: number, dy: number): 'horizontal' | 'vertical' | 'undecided'
export function sideAllowsRubber(edges: ScrollEdges, step: WeekStep): boolean
export function weekStepFor(dx: number): WeekStep | 0
export function canSwitchWeek(step: WeekStep | 0, currentWeek: number, maxWeek: number): boolean
export function shouldSwitchWeek(input: {
  offset: number
  velocity: number
  step: WeekStep | 0
  allowSwitch: boolean
}): boolean
export function switchTravelOffset(step: WeekStep, phase: 'out' | 'in'): number   // out: -step*TRAVEL；in: +step*TRAVEL
export function gestureVelocity(samples: readonly { x: number; t: number }[], now: number): number
export function isTapSizedMove(fromX: number, fromY: number, toX: number, toY: number): boolean
```

`app/lib/scroll-edges.ts` 只被**引用**，不修改。

### 手势 hook `app/features/schedule/hooks/useWeekSwipeGesture.ts`

```ts
export function useWeekSwipeGesture(options: {
  scrollRef: React.RefObject<HTMLDivElement | null>   // 复用 useScheduleZoom 的 scrollRef
  enabled: boolean                                     // isMobile && store.edgeSwipeWeekSwitch
  currentWeek: number
  maxWeek: number
  onWeekChange: (week: number) => void
}): void
```

- 返回 `void`，与既有 `useWeekKeyboardNavigation` 同风格（无返回值即无新 API 面）。
- 监听用原生 `addEventListener`（`touchstart` / `touchmove` / `touchend` / `touchcancel`，`{ passive: true }`）+ `scroll`（`{ passive: true }`）**只订阅一次**（依赖 `enabled`）；`currentWeek` / `maxWeek` / `onWeekChange` 走 `latestRef`，避免手势途中重订阅。
- **绝不 `preventDefault`**：纵向滚动、课程格点按、双击缩放全部照常。

### 组件与 store

| 位置 | 改动 |
|---|---|
| `SchedulePage.tsx` | 给 `ScheduleTable` 多传 `maxWeek`、`onWeekChange`（`setCurrentWeek`） |
| `ScheduleTable.tsx` | 新增 stage 包装层；读 `edgeSwipeWeekSwitch`；`useWeekSwipeGesture({ scrollRef, enabled: isMobile && flag, currentWeek, maxWeek, onWeekChange })` |
| `scheduleDisplayStore.ts` | 新字段 `edgeSwipeWeekSwitch: boolean`（初始 `true`）+ `setEdgeSwipeWeekSwitch`；`partialize` / `merge` 同步 |
| `ScheduleDisplaySettings.tsx` | 新增开关行，`id="schedule-display-edge-swipe-week"`，`aria-label="左右边缘滑动切换周"` |
| `ScheduleHeader.tsx` | 给「第 N 周」span 补 `data-current-week={currentWeek}`（新增测试挂钩，便于真机验收无文案断言） |

### 测试挂钩（写进规格的 Test Hooks 表）

| 属性 | 位置 | 取值 / 用途 |
|---|---|---|
| `data-week-swipe-state` | 滚容器（命令式写，不在 React 树里） | `'idle'` \| `'dragging'` \| `'switching'`；真机验收用它避免与动画抢时序 |
| `data-current-week` | 顶栏「第 N 周」span | 断言切周是否发生、切到哪一周（不依赖中文文案） |

---

## 8. `useScheduleZoom` 的配套修复（AC-12）

问题：横向拖动时浏览器发 `pointercancel`，`handlePointerEnd` 把它当成一次 tap 记进 `lastTapRef`（坐标是取消点，离起点只有几 px）。于是**连续两次横滑**会被判成双击 → 触发 `toggleZoom()`，缩放被意外切换。当前 1x 屏上任何横滑都会走到这条路，只是概率低；本任务让横滑成为一等手势，必须先修。

两道保险（都用 `weekSwipe.ts` 的纯函数判据，可单测）：

1. **`pointercancel` 不再参与 tap 判定**：`containerProps` 拆成 `onPointerUp: handlePointerEnd` 与 `onPointerCancel: handlePointerCancel`；后者只做「从 pointers 表里删除 + 结束 pinch」的记账。
2. **`pointerup` 也要看按下到抬起的位移**：`isTapSizedMove(down, up)` 为假（> 24px）就不记 tap —— 鼠标拖选、未触发 cancel 的真机拖动都被挡住。

既有双击去抖（400ms）与双指缩放逻辑**不动**。

---

## 9. 失败模式与兜底

| 编号 | 失败模式 | 处理 |
|---|---|---|
| F1 | 原生滚动期间 touchmove 不再派发 → 缩放态到边缘后无阻尼 | 真机验收先验它；成立则**停机上报**改方案 B（见 §2） |
| F2 | `pointercancel` 语义与预期不同 | 双保险已覆盖（§8），且 `touchmove` 不依赖 pointer |
| F3 | 合成器滚动让 `scrollLeft` 滞后 | §4 的 `allowed` 判定兜住：滞后 = 未到边缘 = 位移 0 |
| F4 | `transform` 污染滚动区域 | 位移落在滚容器自身 + 外层 `overflow-hidden`（§5） |
| F5 | 动画途中再次拖动 | `touchstart` 清掉未完成的动画与定时器，以当前位置为新起点 |
| F6 | 手势期间外部改周 | `currentWeek` effect：非自己发起的切换 → 清动画 + 复位 |
| F7 | 打字/滚动时残留半透明或位移 | 所有结束路径（含 cancel/卸载/开关关闭）都走同一个 `reset()`，`reset()` 是唯一清理入口 |

---

## 10. 测试与验收策略

| 层 | 手段 | 覆盖 |
|---|---|---|
| 纯函数 | `app/features/schedule/weekSwipe.test.ts`（node） | 阻尼单调 + 有界 + 阈值位移 82px；方向判定（含 slop 边界、纵向优先）；`sideAllowsRubber` 的四值映射；`canSwitchWeek` 的 1/maxWeek 边界；`shouldSwitchWeek` 的距离/速度/反向甩动；`switchTravelOffset` 的方向自检；`gestureVelocity` 的窗口截取；`isTapSizedMove` |
| store | `app/store/scheduleDisplayStore.test.ts` 扩充 | 默认 `true`；`partialize` 键集合含新字段；`merge` 缺字段回落 `true`、显式 `false` 保留；key 不变 |
| 组件（SSR） | 新增 `ScheduleDisplaySettings.test.ts` | 开关存在、`aria-label`、默认勾选；若 Radix `Switch` 在 SSR 下不吐 `data-state`，退化为断言 label + `aria-label` + switch 节点存在（在 `verification.md` 里注明） |
| 源码守卫 | 复用 `scheduleSourceGuard.test.ts` | 新文件不得出现 `text-[Npx]` / `sm:` |
| 真机触摸 | 项目 skill `classtrack-android-webview-verify`：AVD `Medium_Phone` + APK + CDP `Input.dispatchTouchEvent`（看拖动中的 `transform` / `data-week-swipe-state`）+ `adb shell input swipe`（看松手后的 `data-current-week`）+ `adb shell input tap`（点按零回归） | AC-6 / AC-7 / AC-8 / AC-11 / AC-12 的关键路径 |

真机证据（DOM 数值 + 截图）与服务端口径一起归档到本任务 `research/`；真机不可用时**如实上报未验证**，不按通过处理。
