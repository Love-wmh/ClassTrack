import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Dialog } from '~/components/ui/dialog'
import type { UpdateCandidate } from '~/lib/app-update/channels'
import { UpdateAvailableBody } from './UpdateAvailableDialog'
import { UPDATE_DOWNLOAD_ACTION, UPDATE_LATER_ACTION, UPDATE_SKIP_ACTION, formatReleaseNotes } from './updateDialogCopy'

const candidate: UpdateCandidate = {
  version: '1.2.0',
  prerelease: false,
  tag: 'v1.2.0',
  title: 'ClassTrack Android 1.2.0',
  notes: 'ClassTrack Android **1.2.0**\n\n## 本次改动\n\n- 修掉某个问题 (abc1234)',
  pageUrl: 'https://github.com/Love-wmh/ClassTrack/releases/tag/v1.2.0',
}

/**
 * 只渲染 body，不渲染 `DialogContent`（它走 Portal，静态渲染拿不到内容）。
 * 外面套 `Dialog` root 是必须的：`DialogTitle` / `DialogDescription` 从 root 取上下文。
 */
function render(overrides: Partial<UpdateCandidate> = {}) {
  return renderToStaticMarkup(
    createElement(
      Dialog,
      { open: true },
      createElement(UpdateAvailableBody, {
        candidate: { ...candidate, ...overrides },
        currentVersion: '1.0.10-beta',
        onDismiss: () => {},
        onSkip: () => {},
      })
    )
  )
}

describe('更新模态框内容', () => {
  it('写明新版本号、当前版本到新版本的对比与通道标签', () => {
    const html = render()

    expect(html).toContain('发现新版本 1.2.0')
    expect(html).toContain('1.0.10-beta → 1.2.0')
    expect(html).toContain('正式版')
  })

  it('测试版候选标成测试版', () => {
    expect(render({ version: '1.0.11-beta', prerelease: true })).toContain('测试版')
  })

  it('三个按钮都在，且下载是锚点指向白名单里的 release 页', () => {
    const html = render()

    expect(html).toContain(UPDATE_DOWNLOAD_ACTION)
    expect(html).toContain(UPDATE_LATER_ACTION)
    expect(html).toContain(UPDATE_SKIP_ACTION)
    expect(html).toContain('href="https://github.com/Love-wmh/ClassTrack/releases/tag/v1.2.0"')
  })

  it('更新说明按纯文本渲染：markdown 粗体标记被去掉，且没有任何注入的标签', () => {
    const html = render()

    expect(html).not.toContain('**')
    expect(html).toContain('本次改动')
    // 正文里的尖括号/脚本不会被当成标签执行。
    expect(html).not.toContain('<script')
  })

  it('没有更新说明时给一句占位，而不是空框', () => {
    expect(render({ notes: '' })).toContain('本次发布没有填写更新说明。')
  })
})

describe('更新说明的纯文本清理', () => {
  it('只去掉粗体标记并裁掉首尾空白', () => {
    expect(formatReleaseNotes('  **1.2.0** 已发布\n')).toBe('1.2.0 已发布')
  })

  it('不去碰其它字符（不解析 markdown、不生成标签）', () => {
    expect(formatReleaseNotes('<b>x</b> & `code`')).toBe('<b>x</b> & `code`')
  })
})
