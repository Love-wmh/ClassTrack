/**
 * 一次性引导的「已读标记」存储读写。
 *
 * 两段引导（导入后的加桌引导、加桌之后那段「去个人中心」）共用这一份：它们都是
 * 「这台设备上别再打扰我」的一次性状态，各自存在自己的 localStorage 键里，且都**不进**
 * Zustand persist 的 `partialize` —— 那是备份 JSON 的字段清单，一次性引导不该跟着备份搬到新设备。
 *
 * 只依赖 `getItem` / `setItem` 的存储形状（而不是完整的 `Storage`），便于测试注入假实现，
 * 也让「存储抛异常」这类边界变得好测（隐私模式下读 `window.localStorage` 本身就会抛）。
 */

/** 标记的写入值；只有等于它才算「读过」。 */
const SEEN_VALUE = '1'

export type GuideStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * 取实际使用的存储。
 *
 * `undefined`（没传）表示「用 `window.localStorage`」，显式传 `null` 表示「这台环境没有存储」——
 * 两者必须区分：前者是正常调用，后者是测试要覆盖的无存储分支。
 *
 * @param storage 存储实现；省略时用 `window.localStorage`。
 * @returns 存储实现；取不到时为 `null`。
 */
export function resolveGuideStorage(storage?: GuideStorage | null): GuideStorage | null {
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
 * 某个键上的标记是不是「已读」。
 *
 * @param key localStorage 键。
 * @param storage 存储实现；省略时用 `window.localStorage`。
 * @returns 读到标记为 `true`；没有存储、读失败、值不是约定值一律 `false`
 *     （当作没读过，宁可多弹一次也不静默吞掉引导）。
 */
export function hasGuideFlag(key: string, storage?: GuideStorage | null): boolean {
  const target = resolveGuideStorage(storage)
  if (!target) return false

  try {
    return target.getItem(key) === SEEN_VALUE
  } catch {
    return false
  }
}

/**
 * 记下「这台设备已经读过引导」。
 *
 * **在决定要弹的那一刻写**，不是关闭时才写：中途被杀 / 崩溃不会导致下次再打扰一次。
 *
 * @param key localStorage 键。
 * @param storage 存储实现；省略时用 `window.localStorage`。
 */
export function markGuideFlag(key: string, storage?: GuideStorage | null): void {
  const target = resolveGuideStorage(storage)
  if (!target) return

  try {
    target.setItem(key, SEEN_VALUE)
  } catch {
    // 配额满 / 隐私模式下写不进去：后果只是「可能再弹一次」，不该因此打断导入后的流程。
  }
}
