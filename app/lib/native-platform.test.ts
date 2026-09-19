import { afterEach, describe, expect, it, vi } from 'vitest'

const isNativePlatform = vi.fn()

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
}))

describe('原生平台检测', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    isNativePlatform.mockReset()
  })

  it('在 Web 或 SSR 环境返回 false', async () => {
    const { isNativeApp } = await import('./native-platform')
    expect(isNativeApp()).toBe(false)
    expect(isNativePlatform).not.toHaveBeenCalled()
  })

  it('在原生平台返回 Capacitor 的检测结果', async () => {
    vi.stubGlobal('window', {})
    isNativePlatform.mockReturnValue(true)

    const { isNativeApp } = await import('./native-platform')
    expect(isNativeApp()).toBe(true)
    expect(isNativePlatform).toHaveBeenCalledOnce()
  })
})
