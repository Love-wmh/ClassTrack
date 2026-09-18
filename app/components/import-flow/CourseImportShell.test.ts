import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { CourseImportShell } from './CourseImportShell'

const baseProps = {
  term: '2025-2026-2',
  onTermChange: () => undefined,
  firstWeekStartDate: '2025-09-01',
  onFirstWeekStartDateChange: () => undefined,
  error: null,
}

describe('CourseImportShell', () => {
  it('renders the shared shadcn form and failed state', () => {
    const html = renderToStaticMarkup(createElement(CourseImportShell, { ...baseProps, status: 'failed', error: '网络失败，请重试' }))

    expect(html).toContain('应用内导入课程表')
    expect(html).toContain('学年学期代码')
    expect(html).toContain('第一周第一天')
    expect(html).toContain('网络失败，请重试')
    expect(html).toContain('bg-card')
  })

  it('renders native recovery actions for the ready state', () => {
    const html = renderToStaticMarkup(
      createElement(CourseImportShell, {
        ...baseProps,
        variant: 'native',
        status: 'ready',
        onBack: () => undefined,
        onRefresh: () => undefined,
        onRetry: () => undefined,
        onPrimary: () => undefined,
      })
    )

    expect(html).toContain('返回')
    expect(html).toContain('刷新')
    expect(html).toContain('请求导入')
    expect(html).not.toContain('确认学年学期代码正确，然后点击“打开教务系统并导入”。')
    expect(html).not.toContain('min-h-full')
  })

  it('keeps the active native chrome compact for loading and captured states', () => {
    const loadingHtml = renderToStaticMarkup(createElement(CourseImportShell, { ...baseProps, variant: 'native', status: 'opening' }))
    const capturedHtml = renderToStaticMarkup(createElement(CourseImportShell, { ...baseProps, variant: 'native', status: 'captured' }))

    expect(loadingHtml).toContain('正在打开教务系统')
    expect(loadingHtml).not.toContain('确认学年学期代码正确，然后点击“打开教务系统并导入”。')
    expect(capturedHtml).toContain('已捕获课表响应')
    expect(capturedHtml).toContain('导入当前课表')
  })
})
