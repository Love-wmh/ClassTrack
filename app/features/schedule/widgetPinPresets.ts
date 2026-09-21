import type { WidgetPinAttempt, WidgetPinConfirmation, WidgetPinResult, WidgetPresetId } from '~/lib/native-widget-snapshot'

/**
 * 应用内「添加到桌面」提供的预设。
 *
 * 一个预设 = **目标格子 + 布局样式 + 大格子表现**。给出预设而不只是「添加小工具」的原因是：
 * 小工具在任何尺寸都能渲染，但只有少数几个尺寸被验证过「内容刚好铺满、不裁切」。预设把这几个尺寸
 * 连同对应的摆法一起推荐给用户，避免用户自己拖出一个没人验证过的尺寸。
 *
 * **按尺寸命名**（2026-09-21 口径变更）：预设同时是系统拾取器里的一个 provider 与 pin 面板里的一张卡，
 * 两者都要靠"多大格子"说话，所以标识与名字都以格子为准（`cell_3x2` / 「接下来 3×2」）。
 *
 * **2026-09-21 维护面收缩**：只提供两档 —— 3×2「接下来」（核心摆法）与 1×2「紧凑」（窄高摆法）。
 * 其余五档的 provider 仍留在应用里（存量实例、配置页归属校验要用），但已在启动时被禁用，
 * 因此**不会**出现在系统拾取器里；面板也不下发它们（列出来只会是点了放不下的死卡）。
 *
 * **标识必须与原生 `WidgetPreset.java` 的白名单逐字一致**（原生只认这几个字符串，拼错会静默回退成
 * 「未选预设」）。这条由 `widgetPinPresets.test.ts` 守住，且那道测试会直接读 Android 侧的
 * `WidgetProviderRegistry.java` 与七份 `widget_info_*.xml`，把三层对齐。
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
}

/**
 * 预设清单；顺序 = 拾取器里的 provider 顺序 = 维护档顺序（与原生注册表一致）。
 *
 * 卡片名只服务于**应用内面板**：拾取器里两档也叫「课表」（不带样式、不带尺寸），由 launcher 在标签下方
 * 打出它算出的跨度来区分。因此卡片名要能把两档摆法说清（接下来 / 紧凑），而不是重复 provider 标签。
 */
export const WIDGET_PIN_PRESETS: readonly WidgetPinPreset[] = [
  {
    id: 'cell_3x2',
    name: '接下来',
    cell: '3×2',
    description: '上面一张大卡片突出正在进行或接下来的一节课，下面接今天的课表；今天没课时改列明天。',
    hint: '手机桌面的主力位，一屏能看清「现在上什么」和「今天还有什么」。',
  },
  {
    id: 'cell_1x2',
    name: '紧凑',
    cell: '1×2',
    description: '只放一张当前 / 接下来的课卡片，底部一行今天的节数；信息最少，一眼看到下一节。',
    hint: '桌面只剩一条窄位时用；信息最少，但一眼能看到下一节。',
  },
]

/**
 * 系统不支持一键添加时的说明。
 *
 * 这段文案必须**如实**：我们只能请求系统去放置，最终尺寸由 launcher 决定，因此不能承诺
 * 「一定会按目标格子放好」。
 */
export const WIDGET_PIN_MANUAL_HINT = '当前系统不支持从应用内一键添加。请用下面的方式手动添加。'

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

/** 「添加到桌面」这次操作的**状态**。 */
export type WidgetPinOutcome = 'idle' | 'requesting' | 'added' | 'cancelled' | 'no_confirmation' | 'unconfirmed' | 'unsupported'

/**
 * 快探针命中时的说明（**推断，不是失败结论**）。
 *
 * 取舍：宁可说「系统没有弹出确认界面」并补一句「如果你在桌面上看到了确认界面，请先把它点完」，
 * 也不要断言失败 —— 极少数 launcher 会在同一任务里弹对话框，那时我们并没有退到后台。
 */
export const WIDGET_PIN_NO_CONFIRMATION_HINT =
  '系统没有弹出确认界面（部分厂商桌面会忽略这个请求）。如果你在桌面上看到了确认界面，请先把它点完；否则请用手动步骤添加。'

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
 * 等待结束时用哪个状态收尾。
 *
 * **探针已经命中过就不要降级**：`no_confirmation` 的文案比兜底文案更可行动（它明确说了「系统没有弹出
 * 确认界面」并给出「如果你在桌面上看到了确认界面，请先把它点完」），被 `unconfirmed` 覆盖掉等于白探。
 */
export function resolvePinFinalOutcome(probeFired: boolean): 'no_confirmation' | 'unconfirmed' {
  return probeFired ? 'no_confirmation' : 'unconfirmed'
}

/**
 * 每个状态对应的提示文案；`null` 表示这一状态下不给任何提示（不打扰用户）。
 */
export function pinOutcomeMessage(outcome: WidgetPinOutcome): string | null {
  switch (outcome) {
    case 'requesting':
      return WIDGET_PIN_REQUESTING_HINT
    case 'no_confirmation':
      return WIDGET_PIN_NO_CONFIRMATION_HINT
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
 * 尺寸清单从预设表生成，避免"面板写一种、拾取器里是另一种"的错位。
 */
export const WIDGET_PIN_MANUAL_STEPS = `长按桌面空白处 → 小工具 → 找到课表 → 按尺寸选（${WIDGET_PIN_PRESETS.map((preset) => preset.cell).join(' / ')}）→ 拖到桌面上，再按卡片上的格子数调整大小`

/**
 * 模态框当前该显示什么。
 *
 * - `requesting`：点击后**立刻**出现（用户要知道我们正在尝试，而不是点完没反应）；
 * - `failed`：任何失败/疑似失败都走这里（被取消、不支持、系统没弹确认界面、超时未确认）；
 * - `added`：只有确认回调到达才出现，随后自动收起；
 * - `hidden`：没请求，或用户已经把这次结果关掉了（不再重复打扰）。
 */
export type WidgetPinModalState = 'hidden' | 'requesting' | 'failed' | 'added'

/**
 * 由状态与「用户是否关掉」推出模态该显示什么（纯映射，vitest 覆盖）。
 */
export function resolvePinModalState(outcome: WidgetPinOutcome, dismissed: boolean): WidgetPinModalState {
  if (outcome === 'requesting') {
    // 进行中永远显示：这一态存在的意义就是让用户知道「点完不是没反应」。
    return 'requesting'
  }
  if (outcome === 'idle') {
    return 'hidden'
  }
  return dismissed ? 'hidden' : outcome === 'added' ? 'added' : 'failed'
}

/**
 * 快探针轮询的映射：还没到判定窗口就继续等，命中就切「系统没有弹出确认界面」。
 *
 * 注意 `no_confirmation` **不是终态**：调用方必须继续轮询确认回调，到了就翻成成功。
 */
export function resolvePinProbeOutcome(attempt: WidgetPinAttempt): 'waiting' | 'no_confirmation' {
  return attempt.requested && attempt.shouldFailFast ? 'no_confirmation' : 'waiting'
}
