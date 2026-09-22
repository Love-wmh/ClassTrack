import { readFileSync } from 'node:fs'
// 用 fileURLToPath 而不是 URL.pathname：仓库路径含中文，pathname 会带百分号编码。
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  manualSteps,
  MANUAL_HINT_BY_FAMILY,
  WIDGET_PIN_PRESETS,
  WIDGET_PIN_SPACE_HINT,
  WIDGET_PIN_SIZE_TUNING_HINT,
  pinOutcomeMessage,
  resolvePinFinalOutcome,
  resolvePinModalState,
  resolvePinOutcomeFromObservation,
  resolvePinProbeOutcome,
  resolvePinPollOutcome,
  resolvePinStartOutcome,
} from './widgetPinPresets'
import { widgetGuideSteps } from '~/lib/widget-guide'

/**
 * 预设目录的**跨层契约**：这张表里的标识就是原生 `WidgetPreset.java` 的白名单。
 *
 * 原生侧只认这几个字符串，拼错不会报错、只会静默回退成「未选预设」（用户看到的是「点了没生效」）。
 * 因此这里把同一份字面量再写一遍并比对 —— 两边改动时，这个测试会立刻失败。
 */
const NATIVE_WHITELIST = ['cell_3x2', 'cell_1x2', 'cell_2x2', 'cell_2x3', 'cell_4x2', 'cell_4x3', 'cell_6x3'] as const

/**
 * 跨层断言用的路径（相对仓库根）：直接读**真实的** Android 资源与清单。
 *
 * 为什么读文件而不是再抄一遍字面量：预设名、格子数、provider 标签现在同时存在于
 * Web 预设表、`res/xml/widget_info_*.xml`、`res/values/strings.xml` 与 `WidgetProviderRegistry.java`。
 * 抄一遍只能证明"我抄对了"，读文件才能证明"两边真的一样"。
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
/** 加桌面板的实现文件：断言它引用共享常量，而不是自己再写一句尺寸提示。 */
const WIDGET_PIN_ENTRY_TS = 'app/features/schedule/WidgetPinEntry.tsx'
const WIDGET_CELLS = ['3x2', '1x2', '4x3', '2x2', '2x3', '4x2', '6x3'] as const

/**
 * 维护档：只有这两档会出现在系统拾取器里，也只有这两档会下发到面板。
 *
 * 其余五档的 provider/元数据/预览仍留在应用里（存量实例与配置页归属校验要用，见 `WidgetProviderScopeGate`），
 * 所以与清单、资源的一致性断言仍然覆盖全部七档。
 */
const MAINTAINED_CELLS = ['3x2', '1x2'] as const

describe('小工具预设目录', () => {
  it('标识与原生白名单逐字一致、且不重复', () => {
    const ids = WIDGET_PIN_PRESETS.map((preset) => preset.id)

    // 面板只下发维护档 —— 其余档的 provider 已被禁用，列出来只会是点了放不下的死卡。
    expect(ids).toEqual([...MAINTAINED_CELLS].map((cells) => `cell_${cells}`))
    // 这些标识必须都在原生白名单里（原生只认白名单，拼错会静默回退成「未选预设」）。
    for (const id of ids) {
      expect(NATIVE_WHITELIST).toContain(id as (typeof NATIVE_WHITELIST)[number])
    }
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

  it('面板只提供两档维护档，且两档都指向真实存在的 provider', () => {
    expect(WIDGET_PIN_PRESETS.map((preset) => preset.cell)).toEqual(['3×2', '1×2'])
    const registry = readFileSync(join(REPO_ROOT, 'android/app/src/main/java/com/classtrack/app/WidgetProviderRegistry.java'), 'utf8')

    for (const cells of MAINTAINED_CELLS) {
      // 「维护档」在注册表里是 maintained=true 那一半：标签写着维护、注册表却标成收起（或反过来）
      // 会让拾取器少一条 / 多一条，而这两种错都很难在日常使用中发现。
      expect(registry, cells).toContain(`WidgetPreset.ID_CELL_${cells.toUpperCase()}, true`)
    }
  })

  it('手动步骤仍指名每一档尺寸，且不承诺尺寸由我们决定', () => {
    // 我们不承诺「一定按目标格子放好」：最终尺寸由 launcher 决定，文案必须留出这一步。
    for (const preset of WIDGET_PIN_PRESETS) {
      expect(manualSteps('other'), preset.id).toContain(preset.cell)
    }
    expect(manualSteps('other')).toContain('调整大小')
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
 * 七档 provider（两档维护 + 五档收起）与 Web 侧预设的跨层一致性。
 *
 * 出错时的表现很隐蔽（某个尺寸放下去是错的样式 / 拾取器里显示错尺寸），因此把四处对齐：
 * 预设表 → `WidgetProviderRegistry.java`（receiver 类名 ↔ 预设 ↔ 是否维护）→ `widget_info_*.xml`（targetCell）
 * → `strings.xml`（provider 标签）。
 */
describe('七档 provider 的跨层一致性', () => {
  it('注册表里恰好七档，其中维护档恰好两档', () => {
    const registry = readFileSync(join(REPO_ROOT, 'android/app/src/main/java/com/classtrack/app/WidgetProviderRegistry.java'), 'utf8')
    const registered = [...registry.matchAll(/new Entry\(PACKAGE \+ "(\w+)", WidgetPreset\.ID_CELL_(\w+), (true|false)\)/g)].map(
      (match) => ({
        receiver: match[1],
        cells: match[2].toLowerCase(),
        maintained: match[3] === 'true',
      })
    )

    expect(registered.map((entry) => entry.cells)).toEqual([...WIDGET_CELLS])
    // 维护档 = 会进拾取器的那两档；多一个会多一条、少一个会少一条。
    expect(registered.filter((entry) => entry.maintained).map((entry) => entry.cells)).toEqual([...MAINTAINED_CELLS])
    // 每档都要有 receiver：类名一律以 Cell<尺寸> 结尾，唯独 4×3 沿用旧类名（改名会让既有实例失效）。
    for (const cells of WIDGET_CELLS) {
      const entry = registered.find((candidate) => candidate.cells === cells)
      expect(entry, cells).toBeTruthy()
      expect(entry?.receiver, cells).toBe(cells === '4x3' ? 'ClassTrackWidgetReceiver' : `Cell${cells}WidgetReceiver`)
    }
  })

  it('每档的元数据文件声明的格子数与注册表一致，且各指向自己的预览', () => {
    for (const cells of WIDGET_CELLS) {
      const [width, height] = cells.split('x')
      const info = readFileSync(join(REPO_ROOT, `android/app/src/main/res/xml/widget_info_${cells}.xml`), 'utf8')

      expect(info, cells).toContain(`android:targetCellWidth="${width}"`)
      expect(info, cells).toContain(`android:targetCellHeight="${height}"`)
      expect(info, cells).toContain(`@layout/widget_preview_${cells}`)
      expect(info, cells).toContain(`@drawable/widget_preview_${cells}`)
      // 维护档的面板卡片上写着格子数，它必须与元数据一致（"卡片写着 3×2、拾取器里是 2×2" 是用户能直接看到的谎）。
      const preset = WIDGET_PIN_PRESETS.find((candidate) => candidate.id === `cell_${cells}`)
      if (preset) {
        expect(preset.cell, cells).toBe(`${width}×${height}`)
      }
    }
  })
  it('维护档的拾取器标签就是「课表」，面板卡片名负责区分摆法', () => {
    const strings = readFileSync(join(REPO_ROOT, 'android/app/src/main/res/values/strings.xml'), 'utf8')

    for (const preset of WIDGET_PIN_PRESETS) {
      const cells = preset.id.replace('cell_', '')
      const label = (strings.match(new RegExp(`<string name="widget_label_${cells}">([^<]+)</string>`)) || [])[1]
      // 拾取器里两档**同名**（2026-09-21 用户要求：名字不带样式也不带尺寸）—— launcher 会在标签下方
      // 自己打出它算出的跨度，用户按跨度区分。因此这里的契约是「标签恒为课表」，而不是「标签=课表 · 卡片名」。
      expect(label, preset.id).toBe('课表')
    }
    // 面板卡片必须自己可区分（两档同名会让用户不知道点哪一张）。
    const names = WIDGET_PIN_PRESETS.map((preset) => preset.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('清单注册了七条 provider，且旧类名仍在', () => {
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

  it('探针命中后的收尾文案不得被降级为兜底文案', () => {
    // 真机/受控实验实测过的缺陷：探针已经给出「系统没有弹出确认界面」，最后一轮却用兜底文案覆盖了它，
    // 用户看到的就是一句更不可行动的通用提示。
    expect(resolvePinFinalOutcome(true)).toBe('no_confirmation')
    expect(resolvePinFinalOutcome(false)).toBe('unconfirmed')
    // 两者文案确实不同，且探针那条包含可行动的下一步。
    expect(pinOutcomeMessage('no_confirmation')).not.toBe(pinOutcomeMessage('unconfirmed'))
    expect(pinOutcomeMessage('no_confirmation')).toContain('如果你在桌面上看到了确认界面')
  })

  it('手动步骤按尺寸指名，且与预设表的格子一致', () => {
    for (const preset of WIDGET_PIN_PRESETS) {
      expect(manualSteps('other'), preset.id).toContain(preset.cell)
    }
  })
})

/**
 * 厂商族的**跨层契约**：原生枚举 ↔ Web 联合类型 ↔ 文案表。
 *
 * 为什么读源码而不是再抄一遍字面量：三处必须同时改（原生加一族、Web 加一族、文案表加一条），
 * 抄一遍只能证明「我抄对了」，读文件才能证明「两边真的一样」。
 *
 * 注：旧的那句通用常量 `WIDGET_PIN_MANUAL_STEPS` 已被删除，因此**任何**遗留引用都会直接编译失败
 *（`pnpm typecheck` 就是那条守卫），不需要再靠字符串搜索去查。
 */
const VENDOR_FAMILY_JAVA = 'android/app/src/main/java/com/classtrack/app/WidgetVendorFamily.java'
const NATIVE_SNAPSHOT_TS = 'app/lib/native-widget-snapshot.ts'

/**
 * 从原生枚举源码里取线名（枚举常量小写）。
 *
 * 切片刻意停在 `FALLBACK` 常量之前：它是 `static final` 字段而不是枚举常量，混进来会多出一项。
 *
 * @returns 形如 `['xiaomi', 'oppo', 'vivo', 'honor', 'other']`。
 */
function readNativeVendorWireNames(): string[] {
  const source = readFileSync(join(REPO_ROOT, VENDOR_FAMILY_JAVA), 'utf8')
  const body = source.slice(source.indexOf('public enum WidgetVendorFamily'), source.indexOf('FALLBACK = OTHER'))

  return [...body.matchAll(/^ {4}([A-Z][A-Z0-9_]*)[,;]/gm)].map((match) => match[1].toLowerCase())
}

/**
 * 从 Web 源码里取 `WidgetVendorFamily` 联合类型的成员。
 *
 * @returns 形如 `['xiaomi', 'oppo', 'vivo', 'honor', 'other']`。
 */
function readWebVendorFamilies(): string[] {
  const source = readFileSync(join(REPO_ROOT, NATIVE_SNAPSHOT_TS), 'utf8')
  const line = source.split('\n').find((candidate) => candidate.startsWith('export type WidgetVendorFamily ='))
  if (!line) throw new Error('没找到 Web 侧的 WidgetVendorFamily 联合类型 —— 它被删掉或改名了？')

  return [...line.matchAll(/'([a-z]+)'/g)].map((match) => match[1])
}

describe('厂商族的跨层一致性', () => {
  it('原生枚举与 Web 联合类型逐字一致（漏加一族就红）', () => {
    expect(readWebVendorFamilies()).toEqual(readNativeVendorWireNames())
    // 防呆：解析不出来时会退化成空数组，那样两条空数组相等会让断言「假通过」。
    expect(readNativeVendorWireNames().length).toBeGreaterThanOrEqual(5)
  })

  it('每个厂商族都恰好有一条非空的手动引导文案', () => {
    expect(Object.keys(MANUAL_HINT_BY_FAMILY).sort()).toEqual(readNativeVendorWireNames().sort())
    for (const [family, hint] of Object.entries(MANUAL_HINT_BY_FAMILY)) {
      expect(hint.length, family).toBeGreaterThan(8)
    }
  })

  it('四家文案各自含其关键节点词（入口名与层级都不一样）', () => {
    expect(MANUAL_HINT_BY_FAMILY.xiaomi).toContain('安卓小部件')
    expect(MANUAL_HINT_BY_FAMILY.oppo).toContain('卡片')
    expect(MANUAL_HINT_BY_FAMILY.oppo).toContain('搜索')
    expect(MANUAL_HINT_BY_FAMILY.vivo).toContain('应用挂件')
    expect(MANUAL_HINT_BY_FAMILY.honor).toContain('服务卡片')
    expect(MANUAL_HINT_BY_FAMILY.honor).toContain('窗口小工具')
  })

  it('四家都提醒「先滑到有空位的页面」，通用句不带（它只是兜底）', () => {
    for (const family of ['xiaomi', 'oppo', 'vivo', 'honor'] as const) {
      expect(manualSteps(family), family).toContain(WIDGET_PIN_SPACE_HINT)
    }
    expect(manualSteps('other')).not.toContain(WIDGET_PIN_SPACE_HINT)
  })

  it('没见过的族名在表里是 undefined（manualSteps 那条 ?? 兜底就是为它写的）', () => {
    const byName: Record<string, string | undefined> = MANUAL_HINT_BY_FAMILY

    expect(byName['a-brand-we-do-not-know']).toBeUndefined()
    expect(manualSteps('other')).toContain('小工具')
  })
})

describe('无回调复核的文案与状态', () => {
  it('复核命中 → added_observed；没命中 → unconfirmed', () => {
    expect(resolvePinOutcomeFromObservation({ observed: true, count: 1 })).toBe('added_observed')
    expect(resolvePinOutcomeFromObservation({ observed: false, count: 0 })).toBe('unconfirmed')
  })

  it('复核命中的提示语带限定句，且绝不写成「系统已确认」', () => {
    const observed = pinOutcomeMessage('added_observed') ?? ''

    expect(observed).toContain('如果不是你刚添加的')
    expect(observed).not.toContain('系统已确认')
  })

  it('回调命中是权威结论，不给额外解释（模态自己会收起）', () => {
    expect(pinOutcomeMessage('added')).toBeNull()
    expect(pinOutcomeMessage('added_observed')).not.toBeNull()
  })

  it('复核命中同样显示成功态模态，并可自动收起', () => {
    expect(resolvePinModalState('added_observed', false)).toBe('added')
    expect(resolvePinModalState('added_observed', true)).toBe('hidden')
  })
})

describe('尺寸可调提示的单一来源', () => {
  it('常量本身非空且说的是「尺寸」（面板与引导都靠它）', () => {
    expect(WIDGET_PIN_SIZE_TUNING_HINT.length).toBeGreaterThan(8)
    expect(WIDGET_PIN_SIZE_TUNING_HINT).toContain('尺寸')
  })

  it('面板与引导引用的是同一份文案（不是各抄一句）', () => {
    expect(widgetGuideSteps()).toContain(WIDGET_PIN_SIZE_TUNING_HINT)
    expect(readFileSync(join(REPO_ROOT, WIDGET_PIN_ENTRY_TS), 'utf8')).toContain('WIDGET_PIN_SIZE_TUNING_HINT')
  })
})
