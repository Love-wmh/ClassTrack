import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 源码守卫：把「课表尺度必须由格子尺寸推导」这件事从人工约定变成会失败的测试。
 *
 * 这些断言对应的都是真机上真实发生过的回归（见任务 `09-24-schedule-responsive-sizing`
 * 的 `research/real-device-analysis.md`）：改动前同一个屏幕里出现 10px 与 8px 两种课名字号，
 * 根因就是与格子尺寸无关的硬编码 px 字号 + 视口布尔值判据。
 */
const SCHEDULE_DIR = fileURLToPath(new URL('.', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!/\.tsx?$/.test(entry.name)) return []
    if (entry.name.endsWith('.test.ts')) return []
    return [full]
  })
}

/** 去掉整行注释，避免注释里为了说明历史而写的例子触发守卫。 */
function codeLines(source: string): string[] {
  return source.split('\n').filter((line) => {
    const trimmed = line.trim()
    return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
  })
}

const FILES = sourceFiles(SCHEDULE_DIR)

describe('schedule 目录源码守卫', () => {
  it('确实扫到了课表源码（防止守卫因为路径变化静默空跑）', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(8)
    expect(FILES.some((file) => file.endsWith('ScheduleCourseCell.tsx'))).toBe(true)
    expect(FILES.some((file) => file.endsWith('ScheduleTable.tsx'))).toBe(true)
  })

  it('没有任何与格子尺寸无关的 px 字号（AC-A9）', () => {
    const offenders: string[] = []

    for (const file of FILES) {
      for (const line of codeLines(readFileSync(file, 'utf8'))) {
        if (/text-\[\d+px\]/.test(line)) offenders.push(`${file}: ${line.trim()}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('没有任何 sm: 断点（AC-C1：统一到 md: 768px，与 useIsMobile 一致）', () => {
    const offenders: string[] = []

    for (const file of FILES) {
      for (const line of codeLines(readFileSync(file, 'utf8'))) {
        if (/(^|[\s'"])sm:/.test(line)) offenders.push(`${file}: ${line.trim()}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('课程格组件不再依赖视口布尔值（AC-B2：判据必须是格子尺寸）', () => {
    const cell = readFileSync(join(SCHEDULE_DIR, 'ScheduleCourseCell.tsx'), 'utf8')

    expect(cell).not.toContain('useIsMobile')
    expect(cell).not.toContain('use-mobile')
    // 也不许再用「按 px 硬减」的兜底
    expect(cell).not.toMatch(/baseName|baseRoom/)
    expect(cell).not.toMatch(/style\.fontSize/)
    expect(cell).not.toMatch(/style\.lineHeight/)
  })

  it('课程格的字号与行高只能来自 --cc-* 容器变量', () => {
    const cell = readFileSync(join(SCHEDULE_DIR, 'ScheduleCourseCell.tsx'), 'utf8')

    expect(cell).toContain('CELL_FONT_CLASS')
    expect(cell).not.toMatch(/leading-\[/)
    expect(cell).not.toMatch(/leading-\d/)
  })

  it('尺度常量集中在 cellScale.ts，组件里不出现第二份数值', () => {
    const cell = readFileSync(join(SCHEDULE_DIR, 'ScheduleCourseCell.tsx'), 'utf8')
    const table = readFileSync(join(SCHEDULE_DIR, 'ScheduleTable.tsx'), 'utf8')

    expect(cell).not.toMatch(/cqw|cqh/)
    expect(table).not.toMatch(/cqw|cqh/)
    expect(cell).toContain("from './cellScale'")
    expect(table).toContain("from './cellScale'")
  })
})
