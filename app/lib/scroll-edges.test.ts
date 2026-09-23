import { describe, expect, it } from 'vitest'
import { resolveScrollEdges } from './scroll-edges'

/** 底栏的量级：一屏 411px，6 项共 616.5px（每项 w-1/4）。 */
const CLIENT = 411
const SCROLL = 616.5
const MAX = SCROLL - CLIENT // 205.5

describe('横向滚动提示的判定', () => {
  it('内容没溢出时两侧都不提示', () => {
    expect(resolveScrollEdges({ scrollLeft: 0, scrollWidth: 411, clientWidth: 411 })).toBe('none')
    expect(resolveScrollEdges({ scrollLeft: 0.5, scrollWidth: 412, clientWidth: 411 })).toBe('none')
  })

  it('还在起点：只有末端提示', () => {
    expect(resolveScrollEdges({ scrollLeft: 0, scrollWidth: SCROLL, clientWidth: CLIENT })).toBe('end')
  })

  it('滚到末端：只有起点提示（避免「右边还有」的误导）', () => {
    expect(resolveScrollEdges({ scrollLeft: MAX, scrollWidth: SCROLL, clientWidth: CLIENT })).toBe('start')
  })

  it('滚动中间：两侧都提示', () => {
    expect(resolveScrollEdges({ scrollLeft: MAX / 2, scrollWidth: SCROLL, clientWidth: CLIENT })).toBe('both')
  })

  it('容差 1px：末端差 1px 也算到了（WebView 上 scrollLeft 会差一点）', () => {
    expect(resolveScrollEdges({ scrollLeft: MAX - 1, scrollWidth: SCROLL, clientWidth: CLIENT })).toBe('start')
    expect(resolveScrollEdges({ scrollLeft: 1, scrollWidth: SCROLL, clientWidth: CLIENT })).toBe('end')
  })

  it('差得多就不算到边界', () => {
    expect(resolveScrollEdges({ scrollLeft: MAX - 4, scrollWidth: SCROLL, clientWidth: CLIENT })).toBe('both')
    expect(resolveScrollEdges({ scrollLeft: 4, scrollWidth: SCROLL, clientWidth: CLIENT })).toBe('both')
  })

  it('溢出量不足容差时按「没溢出」处理（例如只多出 1px 的舍入误差）', () => {
    expect(resolveScrollEdges({ scrollLeft: 0, scrollWidth: 412, clientWidth: 411 })).toBe('none')
  })
})
