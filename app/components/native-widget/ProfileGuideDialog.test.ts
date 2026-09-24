import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Dialog } from '~/components/ui/dialog'
import {
  PROFILE_GUIDE_DESCRIPTION,
  PROFILE_GUIDE_PRIMARY_ACTION,
  PROFILE_GUIDE_SECONDARY_ACTION,
  PROFILE_GUIDE_TITLE,
} from '~/lib/profile-guide'
import { ProfileGuideBody } from './ProfileGuideDialog'

/**
 * 只渲染 body，不渲染 `DialogContent`（它走 Portal，静态渲染拿不到内容）。
 *
 * 外面套一个 `Dialog` root 是必须的：`DialogTitle` / `DialogDescription` 从 root 取上下文，
 * 裸渲染会直接抛错 —— 这道包装也让「标题真的接进了 Radix 的无障碍树」这件事被测试钉住。
 */
function render() {
  return renderToStaticMarkup(
    createElement(Dialog, { open: true }, createElement(ProfileGuideBody, { onPrimary: () => undefined, onSecondary: () => undefined }))
  )
}

describe('第二段引导内容', () => {
  it('渲染标题、说明与两个按钮', () => {
    const html = render()

    expect(html).toContain(PROFILE_GUIDE_TITLE)
    expect(html).toContain(PROFILE_GUIDE_DESCRIPTION)
    expect(html).toContain(PROFILE_GUIDE_PRIMARY_ACTION)
    expect(html).toContain(PROFILE_GUIDE_SECONDARY_ACTION)
  })

  it('只有两个按钮、且没有输入控件（它只负责把用户送过去或让他走开）', () => {
    const html = render()

    expect(html.match(/<button/g)?.length).toBe(2)
    expect(html).not.toContain('<input')
  })
})
