import { useEffect, useRef, useState } from 'react'
import { resolveScrollEdges } from '~/lib/scroll-edges'
import type { ScrollEdges } from '~/lib/scroll-edges'

/**
 * 盯着一个横向滚动容器，回报「哪一侧还有内容」。
 *
 * 判定本身是纯函数（`app/lib/scroll-edges.ts`），这里只负责观测与重算：
 * - `scroll` 事件：用户横滑时更新；
 * - `ResizeObserver`：旋转屏幕、字号变化、导航项被重新排序导致宽度变化时更新。
 *
 * `ResizeObserver` 在 `observe()` 时会**立刻回调一次**，因此首帧状态不需要在 effect 体里
 * 同步 setState（那会被本仓库的 `react-hooks/set-state-in-effect` 拦下）。
 *
 * @returns `ref` 绑到滚动容器上；`edges` 是该侧是否还要提示。
 */
export function useScrollEdges<T extends HTMLElement>(): { ref: React.RefObject<T | null>; edges: ScrollEdges } {
  const ref = useRef<T | null>(null)
  const [edges, setEdges] = useState<ScrollEdges>('none')

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const update = () => {
      setEdges(
        resolveScrollEdges({
          scrollLeft: element.scrollLeft,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        })
      )
    }

    const observer = new ResizeObserver(update)
    observer.observe(element)
    element.addEventListener('scroll', update, { passive: true })

    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', update)
    }
  }, [])

  return { ref, edges }
}
