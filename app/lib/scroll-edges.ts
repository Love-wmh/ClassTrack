/**
 * 「这一侧的滚动内容还没到底」的判定。
 *
 * 用途：给横向滚动区（当前只有移动端底部导航）在**还有内容的那一侧**画出提示阴影。
 * 判定只依赖三个几何量，因此可以在没有真实滚动容器的环境里单测 —— 浏览器里量不准的那些
 * 边界情形（小数、差 1px、内容不足一屏）都在这里钉死，组件只负责把结果画出来。
 *
 * 为什么不用 shadcn 的 `scroll-fade`（`mask-image` + `animation-timeline`）：
 * 它淡的是**内容本身**，而底栏每一项的内容是居中的、边缘 40px 大半是留白 —— 2026-09-23 实测
 * 只改动了 9px 宽、平均差异 0.07% 的像素，等于没有提示。阴影画在背景/内容之上才与内容位置无关。
 */

export type ScrollEdges = 'none' | 'start' | 'end' | 'both'

/**
 * 判定容差（CSS px）。
 *
 * WebView 上 `scrollLeft` 可能是小数，且布局舍入会差 1px 左右；不留容差会让「已经滚到末端」
 * 被判成「还能往右滚」，于是阴影在最末端仍然亮着 —— 那正是我们要避免的误导。
 */
const EPSILON = 1

export type ResolveScrollEdgesArgs = {
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
}

/**
 * 哪一侧还能继续滚。
 *
 * @param args 滚动容器的三个几何量（`Element` 上的同名属性，都是 CSS px）。
 * @returns `none` 内容没溢出（或挤在一屏内）；`start` 只能往回滚（已在末端）；
 *          `end` 只能往前滚（还在起点）；`both` 两头都有内容。
 */
export function resolveScrollEdges({ scrollLeft, scrollWidth, clientWidth }: ResolveScrollEdgesArgs): ScrollEdges {
  const max = scrollWidth - clientWidth
  if (max <= EPSILON) return 'none'

  const atStart = scrollLeft <= EPSILON
  const atEnd = scrollLeft >= max - EPSILON

  if (atStart) return atEnd ? 'none' : 'end'
  if (atEnd) return 'start'

  return 'both'
}
