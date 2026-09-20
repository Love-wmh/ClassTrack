import { describe, expect, it } from 'vitest'
import { WIDGET_PIN_MANUAL_HINT, WIDGET_PIN_PRESETS } from './widgetPinPresets'

/**
 * 预设目录的**跨层契约**：这张表里的标识就是原生 `WidgetPreset.java` 的白名单。
 *
 * 原生侧只认这几个字符串，拼错不会报错、只会静默回退成「未选预设」（用户看到的是「点了没生效」）。
 * 因此这里把同一份字面量再写一遍并比对 —— 两边改动时，这个测试会立刻失败。
 */
const NATIVE_WHITELIST = ['phone_minimal', 'phone_standard', 'phone_wide', 'tablet_dual', 'tablet_wide'] as const

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

  it('手动添加说明如实告诉用户怎么放、以及尺寸要自己调', () => {
    // 我们不承诺「一定按目标格子放好」：最终尺寸由 launcher 决定，文案必须留出这一步。
    expect(WIDGET_PIN_MANUAL_HINT).toContain('长按桌面空白处')
    expect(WIDGET_PIN_MANUAL_HINT).toContain('调整大小')
  })
})
