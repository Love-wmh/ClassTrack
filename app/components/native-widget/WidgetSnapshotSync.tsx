import { useWidgetSnapshotSync } from '~/hooks/useWidgetSnapshotSync'

/**
 * 课表快照 → 原生小工具的同步挂载点。
 *
 * 自身不渲染任何内容，只负责在应用外壳（`root.tsx` 的 `Layout`）里激活同步 hook，
 * 与 `<PwaUpdatePrompt />` 的挂载方式一致。原生导入壳（`?native-shell=1`）不挂载它：
 * 那个 WebView 里没有课表数据。
 */
export default function WidgetSnapshotSync() {
  useWidgetSnapshotSync()

  return null
}
