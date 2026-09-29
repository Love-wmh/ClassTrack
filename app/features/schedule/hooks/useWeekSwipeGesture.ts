import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { resolveScrollEdges } from '~/lib/scroll-edges'
import type { ScrollEdges } from '~/lib/scroll-edges'
import {
  SNAP_BACK_DURATION_MS,
  SWITCH_IN_DURATION_MS,
  SWITCH_MIN_OPACITY,
  SWITCH_OUT_DURATION_MS,
  SWITCH_TRAVEL_PX,
  VELOCITY_SAMPLE_WINDOW_MS,
  canSwitchWeek,
  dampedOffset,
  gestureVelocity,
  resolveSwipeAxis,
  shouldSwitchWeek,
  sideAllowsRubber,
  switchTravelOffset,
  weekStepFor,
} from '../weekSwipe'
import type { SwipeAxis, VelocitySample, WeekStep } from '../weekSwipe'

/** 手势阶段：供自动化断言读 `data-week-swipe-state`（不做进 React state，避免拖动期间重渲染）。 */
type SwipeState = 'idle' | 'dragging' | 'switching'

type GestureState = {
  startX: number
  startY: number
  axis: SwipeAxis
  /** 阻尼段的起点：手指位移与它相减，重锚时前移（见 `design.md` §4）。 */
  anchorX: number
  /** 重锚时记下的原生滚动位置。 */
  anchorScrollLeft: number
  /** 当前跟手位移（CSS px，带符号）。 */
  offset: number
  /** 当前目标周。 */
  step: WeekStep | 0
  /** 速度采样（每次重锚清空，只覆盖同一次阻尼段）。 */
  samples: VelocitySample[]
  aborted: boolean
}

type UseWeekSwipeGestureOptions = {
  /** 课表滚动容器（复用 `useScheduleZoom` 的 `scrollRef`）。 */
  scrollRef: RefObject<HTMLDivElement | null>
  /** 是否启用手势（手机端 + 「左右边缘滑动切换周」开关）。 */
  enabled: boolean
  currentWeek: number
  maxWeek: number
  onWeekChange: (week: number) => void
}

/**
 * 手机端课表：横向滑到最左/最右边缘后继续拖动，用阻尼跟手位移，松手切换上下周。
 *
 * 约定与取舍（细节见任务 `09-29-schedule-edge-swipe-week-switch/design.md`）：
 *
 * - **只观测、不拦截**：监听器全部 `{ passive: true }`，任何路径都**不** `preventDefault`，
 *   因此纵向滚动、课程格点按、双指缩放与双击缩放都不受影响。
 * - **用 touch 而不是 pointer**：触摸横滑时浏览器会给 pointer 序列发 `pointercancel`
 *   （即使该方向根本不能滚动），pointer 拿不到可用位移；被动 `touchmove` 在原生滚动期间照常派发。
 * - **阻尼位移只画在「已经到该方向边缘」之后**：每帧用 `resolveScrollEdges` + `sideAllowsRubber`
 *   判定，未到边缘时**重锚 + 位移归零**，把横向轴让给原生滚动（缩放态下仍可正常拖动课表，
 *   且不会出现「原生滚动与阻尼位移同时发生」的双重位移）。
 * - **位移写在滚动容器自身**（不是网格）：被 transform 的后代会计入滚动溢出区域，写在网格上会
 *   实时污染 `scrollWidth`，让边缘判定自己失效。
 * - 拖动期间**不 setState**：直接写内联 `transform` / `opacity`，只在松手时提交一次周次。
 *
 * @returns 无返回值（与 `useWeekKeyboardNavigation` 同风格）。
 */
export function useWeekSwipeGesture({ scrollRef, enabled, currentWeek, maxWeek, onWeekChange }: UseWeekSwipeGestureOptions): void {
  // 变动频繁的值走 ref，避免手势途中重订阅（重订阅会让进行中的手势丢失状态）。
  const latestRef = useRef({ currentWeek, maxWeek, onWeekChange })

  // 标记「这次周次变化是我们自己的切周动画发起的」，用于区分外部改周（顶栏按钮 / 键盘）。
  const selfSwitchRef = useRef(false)

  // 主 effect 把自己的清理入口挂在这里：任何路径（含外部改周）都只走同一个 `reset()`。
  const resetRef = useRef<() => void>(() => {})
  useEffect(() => {
    latestRef.current = { currentWeek, maxWeek, onWeekChange }
  })

  useEffect(() => {
    const element = scrollRef.current
    if (!element || !enabled) return

    const timers: number[] = []
    const frames: number[] = []
    let gesture: GestureState | null = null

    // 位移/透明度的写入去重：拖动期间每帧都会走到这里，重写同样的值会白触发样式重算。
    let appliedTransform: string | null = null
    let appliedOpacity: string | null = null

    const clearTimers = () => {
      timers.splice(0).forEach((id) => window.clearTimeout(id))
      frames.splice(0).forEach((id) => window.cancelAnimationFrame(id))
    }

    const setSwipeState = (value: SwipeState) => {
      element.dataset.weekSwipeState = value
    }

    /**
     * 唯一的内联样式清理入口：任何结束路径（回弹结束、切周结束、手势被取消、开关关闭、卸载）
     * 都必须走它，避免留下残留位移或半透明。
     */
    const reset = () => {
      clearTimers()
      appliedTransform = null
      appliedOpacity = null
      element.style.transition = ''
      element.style.transform = ''
      element.style.opacity = ''
      setSwipeState('idle')
    }

    resetRef.current = reset

    const writeTransform = (value: string) => {
      if (appliedTransform === value) return
      appliedTransform = value
      element.style.transform = value
    }

    const writeOpacity = (value: string) => {
      if (appliedOpacity === value) return
      appliedOpacity = value
      element.style.opacity = value
    }

    /**
     * 把位移画到滚动容器上。
     *
     * @param offset 目标位移（CSS px，带符号）。
     * @param durationMs 过渡时长；`0` 表示瞬时（跟手阶段与「瞬时换边」都用它）。
     * @param opacity 需要同时改变不透明度时给出目标值。
     */
    const paint = (offset: number, durationMs: number, opacity?: number) => {
      element.style.transition = durationMs > 0 ? `transform ${durationMs}ms ease-out, opacity ${durationMs}ms linear` : 'none'
      writeTransform(`translate3d(${offset}px, 0, 0)`)
      if (opacity !== undefined) writeOpacity(String(opacity))
    }

    const readEdges = (): ScrollEdges =>
      resolveScrollEdges({
        scrollLeft: element.scrollLeft,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      })

    const cancelGesture = () => {
      if (gesture) gesture.aborted = true
      gesture = null
      reset()
    }

    const snapBack = () => {
      clearTimers()
      setSwipeState('switching')
      paint(0, SNAP_BACK_DURATION_MS)
      timers.push(window.setTimeout(reset, SNAP_BACK_DURATION_MS))
    }

    const prefersReducedMotion = () =>
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    /**
     * 切周动画：滑出 → 换内容 + 瞬时换到对侧 → 滑入。
     *
     * 相邻周不预渲染，所以「换内容」这一步只能靠位移 + 淡出来掩盖：滑出沿手指方向（内容继续
     * 往手指那边走），换内容后把位移瞬时放到**对侧**，再滑回 0 —— 这样新内容是从手指来向进来的，
     * 不会出现「反向弹回」。
     */
    const switchWeek = (step: WeekStep, offset: number) => {
      clearTimers()
      setSwipeState('switching')

      // 关闭动效偏好：不做任何过渡，直接换周并复位。
      if (prefersReducedMotion()) {
        selfSwitchRef.current = true
        latestRef.current.onWeekChange(latestRef.current.currentWeek + step)
        reset()
        return
      }

      // 滑出目标：位移已经超过 SWITCH_TRAVEL_PX 时继续往前（不能往回缩，否则会看到一顿）
      const outTarget = Math.sign(switchTravelOffset(step, 'out')) * Math.max(Math.abs(offset), SWITCH_TRAVEL_PX)
      paint(outTarget, SWITCH_OUT_DURATION_MS, SWITCH_MIN_OPACITY)

      timers.push(
        window.setTimeout(() => {
          selfSwitchRef.current = true
          latestRef.current.onWeekChange(latestRef.current.currentWeek + step)
          paint(switchTravelOffset(step, 'in'), 0, SWITCH_MIN_OPACITY)

          // 双帧后再启动滑入：保证浏览器把上面这一笔瞬时位移当成过渡起点。
          frames.push(
            window.requestAnimationFrame(() => {
              frames.push(
                window.requestAnimationFrame(() => {
                  paint(0, SWITCH_IN_DURATION_MS, 1)
                  timers.push(window.setTimeout(reset, SWITCH_IN_DURATION_MS))
                })
              )
            })
          )
        }, SWITCH_OUT_DURATION_MS)
      )
    }

    const handleTouchStart = (event: TouchEvent) => {
      // 第二根手指意味着这是双指手势：让给缩放，且本次不再接管。
      if (event.touches.length !== 1) {
        cancelGesture()
        return
      }

      // 上一次的动画可能还在跑：清掉它以当前位置为新起点（F5）。
      // 代价是「松手后 110ms 内又按下」会把那次还没换完的周**放弃掉**（只回弹、不切周）：
      // 宁可少切一次，也不要在新拖动里插进一次凭空发生的周次变化。
      reset()

      const touch = event.touches[0]
      gesture = {
        startX: touch.clientX,
        startY: touch.clientY,
        axis: 'undecided',
        anchorX: touch.clientX,
        anchorScrollLeft: element.scrollLeft,
        offset: 0,
        step: 0,
        samples: [],
        aborted: false,
      }
    }

    const handleTouchMove = (event: TouchEvent) => {
      const state = gesture
      if (!state) return

      if (event.touches.length !== 1) {
        cancelGesture()
        return
      }

      const touch = event.touches[0]
      const dx = touch.clientX - state.startX
      const dy = touch.clientY - state.startY

      if (state.axis === 'undecided') {
        state.axis = resolveSwipeAxis(dx, dy)
        // 纵向：整段手势都不碰 DOM，把滚动彻底让给原生实现。
        if (state.axis !== 'horizontal') return
        setSwipeState('dragging')
      }

      if (state.axis !== 'horizontal') return

      // 原生滚动发生了（缩放态还没到边缘）→ 重锚，阻尼段从这一刻重新开始。
      if (element.scrollLeft !== state.anchorScrollLeft) {
        state.anchorScrollLeft = element.scrollLeft
        state.anchorX = touch.clientX
        state.samples.length = 0
      }

      const raw = touch.clientX - state.anchorX
      const step = weekStepFor(raw)
      const allowed = step !== 0 && sideAllowsRubber(readEdges(), step)

      if (!allowed) {
        // 还在滚动中、或手指已经反向、或刚好在零位移点：位移归零并重锚。
        state.anchorX = touch.clientX
        state.offset = 0
        state.step = 0
        state.samples.length = 0
        paint(0, 0)
        return
      }

      state.samples = state.samples.filter((sample) => event.timeStamp - sample.t <= VELOCITY_SAMPLE_WINDOW_MS * 2)
      state.samples.push({ x: touch.clientX, t: event.timeStamp })
      state.step = step
      state.offset = dampedOffset(raw)
      paint(state.offset, 0)
    }

    const handleTouchEnd = (event: TouchEvent) => {
      const state = gesture
      gesture = null

      if (!state || state.aborted || state.axis !== 'horizontal') {
        reset()
        return
      }

      const touch = event.changedTouches[0]
      const samples = touch ? [...state.samples, { x: touch.clientX, t: event.timeStamp }] : state.samples
      const velocity = gestureVelocity(samples, event.timeStamp)
      const step = state.step
      const allowSwitch = step !== 0 && canSwitchWeek(step, latestRef.current.currentWeek, latestRef.current.maxWeek)

      if (step !== 0 && shouldSwitchWeek({ offset: state.offset, velocity, step, allowSwitch })) {
        switchWeek(step, state.offset)
        return
      }

      snapBack()
    }

    const handleTouchCancel = () => cancelGesture()

    reset()
    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchmove', handleTouchMove, { passive: true })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })
    element.addEventListener('touchcancel', handleTouchCancel, { passive: true })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
      element.removeEventListener('touchcancel', handleTouchCancel)
      reset()
      delete element.dataset.weekSwipeState
      gesture = null
      resetRef.current = () => {}
    }
  }, [enabled, scrollRef])

  // 周次被外部改动（顶栏按钮 / 方向键）时清掉可能残留的动画与位移；自己发起的那次跳过。
  useEffect(() => {
    if (selfSwitchRef.current) {
      selfSwitchRef.current = false
      return
    }

    resetRef.current()
  }, [currentWeek])
}
