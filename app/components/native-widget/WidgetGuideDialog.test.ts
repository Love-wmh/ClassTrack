import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Dialog } from '~/components/ui/dialog'
import { WIDGET_PIN_PRESETS, WIDGET_PIN_SIZE_TUNING_HINT } from '~/features/schedule/widgetPinPresets'
import {
  WIDGET_GUIDE_DESCRIPTION,
  WIDGET_GUIDE_PRIMARY_ACTION,
  WIDGET_GUIDE_SECONDARY_ACTION,
  WIDGET_GUIDE_TITLE,
} from '~/lib/widget-guide'
import { WidgetGuideBody } from './WidgetGuideDialog'

/**
 * 只渲染 body，不渲染 `DialogContent`（它走 Portal，静态渲染拿不到内容）。
 *
 * 外面套一个 `Dialog` root 是必须的：`DialogTitle` / `DialogDescription` 从 root 取上下文，
 * 裸渲染会直接抛错 —— 这道包装也让「标题真的接进了 Radix 的无障碍树」这件事被测试钉住。
 */
function render() {
  return renderToStaticMarkup(
    createElement(Dialog, { open: true }, createElement(WidgetGuideBody, { onPrimary: () => undefined, onSecondary: () => undefined }))
  )
}

describe('加桌引导内容', () => {
  it('渲染标题、说明与两个按钮', () => {
    const html = render()

    expect(html).toContain(WIDGET_GUIDE_TITLE)
    expect(html).toContain(WIDGET_GUIDE_DESCRIPTION)
    expect(html).toContain(WIDGET_GUIDE_PRIMARY_ACTION)
    expect(html).toContain(WIDGET_GUIDE_SECONDARY_ACTION)
  })

  it('把两档摆法都写出来（用户不用先去面板才知道有什么可选）', () => {
    const html = render()

    for (const preset of WIDGET_PIN_PRESETS) {
      expect(html).toContain(preset.name)
      expect(html).toContain(preset.cell)
    }
  })

  it('写清「尺寸可以自己调」，且用的就是面板那份常量', () => {
    expect(render()).toContain(WIDGET_PIN_SIZE_TUNING_HINT)
  })

  it('步骤是有序列表（引导的语序本身有先后）', () => {
    const html = render()

    expect(html).toContain('<ol')
    expect(html.match(/<li/g)?.length).toBeGreaterThanOrEqual(2)
  })
})
