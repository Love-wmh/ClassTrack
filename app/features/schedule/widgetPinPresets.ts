import type {
  WidgetPinAttempt,
  WidgetPinConfirmation,
  WidgetPinObservation,
  WidgetPinResult,
  WidgetVendorFamily,
  WidgetPresetId,
} from '~/lib/native-widget-snapshot'

/**
 * 应用内「添加到桌面」提供的预设。
 *
 * 一个预设 = **目标格子 + 布局样式 + 大格子表现**。给出预设而不只是「添加小工具」的原因是：
 * 小工具在任何尺寸都能渲染，但只有少数几个尺寸被验证过「内容刚好铺满、不裁切」。预设把这几个尺寸
 * 连同对应的摆法一起推荐给用户，避免用户自己拖出一个没人验证过的尺寸。
 *
 * **按尺寸命名**（2026-09-21 口径变更）：预设同时是系统拾取器里的一个 provider、pin 面板里的一张卡、
 * 以及**尺寸变化后自动匹配的目标**。三处都靠"多大格子"说话，所以标识与名字都以格子为准
 * （`cell_4x3` / 「标准 4×3」），不再用 `phone_standard` 这种与设备绑定的名字
 * —— 同一个 4×3 在手机与平板上都存在，只是渲染结果不同。
 *
 * **标识必须与原生 `WidgetPreset.java` 的白名单逐字一致**（原生只认这几个字符串，拼错会静默回退成
 * 「未选预设」）。这条由 `widgetPinPresets.test.ts` 守住，且那道测试会直接读 Android 侧的
 * `WidgetProviderRegistry.java` 与五份 `widget_info_*.xml`，把三层对齐。
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
   * 是否「宽度够就分两栏」。
   *
   * 双栏要求「宽度 ≥ 320dp 且宽度 ≥ 高度 × 1.25」，**手机竖屏的 4×3 不满足**（373×321 → 宽高比 1.16），
   * 于是在手机上它会老老实实按单栏渲染 —— 不报错，但和名字给人的预期不符。这条标记让卡片如实说明
   * 「手机上会退化成单栏」，而不是把选项藏起来（手机横放或宽矮格子时它确实能分栏）。
   */
  needsWideCell?: boolean
}

/** 预设清单；顺序就是卡片顺序（从最小到最大），也是拾取器里的 provider 顺序。 */
export const WIDGET_PIN_PRESETS: readonly WidgetPinPreset[] = [
  {
    id: 'cell_2x2',
    name: '极简 2×2',
    cell: '2×2',
    description: '一张卡突出「现在这节课」，下面跟一行「下一节」。',
    hint: '桌面位置紧张、只想扫一眼现在上什么。',
  },
  {
    id: 'cell_2x3',
    name: '手机 2×3',
    cell: '2×3',
    description: '上面是当前课程，下面接两行今天的课表。',
    hint: '手机竖屏的主力位，一屏能看两节。',
  },
  {
    id: 'cell_4x2',
    name: '宽横 4×2',
    cell: '4×2',
    description: '横向铺开、只占两行高度，课表按行滚动。',
    hint: '顶部空间有限，或喜欢横着放。',
  },
  {
    id: 'cell_4x3',
    name: '标准 4×3',
    cell: '4×3',
    description: '上面是当前课程，下面接今天整天课表；格子够宽时自动分两栏。',
    hint: '最常用的摆法：手机单栏、平板双栏。',
    needsWideCell: true,
  },
  {
    id: 'cell_6x3',
    name: '宽屏 6×3',
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
 * 空间不足时的补充说明。
 *
 * 四家厂商里至少荣耀/华为**不会**自动新建一页来放，只会提示「当前页面空间不足」，
 * 所以手动步骤后面统一补这一句，免得用户以为是小工具太大放不下。
 */
export const WIDGET_PIN_SPACE_HINT = '当前页放不下时，先滑到有空位的页面'

/**
 * 复核命中时的说明（**如实措辞，不是「系统已确认」**）。
 *
 * 我们只知道**桌面上多了一张课表卡片**，不知道是谁放的 —— 用户可能同时自己从拾取器拖了一张。
 * 因此这里给出的是「观察到的现象 + 若不是你加的就忽略」，而不是断言成功。
 *
 * 与回调命中的区别：那条（`added`）不给任何提示（模态自己会收起），因为它是系统的权威结论。
 */
export const WIDGET_PIN_OBSERVED_HINT = '检测到桌面上新增了一张课表卡片。如果不是你刚添加的，请忽略。'

/**
 * 小米「创建桌面快捷方式」权限的说明。
 *
 * 这条依据是**社区实测口径**（非厂商官方文档），所以措辞是「可能不会生效」而不是断言 ——
 * 权限开关我们也**不检测**（公开 SDK 里没有对应的 op），只提示 + 给一个跳转入口。
 */
export const WIDGET_PIN_XIAOMI_PERMISSION_HINT = '小米手机需要为课表打开「创建桌面快捷方式」权限，否则一键添加可能不会生效。'

/** 小米权限引导按钮的文案（只是导航，不承诺一定能到那个开关）。 */
export const WIDGET_PIN_XIAOMI_PERMISSION_ACTION = '去开启权限'

/**
 * vivo 组件库跳转的说明。
 *
 * **不得**写成「这里一定能看到课表」：未上架审核的组件会不会出现在组件库里是未知的（开放项 V5），
 * 所以只说「打开组件库，在里面找课表」，手动步骤也继续常驻。
 */
export const WIDGET_PIN_VIVO_GALLERY_HINT = '也可以打开组件库，在里面找到课表并添加。'

/** vivo 组件库跳转按钮的文案。 */
export const WIDGET_PIN_VIVO_GALLERY_ACTION = '打开组件库'

/** 「添加到桌面」这次操作的**状态**。 */
export type WidgetPinOutcome =
  | 'idle'
  | 'requesting'
  | 'added'
  | 'added_observed'
  | 'cancelled'
  | 'no_confirmation'
  | 'unconfirmed'
  | 'unsupported'

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
 * 「无回调复核」结论 → 面板状态。
 *
 * 复核命中同样点亮「已添加」（用户的心智是「我刚加了它」），但走 `added_observed` 这一支，
 * 与回调命中的 `added` 在**文案上可区分**：我们只知道桌面上多了一张卡片，不知道是谁放的。
 *
 * @param observation 原生 `consumePinObservation()` 的结论。
 * @returns `added_observed` 或 `unconfirmed`。
 */
export function resolvePinOutcomeFromObservation(observation: WidgetPinObservation): 'added_observed' | 'unconfirmed' {
  return observation.observed ? 'added_observed' : 'unconfirmed'
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
    case 'added_observed':
      // 复核命中：卡片确实在桌面上，但给不出「系统已确认」这种口径。
      return WIDGET_PIN_OBSERVED_HINT
    case 'added':
    case 'idle':
      return null
  }
}

/**
 * 各家的手动添加入口**各不相同**（入口名与层级都不一样），所以文案必须按厂商取。
 *
 * 为什么不能留一句通用的：既有那句「长按桌面空白处 → 小工具 → …」在四家上**都是错的指路** ——
 * 小米要点「小部件」并进「安卓小部件」；OPPO 要点「卡片」再搜；vivo 要进「应用挂件」；荣耀要经「服务卡片」。
 *
 * 来源：两个互相独立的生产 App 用户文档（见 research.md §4）。通用句只留给未识别厂商与老系统。
 */
export const MANUAL_HINT_BY_FAMILY: Record<WidgetVendorFamily, string> = {
  xiaomi: '双指捏合桌面 → 底部「小部件」→ 小部件中心点「搜索」→ 进「安卓小部件」→ 找到课表',
  oppo: '长按桌面空白处 → 「卡片」→ 直接搜索「课表」',
  vivo: '长按桌面空白处 → 「组件」→ 底部「应用挂件」→ 下滑找到课表',
  honor: '双指捏合桌面 → 「服务卡片 / 桌面卡片」→ 滑到底 → 「窗口小工具 / 经典小工具」→ 找到课表',
  other: '长按桌面空白处 → 「小工具 / 小组件」→ 找到课表',
}

/**
 * 尺寸清单从预设表生成，避免「面板写一种、拾取器里是另一种」的错位。
 *
 * @returns 形如 `2×2 / 2×3 / 4×2 / 4×3 / 6×3`。
 */
export function widgetPinSizeList(): string {
  return WIDGET_PIN_PRESETS.map((preset) => preset.cell).join(' / ')
}

/**
 * 面板底部**常驻**的手动步骤说明（按厂商取）。
 *
 * 不只在失败时出现：会静默吞掉请求的桌面上，它是唯一可靠的路径，因此始终可见。
 *
 * @param family 厂商族；决定入口名与层级。
 * @param sizeList 尺寸清单；默认从预设表生成。
 * @returns 一句话步骤（含尺寸与空间不足的补充说明）。
 */
export function manualSteps(family: WidgetVendorFamily, sizeList: string = widgetPinSizeList()): string {
  // 显式标注 `string | undefined`：原生理论上可能送来一个还没认识的族名，这时要退回通用句而不是渲染出 undefined。
  const hint: string | undefined = MANUAL_HINT_BY_FAMILY[family]
  const path = hint ?? MANUAL_HINT_BY_FAMILY.other
  const space = family === 'other' ? '' : `（${WIDGET_PIN_SPACE_HINT}）`
  return `${path} → 按尺寸选（${sizeList}）→ 拖到桌面上，再按卡片上的格子数调整大小${space}`
}

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
  if (outcome === 'added' || outcome === 'added_observed') {
    // 两种「加上了」共用同一个模态；差异只在提示语（见 pinOutcomeMessage）。
    return dismissed ? 'hidden' : 'added'
  }
  return dismissed ? 'hidden' : 'failed'
}

/**
 * 快探针轮询的映射：还没到判定窗口就继续等，命中就切「系统没有弹出确认界面」。
 *
 * 注意 `no_confirmation` **不是终态**：调用方必须继续轮询确认回调，到了就翻成成功。
 */
export function resolvePinProbeOutcome(attempt: WidgetPinAttempt): 'waiting' | 'no_confirmation' {
  return attempt.requested && attempt.shouldFailFast ? 'no_confirmation' : 'waiting'
}
