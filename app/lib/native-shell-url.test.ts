import { matchRoutes } from 'react-router'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'

import routes from '../routes'
import { NATIVE_SHELL_BOOT_PATH, NATIVE_SHELL_QUERY } from './native-shell-url'

type RouteConfigEntry = {
  index?: boolean
  path?: string
  children?: RouteConfigEntry[]
}

function toRouteObjects(entries: RouteConfigEntry[]): RouteObject[] {
  return entries.map(({ index, path, children }) => {
    if (index) return { index: true }
    return {
      ...(path ? { path } : {}),
      ...(children ? { children: toRouteObjects(children) } : {}),
    }
  })
}

describe('原生 shell 引导 URL', () => {
  const routeObjects = toRouteObjects(routes)

  it('使用客户端 index 路由作为引导路径', () => {
    expect(matchRoutes(routeObjects, NATIVE_SHELL_BOOT_PATH)).not.toBeNull()
    expect(matchRoutes(routeObjects, '/index.html')).toBeNull()
  })

  it('携带原生 shell 查询参数', () => {
    const url = new URL(`https://appassets.androidplatform.net${NATIVE_SHELL_BOOT_PATH}?${NATIVE_SHELL_QUERY}`)
    expect(url.searchParams.get('native-shell')).toBe('1')
  })
})
