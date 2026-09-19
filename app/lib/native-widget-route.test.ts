import { matchRoutes } from 'react-router'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'

import routes from '../routes'
import { WIDGET_ROUTE_SCHEDULE } from './native-widget-snapshot'

type RouteConfigEntry = {
  index?: boolean
  path?: string
  children?: RouteConfigEntry[]
}

/**
 * 把 `app/routes.ts` 的配置转成 `matchRoutes` 可用的对象树。
 *
 * 与 `native-shell-url.test.ts` 的做法一致：这条契约必须由**真实路由表**守住，
 * 而不是靠两边各写一份字符串。
 */
function toRouteObjects(entries: RouteConfigEntry[]): RouteObject[] {
  return entries.map(({ index, path, children }) => {
    if (index) return { index: true }
    return {
      ...(path ? { path } : {}),
      ...(children ? { children: toRouteObjects(children) } : {}),
    }
  })
}

describe('小工具点击跳转路由', () => {
  const routeObjects = toRouteObjects(routes)

  it('课表页路由必须能匹配到客户端真实路由', () => {
    // 课表是 index 路由：`/` 命中，`/schedule` 不命中。
    // 曾经因为硬编码 `/schedule` 导致点击小工具后客户端渲染 404，
    // 而 ErrorBoundary 会替换整棵组件树，把小工具同步组件一起卸载掉。
    expect(matchRoutes(routeObjects, WIDGET_ROUTE_SCHEDULE)).not.toBeNull()
    expect(matchRoutes(routeObjects, '/schedule')).toBeNull()
  })

  it('不携带查询串或哈希，避免与原生 shell 引导参数混淆', () => {
    expect(WIDGET_ROUTE_SCHEDULE.startsWith('/')).toBe(true)
    expect(WIDGET_ROUTE_SCHEDULE).not.toContain('?')
    expect(WIDGET_ROUTE_SCHEDULE).not.toContain('#')
    expect(WIDGET_ROUTE_SCHEDULE).not.toContain('native-shell')
  })
})
