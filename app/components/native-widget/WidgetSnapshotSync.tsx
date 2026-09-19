import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { consumeWidgetPendingRoute } from '~/lib/native-widget-snapshot'
import { useWidgetSnapshotSync } from '~/hooks/useWidgetSnapshotSync'

/**
 * 课表快照 → 原生小工具的同步挂载点，同时消费「点击小工具带来的待跳转路由」。
 *
 * 自身不渲染任何内容，只负责在应用外壳（`root.tsx` 的 `Layout`）里激活这两件事，
 * 与 `<PwaUpdatePrompt />` 的挂载方式一致。原生导入壳（`?native-shell=1`）不挂载它：
 * 那个 WebView 里没有课表数据。
 */
export default function WidgetSnapshotSync() {
  useWidgetSnapshotSync()
  useWidgetPendingRoute()

  return null
}

/**
 * 冷启动或从桌面小工具唤起时，把用户直接送到课表页。
 *
 * 路由来源是 `MainActivity` 从 Intent extra 里取出、经原生白名单过滤后的固定常量，
 * `consumeWidgetPendingRoute` 会再校验一次；没有待跳转时什么都不做。
 */
function useWidgetPendingRoute() {
  const navigate = useNavigate()

  useEffect(() => {
    let active = true

    void consumeWidgetPendingRoute().then((route) => {
      if (active && route) navigate(route)
    })

    return () => {
      active = false
    }
  }, [navigate])
}
