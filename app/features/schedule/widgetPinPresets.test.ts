import { describe, expect, it } from 'vitest'
import {
  WIDGET_PIN_MANUAL_STEPS,
  WIDGET_PIN_NARROW_CELL_HINT,
  WIDGET_PIN_PRESETS,
  pinOutcomeMessage,
  resolvePinModalState,
  resolvePinProbeOutcome,
  resolvePinPollOutcome,
  resolvePinStartOutcome,
} from './widgetPinPresets'

/**
 * 预设目录的**跨层契约**：这张表里的标识就是原生 `WidgetPreset.java` 的白名单。
 *
 * 原生侧只认这几个字符串，拼错不会报错、只会静默回退成「未选预设」（用户看到的是「点了没生效」）。
 * 因此这里把同一份字面量再写一遍并比对 —— 两边改动时，这个测试会立刻失败。
 */
const NATIVE_WHITELIST = ['cell_2x2', 'cell_2x3', 'cell_4x2', 'cell_4x3', 'cell_6x3'] as const

describe('小工具预设目录', () => {
  it('标识与原生白名单逐字一致、且不重复', () => {
    const ids = WIDGET_PIN_PRESETS.map((preset) => preset.id)

    expect(ids).toEqual([...NATIVE_WHITELIST])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('每个预设都有可展示的完整信息', () => {
    for (const preset of WIDGET_PIN_PRESETS) {
      expect(preset.name.length, preset.id).toBeGreaterThan(0)
      expect(preset.cell, preset.id).toMatch(/^\d+×\d+$/)
      expect(preset.description.length, preset.id).toBeGreaterThan(8)
      expect(preset.hint.length, preset.id).toBeGreaterThan(4)
    }
  })

  it('只有宽格才生效的预设被如实标记，且带一句退化成单栏的说明', () => {
    const wideOnly = WIDGET_PIN_PRESETS.filter((preset) => preset.needsWideCell).map((preset) => preset.id)

    expect(wideOnly).toEqual(['cell_4x3', 'cell_6x3'])
    expect(WIDGET_PIN_NARROW_CELL_HINT).toContain('单栏')
  })

  it('常驻的手动步骤写清了完整路径，且不承诺尺寸由我们决定', () => {
    // 我们不承诺「一定按目标格子放好」：最终尺寸由 launcher 决定，文案必须留出这一步。
    expect(WIDGET_PIN_MANUAL_STEPS).toContain('长按桌面空白处')
    expect(WIDGET_PIN_MANUAL_STEPS).toContain('调整大小')
  })
})

/**
 * pin 三态的判决逻辑。
 *
 * 这是本任务的核心修复：真机上 `requested=true` 被当成了成功，面板显示「✓ 已添加」而桌面什么都没有。
 * 定时器不好测，但「什么返回值/回调对应什么状态」是纯映射，必须在这里钉死。
 */
describe('添加到桌面的三态判决', () => {
  it('不支持 → unsupported（走手动说明）', () => {
    expect(resolvePinStartOutcome({ supported: false, requested: false })).toBe('unsupported')
    // 即使 launcher 误报 requested，也以 supported 为准：我们根本没有发起过。
    expect(resolvePinStartOutcome({ supported: false, requested: true })).toBe('unsupported')
  })

  it('受理了但没发起 → cancelled（用户在系统弹窗上取消）', () => {
    expect(resolvePinStartOutcome({ supported: true, requested: false })).toBe('cancelled')
  })

  it('受理了 → requesting：**不是**成功，只是开始等确认', () => {
    expect(resolvePinStartOutcome({ supported: true, requested: true })).toBe('requesting')
  })

  it('只有确认回调才算 added，等不到就是 unconfirmed', () => {
    expect(resolvePinPollOutcome({ confirmed: true, appWidgetId: 42 })).toBe('added')
    expect(resolvePinPollOutcome({ confirmed: false, appWidgetId: null })).toBe('unconfirmed')
  })

  it('requesting 的文案是中性的，绝不含「已添加」', () => {
    const message = pinOutcomeMessage('requesting')

    expect(message).toBeTruthy()
    expect(message).not.toContain('已添加')
  })

  it('unconfirmed 的文案如实告知并指向手动步骤，且不诱导重试', () => {
    const message = pinOutcomeMessage('unconfirmed') ?? ''

    expect(message).toContain('没有完成添加')
    expect(message).toContain('厂商桌面')
    expect(message).toContain('手动步骤')
  })

  it('unsupported 时给出手动说明，idle/added 不打扰用户', () => {
    expect(pinOutcomeMessage('unsupported')).toContain('手动')
    expect(pinOutcomeMessage('cancelled')).toBeTruthy()
    expect(pinOutcomeMessage('idle')).toBeNull()
    expect(pinOutcomeMessage('added')).toBeNull()
  })
})

/**
 * 模态框状态机与快探针映射。
 *
 * 产品口径（2026-09-21）：点击后**立刻**出现「正在尝试添加」，失败**一判定出来就立刻**切成失败态 ——
 * 所以这里要钉住三件事：进行中永远可见、失败态可见且可关、成功态只在确认回调之后出现。
 */
describe('添加到桌面的模态框状态机', () => {
  it('请求进行中永远显示：点完不能没反应', () => {
    expect(resolvePinModalState('requesting', false)).toBe('requesting')
    // 即使用户刚关过失败态，下一次请求仍然要弹出来。
    expect(resolvePinModalState('requesting', true)).toBe('requesting')
  })

  it('失败态（含探针命中的 no_confirmation）显示为醒目标态框', () => {
    expect(resolvePinModalState('no_confirmation', false)).toBe('failed')
    expect(resolvePinModalState('cancelled', false)).toBe('failed')
    expect(resolvePinModalState('unsupported', false)).toBe('failed')
    expect(resolvePinModalState('unconfirmed', false)).toBe('failed')
  })

  it('用户关掉之后不再重复打扰同一次失败', () => {
    expect(resolvePinModalState('no_confirmation', true)).toBe('hidden')
    expect(resolvePinModalState('unconfirmed', true)).toBe('hidden')
  })

  it('只有确认回调才显示成功，且成功态可自动收起', () => {
    expect(resolvePinModalState('added', false)).toBe('added')
    expect(resolvePinModalState('added', true)).toBe('hidden')
    expect(resolvePinModalState('idle', false)).toBe('hidden')
  })

  it('探针只在「有尝试 + 命中」时才催用户，且它不是终态', () => {
    expect(resolvePinProbeOutcome({ requested: true, requestedAtMs: 1, shouldFailFast: true })).toBe('no_confirmation')
    expect(resolvePinProbeOutcome({ requested: true, requestedAtMs: 1, shouldFailFast: false })).toBe('waiting')
    // 没有进行中的尝试（例如面板刚打开）绝不能催。
    expect(resolvePinProbeOutcome({ requested: false, requestedAtMs: 0, shouldFailFast: false })).toBe('waiting')
  })

  it('no_confirmation 文案说明这是推断，并给出「先点完确认界面」的出路', () => {
    const message = pinOutcomeMessage('no_confirmation') ?? ''

    expect(message).toContain('没有弹出确认界面')
    expect(message).toContain('如果你在桌面上看到了确认界面')
    expect(message).not.toContain('已添加')
  })

  it('手动步骤按尺寸指名，且与预设表的格子一致', () => {
    for (const preset of WIDGET_PIN_PRESETS) {
      expect(WIDGET_PIN_MANUAL_STEPS, preset.id).toContain(preset.cell)
    }
  })
})
