import { describe, expect, it } from 'vitest'
import type { ScrollEdges } from '~/lib/scroll-edges'
import {
  RUBBER_MAX_PX,
  SWITCH_DISTANCE_PX,
  SWITCH_TRAVEL_PX,
  SWITCH_VELOCITY_PX_PER_MS,
  TAP_MOVE_TOLERANCE_PX,
  canSwitchWeek,
  dampedOffset,
  gestureVelocity,
  isTapSizedMove,
  resolveSwipeAxis,
  shouldSwitchWeek,
  sideAllowsRubber,
  switchTravelOffset,
  weekStepFor,
} from './weekSwipe'

describe('阻尼曲线 dampedOffset', () => {
  it('符号跟随输入，零位移就是零位移', () => {
    expect(dampedOffset(0)).toBe(0)
    expect(dampedOffset(40)).toBeGreaterThan(0)
    expect(dampedOffset(-40)).toBeLessThan(0)
    expect(dampedOffset(-40)).toBe(-dampedOffset(40))
  })

  it('单调不减：手指拖得越多，跟手位移只多不少（AC-10）', () => {
    let previous = -1

    for (let raw = 0; raw <= 600; raw += 1) {
      const offset = dampedOffset(raw)
      expect(offset).toBeGreaterThanOrEqual(previous)
      previous = offset
    }

    // 至少不能是「大范围压平」：0→96px 区间必须真的在增长
    expect(dampedOffset(120)).toBeGreaterThan(dampedOffset(60))
    expect(dampedOffset(600)).toBeGreaterThan(dampedOffset(120))
  })

  it('有上界：拖再远也不超过 RUBBER_MAX_PX（AC-10）', () => {
    for (const raw of [RUBBER_MAX_PX, 1_000, 10_000, 100_000]) {
      expect(dampedOffset(raw)).toBeLessThanOrEqual(RUBBER_MAX_PX)
      expect(dampedOffset(-raw)).toBeGreaterThanOrEqual(-RUBBER_MAX_PX)
    }
  })

  it('达到切周阈值所需的位移与 design.md 记的 82px 一致（改常量必须同步改文档）', () => {
    let raw = 0
    while (dampedOffset(raw) < SWITCH_DISTANCE_PX) raw += 1

    expect(raw).toBe(82)
  })

  it('小幅拖动几乎 1:1（不会一上手就发黏）', () => {
    expect(dampedOffset(10)).toBeCloseTo(9.06, 1)
    // 前 10px 的通过率必须高于 85%
    expect(dampedOffset(10) / 10).toBeGreaterThan(0.85)
  })
})

describe('主动轴判定 resolveSwipeAxis', () => {
  it('阈值内不判定', () => {
    expect(resolveSwipeAxis(0, 0)).toBe('undecided')
    expect(resolveSwipeAxis(11, -11)).toBe('undecided')
    expect(resolveSwipeAxis(-11, 5)).toBe('undecided')
  })

  it('越过阈值后取占优轴', () => {
    expect(resolveSwipeAxis(30, 5)).toBe('horizontal')
    expect(resolveSwipeAxis(-30, 5)).toBe('horizontal')
    expect(resolveSwipeAxis(5, 30)).toBe('vertical')
    expect(resolveSwipeAxis(-5, -30)).toBe('vertical')
  })

  it('平手时算横向（纵向留给原生滚动）', () => {
    expect(resolveSwipeAxis(20, 20)).toBe('horizontal')
    expect(resolveSwipeAxis(12, 12)).toBe('horizontal')
  })
})

describe('边缘与方向的映射 sideAllowsRubber', () => {
  it('没有横向溢出（1x 手机端）时两侧都允许', () => {
    expect(sideAllowsRubber('none', -1)).toBe(true)
    expect(sideAllowsRubber('none', 1)).toBe(true)
  })

  it('两头都还有内容时都不允许（交给原生滚动）', () => {
    expect(sideAllowsRubber('both', -1)).toBe(false)
    expect(sideAllowsRubber('both', 1)).toBe(false)
  })

  it("还在起点（edges='end'）只允许上一周", () => {
    expect(sideAllowsRubber('end', -1)).toBe(true)
    expect(sideAllowsRubber('end', 1)).toBe(false)
  })

  it("已在末端（edges='start'）只允许下一周", () => {
    expect(sideAllowsRubber('start', 1)).toBe(true)
    expect(sideAllowsRubber('start', -1)).toBe(false)
  })

  it('四种取值全部被覆盖（新增取值会在这里失败）', () => {
    const all: ScrollEdges[] = ['none', 'start', 'end', 'both']

    for (const edges of all) {
      expect(typeof sideAllowsRubber(edges, -1)).toBe('boolean')
      expect(typeof sideAllowsRubber(edges, 1)).toBe('boolean')
    }
  })
})

describe('目标周方向 weekStepFor', () => {
  it('右滑看上一周、左滑看下一周', () => {
    expect(weekStepFor(1)).toBe(-1)
    expect(weekStepFor(200)).toBe(-1)
    expect(weekStepFor(-1)).toBe(1)
    expect(weekStepFor(-200)).toBe(1)
    expect(weekStepFor(0)).toBe(0)
  })
})

describe('边界 canSwitchWeek', () => {
  it('第 1 周不能往前，最后一周不能往后', () => {
    expect(canSwitchWeek(-1, 1, 20)).toBe(false)
    expect(canSwitchWeek(1, 1, 20)).toBe(true)
    expect(canSwitchWeek(1, 20, 20)).toBe(false)
    expect(canSwitchWeek(-1, 20, 20)).toBe(true)
  })

  it('中间周两个方向都能切', () => {
    expect(canSwitchWeek(-1, 5, 20)).toBe(true)
    expect(canSwitchWeek(1, 5, 20)).toBe(true)
  })

  it('step 为 0 时一律不能切', () => {
    expect(canSwitchWeek(0, 5, 20)).toBe(false)
  })
})

describe('松手判据 shouldSwitchWeek', () => {
  it('位移达到阈值就切周', () => {
    expect(shouldSwitchWeek({ offset: SWITCH_DISTANCE_PX, velocity: 0, step: 1, allowSwitch: true })).toBe(true)
    expect(shouldSwitchWeek({ offset: -SWITCH_DISTANCE_PX, velocity: 0, step: -1, allowSwitch: true })).toBe(true)
  })

  it('位移不足但朝目标周方向快甩也切周', () => {
    // 手指左滑（step=+1）→ velocity 为负
    expect(shouldSwitchWeek({ offset: -20, velocity: -0.8, step: 1, allowSwitch: true })).toBe(true)
    // 手指右滑（step=-1）→ velocity 为正
    expect(shouldSwitchWeek({ offset: 20, velocity: 0.8, step: -1, allowSwitch: true })).toBe(true)
  })

  it('反向甩动不算快甩（位移不足时按「不切」处理）', () => {
    expect(shouldSwitchWeek({ offset: -20, velocity: 0.8, step: 1, allowSwitch: true })).toBe(false)
    expect(shouldSwitchWeek({ offset: 20, velocity: -0.8, step: -1, allowSwitch: true })).toBe(false)
  })

  it('位移已过阈值时反向甩动仍然切（按松手位置判定）', () => {
    expect(shouldSwitchWeek({ offset: -50, velocity: 0.9, step: 1, allowSwitch: true })).toBe(true)
  })

  it('开关关闭或边界不可切时一律不切，哪怕位移与速度都很大', () => {
    expect(shouldSwitchWeek({ offset: -90, velocity: -3, step: 1, allowSwitch: false })).toBe(false)
    expect(shouldSwitchWeek({ offset: -90, velocity: -3, step: 0, allowSwitch: true })).toBe(false)
  })

  it('速度恰好等于阈值时算切周（阈值是闭区间）', () => {
    expect(shouldSwitchWeek({ offset: 0, velocity: -SWITCH_VELOCITY_PX_PER_MS, step: 1, allowSwitch: true })).toBe(true)
  })
})

describe('切周动画的位移方向 switchTravelOffset', () => {
  it('滑出沿手指方向、滑入在对侧（AC-9 的方向自检）', () => {
    // step=+1 是「下一周」= 手指左滑：旧内容继续向左滑出，新内容从右侧进入
    expect(switchTravelOffset(1, 'out')).toBe(-SWITCH_TRAVEL_PX)
    expect(switchTravelOffset(1, 'in')).toBe(SWITCH_TRAVEL_PX)
    // step=-1 是「上一周」= 手指右滑：镜像
    expect(switchTravelOffset(-1, 'out')).toBe(SWITCH_TRAVEL_PX)
    expect(switchTravelOffset(-1, 'in')).toBe(-SWITCH_TRAVEL_PX)
  })

  it('滑出与滑入的位移恒反向（出现同向就是「反向弹回」观感）', () => {
    for (const step of [-1, 1] as const) {
      expect(Math.sign(switchTravelOffset(step, 'out'))).toBe(-Math.sign(switchTravelOffset(step, 'in')))
    }
  })
})

describe('速度采样 gestureVelocity', () => {
  it('只统计最近窗口内的样本', () => {
    const samples = [
      { x: 0, t: 0 },
      { x: 100, t: 100 }, // 窗口外（now - t = 200 > 120）
      { x: 100, t: 200 },
      { x: 160, t: 300 }, // 窗口内：100→160 / 100ms
    ]

    expect(gestureVelocity(samples, 300)).toBeCloseTo(0.6, 6)
  })

  it('窗口内样本不足两个时返回 0', () => {
    expect(gestureVelocity([], 100)).toBe(0)
    expect(gestureVelocity([{ x: 10, t: 90 }], 100)).toBe(0)
    expect(gestureVelocity([{ x: 10, t: 0 }], 500)).toBe(0)
  })

  it('时间差为 0 时返回 0（不产生 Infinity）', () => {
    expect(
      gestureVelocity(
        [
          { x: 0, t: 100 },
          { x: 50, t: 100 },
        ],
        100
      )
    ).toBe(0)
  })

  it('方向带符号', () => {
    expect(
      gestureVelocity(
        [
          { x: 100, t: 0 },
          { x: 40, t: 100 },
        ],
        100
      )
    ).toBeCloseTo(-0.6, 6)
  })
})

describe('点按位移容差 isTapSizedMove', () => {
  it('容差内算点按', () => {
    expect(isTapSizedMove(100, 100, 100, 100)).toBe(true)
    expect(isTapSizedMove(100, 100, 100 + TAP_MOVE_TOLERANCE_PX, 100)).toBe(true)
    expect(isTapSizedMove(100, 100, 100, 100 - TAP_MOVE_TOLERANCE_PX)).toBe(true)
  })

  it('任一轴超出容差就不算点按（横滑不能被当成 tap）', () => {
    expect(isTapSizedMove(100, 100, 100 + TAP_MOVE_TOLERANCE_PX + 1, 100)).toBe(false)
    expect(isTapSizedMove(100, 100, 100, 100 + TAP_MOVE_TOLERANCE_PX + 1)).toBe(false)
    expect(isTapSizedMove(0, 0, 80, 3)).toBe(false)
  })

  it('容差口径与 useScheduleZoom 的双击判定沿用同一个常量', () => {
    expect(TAP_MOVE_TOLERANCE_PX).toBe(24)
  })
})
