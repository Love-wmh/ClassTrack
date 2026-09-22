import { readFileSync } from 'node:fs'
// 用 fileURLToPath 而不是 URL.pathname：仓库路径含中文，pathname 会带百分号编码。
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WIDGET_PIN_PRESETS, WIDGET_PIN_SIZE_TUNING_HINT } from '~/features/schedule/widgetPinPresets'
import {
  hasSeenWidgetGuide,
  markWidgetGuideSeen,
  shouldShowWidgetGuide,
  WIDGET_GUIDE_DESCRIPTION,
  WIDGET_GUIDE_PRIMARY_ACTION,
  WIDGET_GUIDE_SECONDARY_ACTION,
  WIDGET_GUIDE_STORAGE_KEY,
  WIDGET_GUIDE_TITLE,
  widgetGuideSteps,
  type GuideStorage,
} from './widget-guide'

/** 假存储：既方便断言键值，也能造出「读得到 / 读不到」两种现场。 */
function createFakeStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial))

  return {
    entries,
    storage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value)
      },
    } satisfies GuideStorage,
  }
}

/** 隐私模式现场：读写都抛。 */
const throwingStorage: GuideStorage = {
  getItem: () => {
    throw new Error('storage is disabled')
  },
  setItem: () => {
    throw new Error('storage is disabled')
  },
}

describe('引导已读标记', () => {
  it('没标记就是没读过，记过之后才为真', () => {
    const { storage } = createFakeStorage()

    expect(hasSeenWidgetGuide(storage)).toBe(false)
    markWidgetGuideSeen(storage)
    expect(hasSeenWidgetGuide(storage)).toBe(true)
  })

  it('只写自己的那个键（不污染别人的状态）', () => {
    const { entries, storage } = createFakeStorage({ 'class-track-storage': '{"school":null}' })

    markWidgetGuideSeen(storage)

    expect([...entries.keys()].sort()).toEqual(['class-track-storage', WIDGET_GUIDE_STORAGE_KEY].sort())
    expect(entries.get(WIDGET_GUIDE_STORAGE_KEY)).toBe('1')
  })

  it('标记值不是约定值时算没读过（脏数据不吞掉引导）', () => {
    const { storage } = createFakeStorage({ [WIDGET_GUIDE_STORAGE_KEY]: 'yes' })

    expect(hasSeenWidgetGuide(storage)).toBe(false)
  })

  it('没有存储（null）时：读为假、写不抛', () => {
    expect(hasSeenWidgetGuide(null)).toBe(false)
    expect(() => markWidgetGuideSeen(null)).not.toThrow()
  })

  it('存储抛异常时：读为假、写不抛（隐私模式不该打断导入后的流程）', () => {
    expect(hasSeenWidgetGuide(throwingStorage)).toBe(false)
    expect(() => markWidgetGuideSeen(throwingStorage)).not.toThrow()
  })
})

describe('引导触发判定', () => {
  it('只有「有小工具 + 没读过」才该弹', () => {
    expect(shouldShowWidgetGuide({ nativeWidgetAvailable: true, seen: false })).toBe(true)
    expect(shouldShowWidgetGuide({ nativeWidgetAvailable: true, seen: true })).toBe(false)
    expect(shouldShowWidgetGuide({ nativeWidgetAvailable: false, seen: false })).toBe(false)
    expect(shouldShowWidgetGuide({ nativeWidgetAvailable: false, seen: true })).toBe(false)
  })
})

describe('引导文案', () => {
  it('标题、说明与两个按钮文案都非空', () => {
    for (const copy of [WIDGET_GUIDE_TITLE, WIDGET_GUIDE_DESCRIPTION, WIDGET_GUIDE_PRIMARY_ACTION, WIDGET_GUIDE_SECONDARY_ACTION]) {
      expect(copy.length).toBeGreaterThan(1)
    }
  })

  it('每一步都不为空，且至少两步', () => {
    const steps = widgetGuideSteps()

    expect(steps.length).toBeGreaterThanOrEqual(2)
    for (const step of steps) {
      expect(step.trim().length).toBeGreaterThan(4)
    }
  })

  it('档位名从预设表派生（面板改名字这里跟着改，不会漂移）', () => {
    const [firstStep] = widgetGuideSteps()

    for (const preset of WIDGET_PIN_PRESETS) {
      expect(firstStep).toContain(preset.name)
      expect(firstStep).toContain(preset.cell)
    }
  })

  it('尺寸提示用的就是面板那一份常量（单一来源）', () => {
    expect(widgetGuideSteps()).toContain(WIDGET_PIN_SIZE_TUNING_HINT)
  })

  it('补一句「一键添加不生效也能手动加」（诚实口径，不能承诺一定成功）', () => {
    expect(widgetGuideSteps().join('\n')).toContain('手动步骤')
  })
})

/**
 * 触发点的**结构守卫**。
 *
 * 「三条导入路径都调用它」这件事漏掉一条照样能编译通过，而设备实测在本机不可用
 * （模拟器需要 KVM、浏览器端 CDP 又够不到沙箱内的 dev server），
 * 所以用一个读真实源码的断言把它钉住 —— 与 `widgetPinPresets.test.ts` 读 Java/xml 的做法同源。
 */
describe('引导的接线（源文件级守卫）', () => {
  const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

  it('三条导入成功路径都触发引导（备份 / 应用内 / 解析器）', () => {
    const source = readFileSync(join(REPO_ROOT, 'app/components/import-flow/useImportFlow.ts'), 'utf8')

    // 三处调用 = 三条成功路径；只在定义处出现（0 次）说明忘了接线。
    expect(source.match(/maybeShowWidgetGuide\(\)/g)?.length).toBe(3)
    expect(source).toContain("from '~/lib/widget-guide'")
  })

  it('引导挂在全局 Layout 上（不能挂在会被卸载的 ImportDialog 里）', () => {
    const source = readFileSync(join(REPO_ROOT, 'app/root.tsx'), 'utf8')

    expect(source).toContain('<WidgetGuideDialog />')
    expect(source).toMatch(/!nativeShell && <WidgetGuideDialog \/>/)
  })
})
