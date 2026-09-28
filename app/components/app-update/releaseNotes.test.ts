import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Token } from 'marked'
import { renderNoteTokens, renderReleaseNotes, safeReleaseHref } from './releaseNotes'

/** 现网 release 正文原文（android-beta-18，`GET /releases?per_page=5` 实测）。 */
const REAL_NOTES = [
  'ClassTrack Android **1.0.18-beta**',
  '',
  '- commit: `2ead76b`',
  '- 包类型：签名 release 包，可直接覆盖安装上一个版本（数据保留）。',
  '- 下载 `ClassTrack-beta-latest.apk` 永远指向本页这个包。',
  '',
  '## 本次改动',
  '',
  '- chore(task): 补记 09-28 任务的 PR 链接 (2ead76b)',
  '- feat(schedule): 课表缺勤改为实色红框，未标记格子不再显出勤痕迹 (9f87a62)',
].join('\n')

function render(notes: string): string {
  return renderToStaticMarkup(createElement(Fragment, null, renderReleaseNotes(notes)))
}

function renderTokens(tokens: unknown[]): string {
  return renderToStaticMarkup(createElement(Fragment, null, renderNoteTokens(tokens as Token[])))
}

describe('release 正文的真实渲染', () => {
  it('把 `## 本次改动`、粗体与列表渲染成元素，而不是字面量', () => {
    const html = render(REAL_NOTES)

    expect(html).toContain('本次改动')
    expect(html).toContain('<strong')
    expect(html).toContain('<ul')
    expect(html).toContain('<li')
    // 三个可以立刻看出的「没渲染」特征：粗体标记、标题井号、行内代码反引号。
    expect(html).not.toContain('**')
    expect(html).not.toContain('##')
    expect(html).not.toContain('`')
  })

  it('版本号仍在（粗体不被吞掉，只是不再看到 `**`）', () => {
    expect(render(REAL_NOTES)).toContain('1.0.18-beta')
  })

  it('行内代码与围栏代码块都原样展示，不做高亮、不执行', () => {
    const html = render('提交 `2ead76b`\n\n```js\nconst a = 1 < 2\n```')

    expect(html).toContain('<code')
    expect(html).toContain('2ead76b')
    expect(html).toContain('<pre')
    expect(html).toContain('const a = 1 &lt; 2')
  })

  it('有序列表用 <ol>，无序列表用 <ul>', () => {
    expect(render('1. 甲\n2. 乙')).toContain('<ol')
    expect(render('- 甲\n- 乙')).toContain('<ul')
  })

  it('引用、分隔线与斜体/删除线都有对应元素', () => {
    const html = render('> 引用一句\n\n---\n\n*斜* ~~删~~')

    expect(html).toContain('<blockquote')
    expect(html).toContain('<hr')
    expect(html).toContain('<em')
    expect(html).toContain('<del')
  })

  it('空正文返回 null，调用方给占位文案', () => {
    expect(renderReleaseNotes('')).toBeNull()
    expect(renderReleaseNotes('   \n  ')).toBeNull()
  })
})

describe('链接白名单', () => {
  it('http / https 生成锚点并带 rel="noreferrer"', () => {
    const html = render('[发布页](https://github.com/Love-wmh/ClassTrack/releases/tag/v1.2.0)')

    expect(html).toContain('href="https://github.com/Love-wmh/ClassTrack/releases/tag/v1.2.0"')
    expect(html).toContain('rel="noreferrer"')
    expect(html).toContain('发布页')
  })

  it('javascript: 与 data: 协议不生成锚点，只留可读文本', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
      const html = render(`[点我](${href})`)

      expect(html).not.toContain('<a')
      expect(html).not.toContain('href')
      expect(html).toContain('点我')
    }
  })

  it('锚点不带 target：Capacitor 的 _blank 在新窗口被禁用时可能什么都不发生', () => {
    expect(render('[发布页](https://example.com/a)')).not.toContain('target=')
  })

  it('safeReleaseHref 只放行 http(s)，畸形值与相对地址一律拒绝', () => {
    expect(safeReleaseHref('https://example.com/a')).toBe('https://example.com/a')
    expect(safeReleaseHref('http://example.com/a')).toBe('http://example.com/a')
    expect(safeReleaseHref('javascript:alert(1)')).toBeNull()
    expect(safeReleaseHref('data:text/html,x')).toBeNull()
    expect(safeReleaseHref('ftp://example.com/a')).toBeNull()
    expect(safeReleaseHref('/releases/tag/v1')).toBeNull()
    expect(safeReleaseHref('')).toBeNull()
  })
})

describe('远端内容不产生元素', () => {
  it('原始 HTML 标签按纯文本展示', () => {
    const html = render('<script>alert(1)</script>\n\n<div onclick="x">块</div>')

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<div onclick')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('块')
  })

  it('HTML 里的 img / onerror 不会变成元素或属性', () => {
    const html = render('<img src=x onerror=alert(1)>')

    expect(html).not.toContain('<img')
    // 整段按文本渲染：`onerror=` 这些字面量会以转义后的样子出现在可见文本里，但绝不成属性。
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('行内 HTML 混在正文里也不解析', () => {
    const html = render('前 <b>粗</b> 后')

    expect(html).not.toContain('<b>')
    expect(html).toContain('前')
    expect(html).toContain('后')
  })

  it('图片不渲染元素，只留替代文本（不加载任何远端资源）', () => {
    const html = render('![课程表截图](https://example.com/a.png)')

    expect(html).not.toContain('<img')
    expect(html).not.toContain('https://example.com/a.png')
    expect(html).toContain('课程表截图')
  })

  it('表格降级成文本行，不生成 <table>', () => {
    const html = render('| 列一 | 列二 |\n| --- | --- |\n| 甲 | 乙 |')

    expect(html).not.toContain('<table')
    expect(html).toContain('列一 ｜ 列二')
    expect(html).toContain('甲 ｜ 乙')
  })
})

describe('token 兜底（模拟 marked 升级）', () => {
  it('陌生 token 带子 token → 递归渲染，不丢文本、不抛错', () => {
    const html = renderTokens([{ type: 'speakerNotes', raw: '**x**', tokens: [{ type: 'text', raw: '子文本', text: '子文本' }] }])

    expect(html).toContain('子文本')
  })

  it('陌生 token 只有 raw → 按文本渲染', () => {
    expect(renderTokens([{ type: 'unknownBlock', raw: '裸文本' }])).toContain('裸文本')
  })

  it('陌生 token 既没有 tokens 也没有文本 → 渲染成空，不抛错', () => {
    expect(renderTokens([{ type: 'mystery' }])).toBe('')
  })

  it('字段形态不对（tokens 不是数组）→ 按文本处理，不抛错', () => {
    expect(renderTokens([{ type: 'weird', raw: '还是文本', tokens: 'not-an-array' }])).toContain('还是文本')
  })

  it('标签页 / 勾选框 / 链接定义这些降级 token 不产生元素', () => {
    const html = renderTokens([
      { type: 'def', raw: '', tag: 'x', href: 'https://example.com', title: '' },
      { type: 'checkbox', raw: '[x] ', checked: true },
      { type: 'space', raw: '\n' },
    ])

    expect(html).toBe('')
  })
})
