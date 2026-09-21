import { describe, expect, it } from 'vitest'
import {
  getWidgetSnapshotErrorCode,
  getWidgetSnapshotErrorMessage,
  isNativeWidgetSnapshotAvailable,
  WidgetSnapshotError,
  widgetSnapshotPlugin,
} from './native-widget-snapshot'

describe('桌面小工具插件封装', () => {
  it('普通 Web 环境不会伪装成支持同步', () => {
    expect(isNativeWidgetSnapshotAvailable()).toBe(false)
  })

  it('Web 兜底实现不会抛出未捕获异常', async () => {
    // registerPlugin 在 Web 上会解析到 WidgetSnapshotWeb 实现。
    expect(await widgetSnapshotPlugin.consumePendingRoute()).toEqual({ route: null })
    expect(await widgetSnapshotPlugin.getExactAlarmStatus()).toEqual({ available: false, exact: false })
    expect(await widgetSnapshotPlugin.requestExactAlarmPermission()).toEqual({ launched: false, exact: false })
  })

  it('Web 上「添加到桌面」如实返回不支持，而不是假装成功', async () => {
    expect(await widgetSnapshotPlugin.requestPinWidget({ preset: 'cell_3x2' })).toEqual({
      supported: false,
      requested: false,
    })
  })

  it('Web 上读取 pin 确认结果如实返回未确认（没有原生侧就没有「被系统确认的放置」）', async () => {
    expect(await widgetSnapshotPlugin.consumePinResult()).toEqual({ confirmed: false, appWidgetId: null })
  })

  it('pushSnapshot 在 Web 上以 UNAVAILABLE 明确失败，而不是静默成功', async () => {
    await expect(widgetSnapshotPlugin.pushSnapshot({ snapshotJson: '{}' })).rejects.toThrow('当前环境不支持桌面小工具')
  })

  it('把 bridge 错误映射为可行动提示', () => {
    expect(getWidgetSnapshotErrorMessage(new WidgetSnapshotError('STORAGE_ERROR', 'native error'))).toBe(
      '桌面小工具数据写入失败，请稍后重试。'
    )
    expect(getWidgetSnapshotErrorMessage(new WidgetSnapshotError('PAYLOAD_TOO_LARGE', 'native error'))).toContain('过大')
    expect(getWidgetSnapshotErrorMessage(new Error('unknown'))).toBe('桌面小工具同步失败。')
  })

  it('只认识具名错误码，形状相似的对象不会误判', () => {
    expect(getWidgetSnapshotErrorCode(new WidgetSnapshotError('INVALID_PAYLOAD', 'x'))).toBe('INVALID_PAYLOAD')
    expect(getWidgetSnapshotErrorCode({ code: 'NOT_A_CODE' })).toBeUndefined()
    expect(getWidgetSnapshotErrorCode({ code: 42 })).toBeUndefined()
    expect(getWidgetSnapshotErrorCode(null)).toBeUndefined()
    expect(getWidgetSnapshotErrorCode('boom')).toBeUndefined()
  })
})
