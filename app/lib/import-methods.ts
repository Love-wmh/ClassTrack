import type { ImportMethod } from '~/store/slices/uiSlice'

/**
 * 导入方式的**可用性策略**。
 *
 * 为什么要有这个模块：可选项取决于「平台 × 学校 × 原生插件」三个维度的组合（六种），
 * 埋在 `ImportSchoolStep` 的 JSX 里既测不了也容易在各处漂移。这里只做纯映射，
 * 组件只负责把它渲染出来（`app/components/import-flow/ImportMethodList.tsx`）。
 *
 * 现行口径（2026-09-22，用户确认）：**安卓端只留「应用内打开教务系统」+「导入已有数据（备份）」**，
 * 解析器那条路（书签脚本 → 导出 JSON → 上传）在安卓上整体不出现 —— 浏览器当然仍保留它。
 */

/** 方式列表下方需要给用户的一句提示。 */
export type ImportMethodNoticeCode = 'ANDROID_UNSUPPORTED_SCHOOL'

/** 一种环境下、某所学校可选的导入方式集合。 */
export type ImportMethodPolicy = {
  /**
   * 可选方式，顺序恒为规范序（`backup → parser → native-webview`）的子序列。
   *
   * 固定顺序是为了让「哪张卡在上面」不随平台变化：列表只是被过滤，不是被重排。
   */
  methods: ImportMethod[]
  /** 进入第 1 步时应选中的方式；一定在 `methods` 里。 */
  defaultMethod: ImportMethod
  /** 非 `null` 时在方式列表下方显示一条如实提示。 */
  noticeCode: ImportMethodNoticeCode | null
}

/** 规范序：所有平台的列表都是它的子序列。 */
const CANONICAL_ORDER: readonly ImportMethod[] = ['backup', 'parser', 'native-webview']

/**
 * 提示文案表。
 *
 * **必须如实且可行动**：安卓上这所学校确实没有应用内导入（原生适配器只有天津理工大学一个），
 * 所以文案指路到一个安卓上真实存在的方式（备份导入），而不是说「敬请期待」。
 *
 * 换行是刻意的：面板用 `whitespace-pre-line` 渲染成两行。
 *
 * ⚠️ 文案里点了校名。将来若有第二所学校也走这条支路，这里要改成按校名参数化，
 * 而不是再堆一条几乎一样的文案。
 */
export const IMPORT_METHOD_NOTICE: Record<ImportMethodNoticeCode, string> = {
  ANDROID_UNSUPPORTED_SCHOOL: '安卓暂不支持天津工业大学的应用内导入。\n请改用「导入已有数据」恢复课程表。',
}

/**
 * 计算某个环境 + 某所学校下的可选导入方式。
 *
 * @param input `android` 必须是「是不是安卓客户端」（`Capacitor.getPlatform() === 'android'`）而不是
 *   「插件是否注册」—— 天工没有适配器，但它同样必须进入安卓收窄后的口径。
 *   `nativeImportAvailable` 是 `isNativeCourseImportAvailable()`，`hasNativeAdapter` 来自
 *   `getNativeCourseImportAdapter(schoolId)`。
 * @returns 可选方式、默认方式与提示码；非安卓的结果与收窄前的现状逐字一致。
 */
export function resolveImportMethodPolicy(input: {
  android: boolean
  nativeImportAvailable: boolean
  hasNativeAdapter: boolean
}): ImportMethodPolicy {
  // 能真的用起来才列出来：光有适配器而插件没注册，点了也是空的。
  const nativeUsable = input.nativeImportAvailable && input.hasNativeAdapter

  const methods = CANONICAL_ORDER.filter((method) => {
    if (method === 'native-webview') return nativeUsable
    // 安卓端不提供解析器那条路（书签脚本与 JSON 上传在应用内没有落点）。
    if (method === 'parser') return !input.android
    return true
  })

  return {
    methods: [...methods],
    // 安卓上应用内导入就是主路径；用不了（天工）时退到唯一剩下的备份导入。
    defaultMethod: input.android ? (nativeUsable ? 'native-webview' : 'backup') : 'parser',
    // 只有「这所学校在安卓上没有原生适配器」才需要解释；插件缺失是环境问题，不是学校问题。
    noticeCode: input.android && !input.hasNativeAdapter ? 'ANDROID_UNSUPPORTED_SCHOOL' : null,
  }
}

/**
 * 把「当前选中的方式」收敛到策略允许的值。
 *
 * 换学校后当前方式可能不再合法（安卓从天理切到天工，`native-webview` 就没了），
 * 这里给出该改选什么：合法就原样保留（用户的选择不该被无谓重置），否则落到 `defaultMethod`。
 *
 * @param policy 目标环境的策略。
 * @param current 当前选中的方式（可能来自持久化之外的任意来源）。
 * @returns 应当生效的方式。
 */
export function normalizeImportMethod(policy: ImportMethodPolicy, current: ImportMethod): ImportMethod {
  return policy.methods.includes(current) ? current : policy.defaultMethod
}
