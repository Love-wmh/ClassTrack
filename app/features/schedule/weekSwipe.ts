/**
 * 手机端课表「滑到左右边缘后阻尼切周」的纯数学与判定。
 *
 * 所有数值与判据**只在这里**定义：手势 hook（`hooks/useWeekSwipeGesture.ts`）只负责
 * 「读 DOM → 调这里 → 写 DOM」。抽成纯函数的目的是让这套逻辑能在 node 环境的 vitest 里
 * 钉死 —— `vitest.config.ts` 是 `environment: 'node'`，DOM 手势本身没法单测。
 *
 * 符号约定（**写错一个号就会反向**，全文件统一）：
 * - `dx`：手指位移，**向右为正**；
 * - `WeekStep`：`-1` = 上一周（手指右滑、内容右移、露出左边），`+1` = 下一周；
 * - `offset`：跟手位移（CSS px），**与 `dx` 同号**（内容跟着手指走）。
 */

import type { ScrollEdges } from '~/lib/scroll-edges'

/** 目标周：`-1` = 上一周，`+1` = 下一周。 */
export type WeekStep = -1 | 1

/** 一次手势的主动轴：判定前的 `undecided`、横滑与纵向滚动。 */
export type SwipeAxis = 'undecided' | 'horizontal' | 'vertical'

/** 速度采样点：`x` 是指针的 CSS px 横坐标，`t` 是 `event.timeStamp`（或 `Date.now()`）。 */
export type VelocitySample = { x: number; t: number }

/** 方向判定阈值：`|dx|`、`|dy|` 都没超过它时还不算开始拖动。 */
export const SWIPE_AXIS_SLOP_PX = 12

/** 跟手位移的渐近上界（CSS px）：拖再远也不会超过它，≈412px 屏宽的 23%。 */
export const RUBBER_MAX_PX = 96

/** 松手切周所需的阻尼位移（CSS px）。 */
export const SWITCH_DISTANCE_PX = 44

/** 松手切周的甩动速度阈值（CSS px / ms，即 600 px/s）。 */
export const SWITCH_VELOCITY_PX_PER_MS = 0.6

/** 切周时滑出 / 滑入的位移幅度（CSS px）。 */
export const SWITCH_TRAVEL_PX = 64

/** 切周「滑出」动画时长（ms）。 */
export const SWITCH_OUT_DURATION_MS = 110

/** 切周「滑入」动画时长（ms）。 */
export const SWITCH_IN_DURATION_MS = 170

/** 切周瞬间的最低不透明度：内容会在这一步被瞬时替换，用它把替换盖住。 */
export const SWITCH_MIN_OPACITY = 0.35

/** 回弹动画时长（ms）。 */
export const SNAP_BACK_DURATION_MS = 180

/** 速度采样的时间窗口（ms）：只统计最近这一段。 */
export const VELOCITY_SAMPLE_WINDOW_MS = 120

/**
 * 点按位移容差（CSS px）。
 *
 * 两个消费方共用同一个真源：本文件的手势层、以及 `hooks/useScheduleZoom.ts` 的双击判定
 * （「按下到抬起的位移超过这个值就不算点按」）。
 */
export const TAP_MOVE_TOLERANCE_PX = 24

/**
 * 阻尼曲线：把手指位移映射成跟手位移。
 *
 * 采用有界橡皮筋形式 `max * (1 - 1 / (1 + |raw| / max))`：单调递增、渐近于 `RUBBER_MAX_PX`、
 * 且小幅拖动时几乎 1:1（10px → 9.1px），不会一上手就「发黏」。
 * 达到切周阈值 `SWITCH_DISTANCE_PX` 需要 82px 的手指位移（≈412px 屏宽的 20%）。
 *
 * @param rawDelta 手指位移（CSS px，带符号）。
 * @returns 跟手位移（CSS px，符号与输入一致，绝对值恒 ≤ `RUBBER_MAX_PX`）。
 */
export function dampedOffset(rawDelta: number): number {
  const raw = Math.abs(rawDelta)
  if (raw === 0) return 0

  const bounded = RUBBER_MAX_PX * (1 - 1 / (1 + raw / RUBBER_MAX_PX))
  return Math.sign(rawDelta) * Math.min(bounded, RUBBER_MAX_PX)
}

/**
 * 判定一次拖动的主动轴。
 *
 * 平手（`|dx| === |dy|`）按横向处理：横向是本手势唯一的主动轴，纵向留给原生滚动
 * （原生滚动没有阈值，平手时抢走它会让斜向拖动变得难以滚动）。
 *
 * @param dx 相对按下点的横向位移（CSS px）。
 * @param dy 相对按下点的纵向位移（CSS px）。
 * @returns 未越过阈值时为 `undecided`；越过后给出占优轴。
 */
export function resolveSwipeAxis(dx: number, dy: number): SwipeAxis {
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  if (Math.max(absX, absY) < SWIPE_AXIS_SLOP_PX) return 'undecided'
  return absX >= absY ? 'horizontal' : 'vertical'
}

/**
 * 该方向的阻尼位移是否被允许。
 *
 * 复用 `app/lib/scroll-edges.ts` 的 `resolveScrollEdges` 结果，不另写几何判据。
 * 注意它的命名容易读反：`'end'` = **还在起点**（只能往末端滚），`'start'` = **已在末端**
 * （只能往回滚）。
 *
 * @param edges 滚动容器的边界判定结果。
 * @param step 目标周（`-1` 上一周 / `+1` 下一周）。
 * @returns `'none'`（没有横向溢出，1x 手机端）两侧都允许；`'both'`（两头还有内容）都不允许，
 *          交给原生滚动；`'end'` 只允许上一周；`'start'` 只允许下一周。
 */
export function sideAllowsRubber(edges: ScrollEdges, step: WeekStep): boolean {
  if (edges === 'none') return true
  if (edges === 'both') return false
  return edges === 'end' ? step === -1 : step === 1
}

/**
 * 手指位移对应的目标周。
 *
 * @param dx 手指位移（CSS px，带符号）。
 * @returns 右滑（`dx > 0`）为 `-1`（上一周）；左滑为 `+1`（下一周）；未移动为 `0`。
 */
export function weekStepFor(dx: number): WeekStep | 0 {
  if (dx > 0) return -1
  if (dx < 0) return 1
  return 0
}

/**
 * 该方向是否还有课表周可以切。
 *
 * 第 1 周不能往前、第 `maxWeek` 周不能往后；边界上**仍然给阻尼位移**（有「到头了」的反馈），
 * 只是松手不切周 —— 与顶栏翻周按钮的禁用态语义一致。
 */
export function canSwitchWeek(step: WeekStep | 0, currentWeek: number, maxWeek: number): boolean {
  if (step === -1) return currentWeek > 1
  if (step === 1) return currentWeek < maxWeek
  return false
}

export type SwitchDecisionInput = {
  /** 松手瞬间的跟手位移（CSS px，带符号）。 */
  offset: number
  /** 松手瞬间的手指速度（CSS px / ms，向右为正）。 */
  velocity: number
  /** 松手瞬间的目标周。 */
  step: WeekStep | 0
  /** 该方向是否还有周可切（`canSwitchWeek` 的结果）且当前允许切周。 */
  allowSwitch: boolean
}

/**
 * 松手是否切周。
 *
 * 两个判据任一成立即切：位移达到 `SWITCH_DISTANCE_PX`，或**朝目标周方向**的甩动速度达到
 * `SWITCH_VELOCITY_PX_PER_MS`（反向甩动不算，避免「拖过去再抖回来」被当成快甩）。
 */
export function shouldSwitchWeek({ offset, velocity, step, allowSwitch }: SwitchDecisionInput): boolean {
  if (!allowSwitch || step === 0) return false

  const towards = -velocity * step
  return Math.abs(offset) >= SWITCH_DISTANCE_PX || towards >= SWITCH_VELOCITY_PX_PER_MS
}

/**
 * 切周动画的位移。
 *
 * `'out'` 是把旧内容沿手指方向继续送出去（手指左滑 → 负向），`'in'` 是新内容进入的起点，
 * 恒在手指来向那一侧 —— 两者反向才不会有「反向弹回」的观感。
 */
export function switchTravelOffset(step: WeekStep, phase: 'out' | 'in'): number {
  return phase === 'out' ? -step * SWITCH_TRAVEL_PX : step * SWITCH_TRAVEL_PX
}

/**
 * 从速度采样里取最近窗口内的平均速度。
 *
 * 采样点按时间递增压入，且**每次重锚都会清空**（见 `design.md` §4），所以这里算出来的
 * 一定是「同一次阻尼段内的速度」，不会把原生滚动的速度误当成切周甩动。
 *
 * @param samples 采样点（时间递增）。
 * @param now 松手时刻。
 * @returns 平均速度（CSS px / ms，向右为正）；窗口内少于 2 个采样或时间差为 0 时返回 0。
 */
export function gestureVelocity(samples: readonly VelocitySample[], now: number): number {
  const recent = samples.filter((sample) => now - sample.t <= VELOCITY_SAMPLE_WINDOW_MS)
  if (recent.length < 2) return 0

  const first = recent[0]
  const last = recent[recent.length - 1]
  const elapsed = last.t - first.t
  if (elapsed <= 0) return 0

  return (last.x - first.x) / elapsed
}

/**
 * 按下点到抬起的位移是否还在「点按」范围内。
 *
 * 用途：`useScheduleZoom` 的双击判定不能再把「已经拖出去几十 px 的手势」当成一次 tap ——
 * 触摸横滑时浏览器会 `pointercancel`，其坐标离按下点只有几 px，靠它判定会把连续两次横滑
 * 误判成双击并切换缩放档位。
 */
export function isTapSizedMove(fromX: number, fromY: number, toX: number, toY: number): boolean {
  return Math.abs(toX - fromX) <= TAP_MOVE_TOLERANCE_PX && Math.abs(toY - fromY) <= TAP_MOVE_TOLERANCE_PX
}
