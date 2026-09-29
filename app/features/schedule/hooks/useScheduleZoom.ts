import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ZOOM_MAX, ZOOM_MIN, ZOOM_TIERS } from '../constants'
import { clampZoom, getDetailLevel, snapZoomTier } from '../utils'
import { TAP_MOVE_TOLERANCE_PX, isTapSizedMove } from '../weekSwipe'

type PointerPosition = {
  x: number
  y: number
  /** 按下点：只用于「这次抬起算不算点按」，不随移动更新。 */
  downX: number
  downY: number
}

type GestureState = {
  /** 进入双指手势时两指的间距，作为缩放比例的分母。 */
  startDistance: number
  /** 进入双指手势时的已提交档位，作为缩放比例的分子基准。 */
  startZoom: number
  /** 手势过程中最新的连续缩放值，松手时用来吸附档位。 */
  currentZoom: number
}

/** 触摸端双击判定的最大间隔。 */
const DOUBLE_TAP_INTERVAL_MS = 320

/**
 * 双击切换的去抖窗口。
 *
 * 同一次双击在真机上会走两条路径：我们自己的两次 `pointerup` 判定，以及浏览器在第二次
 * 抬起后合成的 `dblclick`（Android WebView 实测会派发）。两条都触发就会切换两次、
 * 相互抵消，因此在窗口内只允许切换一次。
 */
const DOUBLE_TAP_TOGGLE_DEBOUNCE_MS = 400

function distanceBetween(first: PointerPosition, second: PointerPosition) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

/**
 * 手机端课表的双指缩放。
 *
 * 缩放只改变网格宽度（列变宽、字号不变），因此放大后同样的文字换行更少、
 * 课程块能显示更多字段。手势期间直接修改 `--schedule-zoom` CSS 变量并按捏合
 * 中心补偿横向滚动，不触发 React 重渲染；松手时才把连续值吸附到
 * `ZOOM_TIERS` 之一提交给 React，顺带切换信息分级。
 *
 * @returns 已提交档位、信息分级、两个 DOM 引用、需要挂到滚动容器上的事件处理器，
 * 以及给 −/+ 按钮与双击使用的档位操作。
 */
export function useScheduleZoom() {
  const [zoom, setZoom] = useState<number>(ZOOM_MIN)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const pointersRef = useRef(new Map<number, PointerPosition>())
  const gestureRef = useRef<GestureState | null>(null)
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null)

  const lastToggleRef = useRef(0)

  const toggleZoom = () => {
    const now = Date.now()
    if (now - lastToggleRef.current < DOUBLE_TAP_TOGGLE_DEBOUNCE_MS) return

    lastToggleRef.current = now
    setZoom((current) => (current === ZOOM_MIN ? ZOOM_MAX : ZOOM_MIN))
  }

  const setLiveZoom = (next: number, centerClientX?: number) => {
    const grid = gridRef.current
    const scroll = scrollRef.current
    if (!grid) return

    const previous = gestureRef.current?.currentZoom ?? next
    grid.style.setProperty('--schedule-zoom', String(next))

    if (!scroll || centerClientX === undefined || previous <= 0) return

    // 写 scrollLeft 会强制一次布局，保证下面的换算基于刚更新的网格宽度。
    const ratio = next / previous
    const centerX = centerClientX - scroll.getBoundingClientRect().left
    scroll.scrollLeft = (scroll.scrollLeft + centerX) * ratio - centerX
  }

  const finishGesture = () => {
    const gesture = gestureRef.current
    if (!gesture) return

    gestureRef.current = null
    const committed = snapZoomTier(gesture.currentZoom)
    // 手势期间 CSS 变量是连续值，这里先复位到吸附后的档位；
    // 若档位与 state 相同，React 不会重新渲染，必须由这一行负责复位。
    setLiveZoom(committed, undefined)

    if (committed !== zoom) setZoom(committed)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // 同时记下按下点：抬起时要靠它判断「这次抬起算不算点按」（`downX`/`downY` 不随移动更新）。
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      downX: event.clientX,
      downY: event.clientY,
    })

    if (pointersRef.current.size !== 2) return

    const [first, second] = [...pointersRef.current.values()]
    gestureRef.current = {
      startDistance: Math.max(distanceBetween(first, second), 1),
      startZoom: zoom,
      currentZoom: zoom,
    }

    // 双指期间把两个 pointer 都捕获到容器上，避免手指移出课表区域时丢事件。
    // 合成的 pointer 事件（自动化断言）没有真实指针，捕获会抛异常，不影响手势本身。
    pointersRef.current.forEach((_, pointerId) => {
      try {
        event.currentTarget.setPointerCapture(pointerId)
      } catch {
        // 忽略无法捕获的 pointer：真实触摸不会走到这里
      }
    })
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointersRef.current.get(event.pointerId)
    const gesture = gestureRef.current
    if (!pointer || !gesture) return

    pointer.x = event.clientX
    pointer.y = event.clientY

    if (pointersRef.current.size < 2) return

    // WebView 默认会在双指拖动时同时平移，这里显式取消原生行为。
    if (event.pointerType === 'touch') event.preventDefault()

    const [first, second] = [...pointersRef.current.values()]
    const next = clampZoom((gesture.startZoom * distanceBetween(first, second)) / gesture.startDistance)
    gesture.currentZoom = next
    setLiveZoom(next, (first.x + second.x) / 2)
  }

  /**
   * 结束一个指针。
   *
   * `allowTap` 只在真正的 `pointerup` 上为真：触摸横向拖动时浏览器会发 `pointercancel`
   * （即使该方向根本不能滚动也会发），它的坐标离按下点只有几 px —— 若参与双击判定，
   * 连续两次横滑就会被误判成双击、缩放档位被来回切换。
   */
  const endPointer = (event: ReactPointerEvent<HTMLDivElement>, allowTap: boolean) => {
    const pointer = pointersRef.current.get(event.pointerId)
    pointersRef.current.delete(event.pointerId)

    if (gestureRef.current) {
      if (pointersRef.current.size < 2) finishGesture()
      return
    }

    // 双指手势之外的单指抬起：可能是触摸端的双击（WebView 不一定派发 dblclick）。
    if (!allowTap || !pointer || event.pointerType !== 'touch') return

    // 已经拖出去几十 px 的手势不是点按：按下点到抬起点的位移必须还在容差内。
    if (!isTapSizedMove(pointer.downX, pointer.downY, event.clientX, event.clientY)) {
      lastTapRef.current = null
      return
    }

    const now = Date.now()
    const lastTap = lastTapRef.current
    lastTapRef.current = { time: now, x: event.clientX, y: event.clientY }

    const isDoubleTap =
      lastTap !== null &&
      now - lastTap.time < DOUBLE_TAP_INTERVAL_MS &&
      Math.abs(event.clientX - lastTap.x) < TAP_MOVE_TOLERANCE_PX &&
      Math.abs(event.clientY - lastTap.y) < TAP_MOVE_TOLERANCE_PX

    if (!isDoubleTap) return

    lastTapRef.current = null
    toggleZoom()
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => endPointer(event, true)

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => endPointer(event, false)

  const zoomIn = () => setZoom((current) => ZOOM_TIERS.find((tier) => tier > current) ?? ZOOM_MAX)

  const zoomOut = () =>
    setZoom((current) => {
      const smallerTiers = ZOOM_TIERS.filter((tier) => tier < current)
      return smallerTiers.length > 0 ? smallerTiers[smallerTiers.length - 1] : ZOOM_MIN
    })

  return {
    zoom,
    detailLevel: getDetailLevel(zoom),
    scrollRef,
    gridRef,
    containerProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      // cancel 只做记账（见 `endPointer` 的注释）：它不能参与双击判定。
      onPointerCancel: handlePointerCancel,
      onDoubleClick: toggleZoom,
    },
    zoomIn,
    zoomOut,
    canZoomIn: zoom < ZOOM_MAX,
    canZoomOut: zoom > ZOOM_MIN,
  }
}
