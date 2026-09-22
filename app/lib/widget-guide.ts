import { WIDGET_PIN_PRESETS, WIDGET_PIN_SIZE_TUNING_HINT } from '~/features/schedule/widgetPinPresets'

/**
 * 导入成功后的**一次性**加桌引导。
 *
 * 两件事拆开：这里的纯逻辑（「该不该弹」+ 文案）可以被 vitest 钉住，
 * 弹窗本身在 `app/components/native-widget/WidgetGuideDialog.tsx`。
 *
 * **已读标记放在设备本地的独立 localStorage 键里**，不进 Zustand persist 的 `partialize`：
 * 它是「这台设备上别再打扰我」的一次性状态，不该随备份迁移到新设备后再也不弹。
 */
export const WIDGET_GUIDE_STORAGE_KEY = 'class-track-widget-guide-seen'

/**
 * 只依赖 `getItem` / `setItem` 的存储形状，便于测试注入假实现。
 *
 * 不用完整的 `Storage`：引导只读写一个键，收窄接口能让「storage 抛异常」这类边界变得好测。
 */
export type GuideStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * 取实际使用的存储。
 *
 * `undefined`（没传）表示「用 `window.localStorage`」，显式传 `null` 表示「这台环境没有存储」——
 * 两者必须区分：前者是正常调用，后者是测试要覆盖的无存储分支。
 */
function resolveStorage(storage?: GuideStorage | null): GuideStorage | null {
  if (storage !== undefined) {
    return storage
  }

  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    // 隐私模式 / 禁用存储时读 window.localStorage 本身就会抛。
    return null
  }
}

/**
 * 这台设备上是不是已经读过引导。
 *
 * @param storage 存储实现；省略时用 `window.localStorage`。
 * @returns 读到标记为 `true`；没有存储、读失败、没标记一律 `false`（当作没读过，宁可多弹一次也不静默吞掉引导）。
 */
export function hasSeenWidgetGuide(storage?: GuideStorage | null): boolean {
  const target = resolveStorage(storage)
  if (!target) return false

  try {
    return target.getItem(WIDGET_GUIDE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 记下「这台设备已经读过引导」。
 *
 * **在决定要弹的那一刻写**，不是关闭时才写：中途被杀 / 崩溃不会导致下次再打扰一次。
 *
 * @param storage 存储实现；省略时用 `window.localStorage`。
 */
export function markWidgetGuideSeen(storage?: GuideStorage | null): void {
  const target = resolveStorage(storage)
  if (!target) return

  try {
    target.setItem(WIDGET_GUIDE_STORAGE_KEY, '1')
  } catch {
    // 配额满 / 隐私模式下写不进去：后果只是「可能再弹一次」，不该因此打断导入成功后的流程。
  }
}

/**
 * 是否该在导入成功后弹引导。
 *
 * 两个条件缺一不可：**这台设备真的有小工具**（浏览器 / PWA / iOS 弹出来是指向不存在功能的空话），
 * 且**还没读过**（一次性打扰）。
 *
 * @param input `nativeWidgetAvailable` 来自 `isNativeWidgetSnapshotAvailable()`；`seen` 来自 `hasSeenWidgetGuide()`。
 * @returns 该弹时为 `true`。
 */
export function shouldShowWidgetGuide(input: { nativeWidgetAvailable: boolean; seen: boolean }): boolean {
  return input.nativeWidgetAvailable && !input.seen
}

/** 引导弹窗标题。 */
export const WIDGET_GUIDE_TITLE = '把课表放到桌面'

/** 引导弹窗说明：先说清「为什么值得加」，再给步骤。 */
export const WIDGET_GUIDE_DESCRIPTION = '课程表已导入。再加一张桌面卡片，不打开应用也能看到接下来上什么。'

/** 主按钮：直达课表页并自动打开加桌面板。 */
export const WIDGET_GUIDE_PRIMARY_ACTION = '去添加'

/** 次按钮：只关掉，不做任何跳转。 */
export const WIDGET_GUIDE_SECONDARY_ACTION = '知道了'

/**
 * 引导的步骤文案。
 *
 * 档位名（`接下来 3×2 / 紧凑 1×2`）与尺寸提示都从既有常量派生，**不手抄**：
 * 面板与引导描述的是同一批卡片，抄一份就等着两处漂移。
 *
 * @returns 有序步骤（每项一句，展示在有序列表里）。
 */
export function widgetGuideSteps(): string[] {
  const presetNames = WIDGET_PIN_PRESETS.map((preset) => `${preset.name} ${preset.cell}`).join(' / ')

  return [
    `在课程表页点顶栏的「添加到桌面」，选一档摆法（${presetNames}）。`,
    WIDGET_PIN_SIZE_TUNING_HINT,
    '一键添加不生效也没关系：面板底部有各家桌面的手动步骤。',
  ]
}
