import { readFileSync } from 'node:fs'
// 用 fileURLToPath 而不是 URL.pathname：仓库路径含中文，pathname 会带百分号编码。
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
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

/**
 * 跨层断言用的路径（相对仓库根）：直接读**真实的** Android 资源与清单。
 *
 * 为什么读文件而不是再抄一遍字面量：预设名、格子数、provider 标签现在同时存在于
 * Web 预设表、`res/xml/widget_info_*.xml`、`res/values/strings.xml` 与 `WidgetProviderRegistry.java`。
 * 抄一遍只能证明"我抄对了"，读文件才能证明"两边真的一样"。
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const WIDGET_CELLS = ['2x2', '2x3', '4x2', '4x3', '6x3'] as const

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
/**
 * 五档 provider 与 Web 侧预设的跨层一致性。
 *
 * 出错时的表现很隐蔽（某个尺寸放下去是错的样式 / 拾取器里显示错尺寸），因此把四处对齐：
 * 预设表 → `WidgetProviderRegistry.java`（receiver 类名 ↔ 预设）→ `widget_info_*.xml`（targetCell）
 * → `strings.xml`（provider 标签）。
 */
describe('五档 provider 的跨层一致性', () => {
  it('注册表里恰好五档，且每档对应预设表里的一个标识', () => {
    const registry = readFileSync(join(REPO_ROOT, 'android/app/src/main/java/com/classtrack/app/WidgetProviderRegistry.java'), 'utf8')
    const registered = [...registry.matchAll(/new Entry\(PACKAGE \+ "(\w+)", WidgetPreset\.ID_CELL_(\w+)\)/g)].map((match) => ({
      receiver: match[1],
      cells: match[2].toLowerCase(),
    }))

    expect(registered).toHaveLength(WIDGET_CELLS.length)
    for (const entry of registered) {
      expect(WIDGET_CELLS).toContain(entry.cells as (typeof WIDGET_CELLS)[number])
    }
    // 每档都要有 receiver：类名一律以 Cell<尺寸> 结尾，唯独 4×3 沿用旧类名（改名会让既有实例失效）。
    for (const cells of WIDGET_CELLS) {
      const entry = registered.find((candidate) => candidate.cells === cells)
      expect(entry, cells).toBeTruthy()
      expect(entry?.receiver, cells).toBe(cells === '4x3' ? 'ClassTrackWidgetReceiver' : `Cell${cells}WidgetReceiver`)
    }
  })

  it('每档的元数据文件声明的格子数与预设一致，且各指向自己的预览', () => {
    for (const preset of WIDGET_PIN_PRESETS) {
      const cells = preset.id.replace('cell_', '').replace('x', 'x')
      const [width, height] = cells.split('x')
      const info = readFileSync(join(REPO_ROOT, `android/app/src/main/res/xml/widget_info_${cells}.xml`), 'utf8')

      expect(info, preset.id).toContain(`android:targetCellWidth="${width}"`)
      expect(info, preset.id).toContain(`android:targetCellHeight="${height}"`)
      expect(info, preset.id).toContain(`@layout/widget_preview_${cells}`)
      expect(info, preset.id).toContain(`@drawable/widget_preview_${cells}`)
      // 卡片上写的格子必须与元数据一致（"卡片写着 4×3、拾取器里是 2×3" 是用户能直接看到的谎）。
      expect(preset.cell, preset.id).toBe(`${width}×${height}`)
    }
  })

  it('provider 标签与面板卡片名逐字一致', () => {
    const strings = readFileSync(join(REPO_ROOT, 'android/app/src/main/res/values/strings.xml'), 'utf8')

    for (const preset of WIDGET_PIN_PRESETS) {
      const cells = preset.id.replace('cell_', '')
      const label = (strings.match(new RegExp(`<string name="widget_label_${cells}">([^<]+)</string>`)) || [])[1]
      // 标签="课表 · " + 卡片名：面板与拾取器里必须叫同一个名字，否则用户对不上。
      expect(label, preset.id).toBe(`课表 · ${preset.name}`)
    }
  })

  it('清单注册了五条 provider，且旧类名仍在', () => {
    const manifest = readFileSync(join(REPO_ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8')

    expect([...manifest.matchAll(/android.appwidget.action.APPWIDGET_UPDATE/g)]).toHaveLength(WIDGET_CELLS.length)
    expect(manifest).toContain('android:name=".widget.ClassTrackWidgetReceiver"')
    for (const cells of WIDGET_CELLS) {
      expect(manifest, cells).toContain(`@xml/widget_info_${cells}`)
    }
  })
})

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
