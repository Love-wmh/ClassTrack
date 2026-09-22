import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { resolveImportMethodPolicy } from '~/lib/import-methods'
import { ImportMethodList } from './ImportMethodList'

/** 收窄后的安卓现场：只剩备份 + 应用内。 */
const androidWithAdapter = resolveImportMethodPolicy({ android: true, nativeImportAvailable: true, hasNativeAdapter: true })
/** 安卓 + 天工：没有原生适配器，只剩备份 + 一条指路提示。 */
const androidWithoutAdapter = resolveImportMethodPolicy({ android: true, nativeImportAvailable: true, hasNativeAdapter: false })
/** 浏览器 / PWA：三张卡照旧（回归护栏）。 */
const webWithAdapter = resolveImportMethodPolicy({ android: false, nativeImportAvailable: true, hasNativeAdapter: true })

function render(
  policy: Parameters<typeof ImportMethodList>[0]['policy'],
  selectedMethod: Parameters<typeof ImportMethodList>[0]['selectedMethod']
) {
  return renderToStaticMarkup(createElement(ImportMethodList, { policy, selectedMethod, onSelect: () => undefined }))
}

describe('导入方式列表', () => {
  it('安卓 + 天理：应用内 + 备份，没有解析器卡，也不给提示', () => {
    const html = render(androidWithAdapter, 'native-webview')

    expect(html).toContain('应用内打开教务系统')
    expect(html).toContain('导入已有数据')
    expect(html).not.toContain('从课程表解析')
    expect(html).not.toContain('安卓暂不支持')
    expect(html).toContain('data-method-count="2"')
  })

  it('安卓 + 天工：只剩备份，并给出如实指路提示', () => {
    const html = render(androidWithoutAdapter, 'backup')

    expect(html).toContain('导入已有数据')
    expect(html).not.toContain('应用内打开教务系统')
    expect(html).not.toContain('从课程表解析')
    expect(html).toContain('data-method-count="1"')
    expect(html).toContain('安卓暂不支持天津工业大学的应用内导入')
    expect(html).toContain('请改用「导入已有数据」恢复课程表')
  })

  it('非安卓：三张卡都在（书签脚本那条路不能被收掉）', () => {
    const html = render(webWithAdapter, 'parser')

    expect(html).toContain('导入已有数据')
    expect(html).toContain('从课程表解析')
    expect(html).toContain('应用内打开教务系统')
    expect(html).toContain('data-method-count="3"')
    expect(html).not.toContain('安卓暂不支持')
  })

  it('选中的那张卡带 primary 边框（点击目标与选中态对得上）', () => {
    const html = render(androidWithAdapter, 'backup')

    expect(html).toContain('border-primary')
  })
})
