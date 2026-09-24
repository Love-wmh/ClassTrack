import { hasGuideFlag, markGuideFlag } from './guide-storage'
import type { GuideStorage } from './guide-storage'

/**
 * 加桌引导之后那段**一次性**引导：提示可以前往个人中心做更多设置。
 *
 * 与加桌引导（`widget-guide.ts`）同构，因此两段引导的「该不该弹 + 文案」都可以被 vitest 钉住，
 * 弹窗本身在 `app/components/native-widget/ProfileGuideDialog.tsx`，挂载点与加桌引导并列在 `root.tsx`。
 *
 * **它是我们唯一推个人中心的地方，措辞必须指向那里真实存在的设置**（学期、小工具样式、应用更新、
 * 数据备份导出），否则又是一句空话。
 */
export const PROFILE_GUIDE_STORAGE_KEY = 'class-track-profile-guide-seen'

/** 引导弹窗标题。 */
export const PROFILE_GUIDE_TITLE = '去个人中心看看'

/** 引导弹窗说明：先交代桌面卡片已经放好了，再说清个人中心里有什么。 */
export const PROFILE_GUIDE_DESCRIPTION = '桌面卡片已经放好了。学期、样式、更新与数据备份这些设置都在个人中心。'

/** 主按钮：跳到个人中心。 */
export const PROFILE_GUIDE_PRIMARY_ACTION = '前往'

/** 次按钮：只关掉，不做任何跳转。 */
export const PROFILE_GUIDE_SECONDARY_ACTION = '暂时不用'

/**
 * 这台设备上是不是已经读过第二段引导。
 *
 * @param storage 存储实现；省略时用 `window.localStorage`。
 * @returns 读到标记为 `true`；没有存储、读失败、没标记一律 `false`（当作没读过）。
 */
export function hasSeenProfileGuide(storage?: GuideStorage | null): boolean {
  return hasGuideFlag(PROFILE_GUIDE_STORAGE_KEY, storage)
}

/**
 * 记下「这台设备已经读过第二段引导」。
 *
 * **在决定要弹的那一刻写**（第一段引导关闭、判断该弹之后）：中途被杀 / 崩溃不会导致下次再打扰一次。
 *
 * @param storage 存储实现；省略时用 `window.localStorage`。
 */
export function markProfileGuideSeen(storage?: GuideStorage | null): void {
  markGuideFlag(PROFILE_GUIDE_STORAGE_KEY, storage)
}

/**
 * 关闭第一段引导时该不该接着弹第二段。
 *
 * 两个条件缺一不可：**这台设备真的有小工具**（浏览器 / PWA / iOS 上第一段引导本身就不出现），
 * 且**还没读过**（一次性打扰）。
 *
 * @param input `nativeWidgetAvailable` 来自 `isNativeWidgetSnapshotAvailable()`；`seen` 来自 `hasSeenProfileGuide()`。
 * @returns 该弹时为 `true`。
 */
export function shouldShowProfileGuide(input: { nativeWidgetAvailable: boolean; seen: boolean }): boolean {
  return input.nativeWidgetAvailable && !input.seen
}
