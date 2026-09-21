import type { WidgetPinConfirmation, WidgetPinResult, WidgetPresetId } from '~/lib/native-widget-snapshot'

/**
 * 应用内「添加到桌面」提供的预设。
 *
 * 一个预设 = **目标格子 + 布局样式 + 大格子表现**。给出预设而不只是「添加小工具」的原因是：
 * 小工具在任何尺寸都能渲染，但只有少数几个尺寸被验证过「内容刚好铺满、不裁切」。预设把这几个尺寸
 * 连同对应的摆法一起推荐给用户，避免用户自己拖出一个没人验证过的尺寸。
 *
 * **标识必须与原生 `WidgetPreset.java` 的白名单逐字一致**（原生只认这几个字符串，拼错会静默回退）。
 * 这条由 `widgetPinPresets.test.ts` 守住。
 */
export type WidgetPinPreset = {
  /** 与原生白名单一致的标识。 */
  id: WidgetPresetId
  /** 卡片标题。 */
  name: string
  /** 目标格子文案，如 `4×3`。 */
  cell: string
  /** 一句话说明这个预设长什么样、适合谁。 */
  description: string
  /** 何时该选它；写在卡片上避免用户逐个试。 */
  hint: string
  /**
   * 是否只有横向够宽的格子才看得出效果。
   *
   * 双栏要求「宽度 ≥ 320dp 且宽度 ≥ 高度 × 1.25」，**手机竖屏的 4×3 不满足**（373×321 → 宽高比 1.16），
   * 于是在手机上它会老老实实按单栏渲染 —— 不报错，但和名字给人的预期不符。这条标记让卡片如实说明
   * 「手机上会退化成单栏」，而不是把选项藏起来（手机横放或宽矮格子时它确实能分栏）。
   */
  needsWideCell?: boolean
}

/** 预设清单；顺序就是卡片顺序（从最简到最全）。 */
export const WIDGET_PIN_PRESETS: readonly WidgetPinPreset[] = [
  {
    id: 'phone_minimal',
    name: '手机 · 极简',
    cell: '2×2',
    description: '一张卡突出「现在这节课」，下面跟一行「下一节」。',
    hint: '桌面位置紧张、只想扫一眼现在上什么。',
  },
  {
    id: 'phone_standard',
    name: '手机 · 标准',
    cell: '4×3',
    description: '上面是当前课程，下面接今天整天课表。',
    hint: '最常用的摆法，绝大多数手机桌面。',
  },
  {
    id: 'phone_wide',
    name: '手机 · 宽横',
    cell: '4×2',
    description: '横向铺开、只占两行高度，课表按行滚动。',
    hint: '顶部空间有限，或喜欢横着放。',
  },
  {
    id: 'tablet_dual',
    name: '平板 · 双栏',
    cell: '4×3',
    description: '左栏是当前课程卡片，右栏是今天课表。',
    hint: '平板横屏；字更大、信息更多。',
    needsWideCell: true,
  },
  {
    id: 'tablet_wide',
    name: '平板 · 宽屏',
    cell: '6×3',
    description: '左卡 + 更宽的右侧课表，教室就在课名下面。',
    hint: '平板横向 6 列以上的宽格。',
    needsWideCell: true,
  },
]

/**
 * 系统不支持一键添加时的说明。
 *
 * 这段文案必须**如实**：我们只能请求系统去放置，最终尺寸由 launcher 决定，因此不能承诺
 * 「一定会按目标格子放好」。
 */
export const WIDGET_PIN_MANUAL_HINT = '当前系统不支持从应用内一键添加。请用下面的方式手动添加。'

/** 只有横向够宽的格子才分两栏时的提示（手机竖屏、窄格子）。 */
export const WIDGET_PIN_NARROW_CELL_HINT = '当前格子不够宽，会先按单栏显示；横放或用平板时自动分两栏。'

/**
 * 「请求已发出、还没等到系统确认」时的中性说明。
 *
 * `requestPinAppWidget` 的返回值只表示「请求已受理」，**与是否真的放下无关**（真机 ColorOS 实测：launcher
 * 起了确认界面却从不显示、一个小工具都没放下）。所以在收到确认回调之前，文案必须是中性的，
 * 绝不能写成「已添加」。
 */
export const WIDGET_PIN_REQUESTING_HINT = '已请求系统添加。若弹出确认界面，请点确认；否则请用手动步骤添加。'

/**
 * 迟迟等不到确认时的**如实**说明。
 *
 * 这不是「出错了」，而是有些厂商桌面会直接忽略这个请求（已实测）。因此文案要让用户知道
 * 手动路径是可靠的，并且**不要**说成「失败，请重试」——重试同一个请求同样不会生效。
 */
export const WIDGET_PIN_UNCONFIRMED_HINT = '系统没有完成添加（部分厂商桌面会忽略这个请求）。请用下面的手动步骤添加。'

/** 系统弹窗被取消（或 launcher 没有真的放下）时的说明。 */
export const WIDGET_PIN_CANCELLED_HINT = '没有添加成功。可以再点一次，或按下面的手动步骤添加。'

/**
 * 「添加到桌面」这次操作的**状态**。
 *
 * 关键区分：`'requesting'`（已请求、还没等到系统确认）**不等于**成功。`requestPinAppWidget` 的返回值只表示
 * 「请求已受理」，真机上出现过「受理了但什么都没放下」；因此只有 `'added'`（收到确认回调）才允许显示「已添加」。
 */
export type WidgetPinOutcome = 'idle' | 'requesting' | 'added' | 'cancelled' | 'unconfirmed' | 'unsupported'

/**
 * 请求刚返回时的下一步：轮询等确认、直接判定、还是走手动说明。
 *
 * 抽成纯函数是为了可测试（vitest）：hook 里的定时器难测，但
 * 「什么返回值对应什么状态」是纯映射，必须被测试钉住。
 */
export function resolvePinStartOutcome(result: WidgetPinResult): 'requesting' | 'cancelled' | 'unsupported' {
  if (!result.supported) {
    return 'unsupported'
  }
  // 支持但没受理：用户多半在系统弹窗上取消了（也可能 launcher 直接拒绝）。
  return result.requested ? 'requesting' : 'cancelled'
}

/**
 * 轮询结束时的判定：收到确认才算成功，否则如实说「系统没有完成添加」。
 *
 * 超过等待时间**不是错误**，所以不给「重试」措辞 —— 重试同一个请求同样会被静默吞掉。
 */
export function resolvePinPollOutcome(confirmation: WidgetPinConfirmation): 'added' | 'unconfirmed' {
  return confirmation.confirmed ? 'added' : 'unconfirmed'
}

/**
 * 每个状态对应的提示文案；`null` 表示这一状态下不给任何提示（不打扰用户）。
 */
export function pinOutcomeMessage(outcome: WidgetPinOutcome): string | null {
  switch (outcome) {
    case 'requesting':
      return WIDGET_PIN_REQUESTING_HINT
    case 'unconfirmed':
      return WIDGET_PIN_UNCONFIRMED_HINT
    case 'unsupported':
      return WIDGET_PIN_MANUAL_HINT
    case 'cancelled':
      return WIDGET_PIN_CANCELLED_HINT
    case 'added':
    case 'idle':
      return null
  }
}

/**
 * 面板底部**常驻**的手动步骤说明。
 *
 * 不只在失败时出现：会静默吞掉请求的桌面上，它是唯一可靠的路径，因此始终可见。
 */
export const WIDGET_PIN_MANUAL_STEPS = '长按桌面空白处 → 小工具 → 找到课表 → 拖到桌面上，再按卡片上的格子数调整大小。'
