#!/usr/bin/env node
/**
 * 课表尺度浏览器验收：遍历视口 × 场景，断言任务 `09-24-schedule-responsive-sizing` 的 AC。
 *
 * 用法（必须与 dev server 在同一次 bash 调用里跑，见 run-verify.sh）：
 *   node research/verify-responsive-sizing.mjs [--out /tmp/claude/verify.json]
 *
 * 设计要点
 * - 取数交给 `research/browser-probe.js`（同一份口径，阶段 0 的基线也是它采的）。
 * - 最硬的一条断言是「浏览器算出的 computed 字号 == 公式预测值」：脚本用探针报回的
 *   容器内容盒尺寸（wrapper 的 clientWidth / clientHeight，因为那层没有内边距与边框）
 *   按 `cellScale.ts` 的同一公式复算。这条同时钉住了「cq 单位按使用处的容器解析」这个地基假设。
 * - 下面的常量必须与 `app/features/schedule/cellScale.ts` 保持一致；公式侧已由
 *   `cellScale.test.ts` 的 11 个用例钉住，这里只做浏览器侧的复核。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROBE = readFileSync(join(HERE, 'browser-probe.js'), 'utf8')
const SEED_FIXTURE = join(HERE, 'seed-schedule-fixture.js')

/** 与 cellScale.ts 的 CELL_SCALE 同步（只抄断言需要的项）。 */
const SCALE = {
  name: { cqw: 24, cqh: 30, min: 8, max: 15 },
  room: { cqw: 21.5, cqh: 27, min: 8, max: 12 },
}
const LINE_HEIGHT = { name: 1.15, room: 1.2 }

/** 与 cellScale.ts 的 CELL_FALLBACK_SCALES 同步。 */
const CELL_FALLBACK_SCALES = [0.95, 0.9, 0.85, 0.8, 0.75]

/** 「收起整周无课的日期列」的最小列宽保护，与 ScheduleTable.tsx 的 COLLAPSED_DAY_TRACK 一致。 */
const COLLAPSED_MIN_TRACK_PX = 28

const VIEWPORTS = [
  { width: 240, height: 600 },
  { width: 320, height: 640 },
  { width: 360, height: 794 },
  { width: 412, height: 794 },
  { width: 480, height: 800 },
  { width: 600, height: 800 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1440, height: 900 },
]
/** 桌面端四个断点，供 AC-C2 用。 */
const BREAKPOINT_VIEWPORTS = [{ width: 640, height: 800 }, { width: 700, height: 800 }, { width: 767, height: 800 }, { width: 768, height: 800 }]

/** `--only` 选中的分段（`finish` 也要记进报告，所以放在模块作用域）。 */
let only = 'abcdef'

/** 「收起整周无课的日期列」开启态的持久化内容（E / F 两个分段块共用，所以放在模块作用域）。 */
const DISPLAY_COLLAPSED = {
  state: { showAttendanceStatus: true, showOutOfWeekCourses: false, collapseEmptyWeekdayColumns: true },
  version: 0,
}

/** 参照格子：夹具里的短课名，永远放得下，因此它的字号就是纯 CSS 公式的输出。 */
const REFERENCE_CELL_NAME = '数据结构'

const allFontSizes = []
const failures = []
const notes = []
let assertions = 0

function check(ok, label, detail) {
  assertions += 1
  if (!ok) failures.push(detail ? `${label} — ${detail}` : label)
  return ok
}

function section(title) {
  notes.push(`\n### ${title}`)
}

function ab(args) {
  return execFileSync('agent-browser', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function probe() {
  const raw = ab(['eval', PROBE]).trim()
  const outer = JSON.parse(raw)
  return typeof outer === 'string' ? JSON.parse(outer) : outer
}

function setStorage(key, value) {
  ab(['storage', 'local', 'set', key, typeof value === 'string' ? value : JSON.stringify(value)])
}

function waitForCells(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const n = Number(ab(['eval', "String(document.querySelectorAll('[data-course-cell]').length)"]).trim().replace(/"/g, ''))
    if (n > 0) return n
    execFileSync('sleep', ['1'])
  }
  return 0
}

/** 复位到「D 组关闭 + 默认夹具」的共同前置状态。每个场景开头都调一次，这样 `--only` 分段跑也自洽。 */
function resetSeed() {
  openAt({ width: 360, height: 794 }, { seedText: seedStateText(), resetDisplay: true })
}

/**
 * 切视口 + 灌状态 + reload。
 *
 * **顺序是硬要求**：`storage local set` 之后必须**立刻** `reload`，中间不能夹任何命令
 * （包括 `set viewport`）。否则上一页实例会抢在 reload 前把它自己的内存状态回写进
 * localStorage，把刚写进去的夹具覆盖掉——表现为 reload 后 `cells=0`、落到空状态页。
 * 这条坑在规格里记过（「直接 eval 写 localStorage 会被已启动的 app 回写覆盖」），
 * 只是这里的形式更隐蔽：触发回写的是 `set viewport` 引起的重渲染。
 */
function openAt(viewport, options = {}) {
  const { seedText = null, display = null, resetDisplay = false } = options

  for (let attempt = 0; attempt < 3; attempt += 1) {
    ab(['set', 'viewport', String(viewport.width), String(viewport.height), '3'])
    if (seedText !== null) setStorage('class-track-storage', seedText)
    if (resetDisplay) ab(['storage', 'local', 'remove', 'class-track-schedule-display'])
    else if (display !== null) setStorage('class-track-schedule-display', display)
    ab(['reload'])

    const count = waitForCells(20000)
    if (count > 0) return count
  }

  return 0
}

/** 按 cellScale.ts 的同一公式复算字号。 */
function predict(spec, containerWidth, containerHeight, scale = 1) {
  const terms = []
  if (spec.cqw !== undefined) terms.push((spec.cqw * containerWidth) / 100)
  if (spec.cqh !== undefined) terms.push((spec.cqh * containerHeight) / 100)
  const base = Math.min(Math.max(Math.min(...terms), spec.min), spec.max)
  return Math.min(Math.max(base * scale, spec.min), spec.max)
}

function seedStateText(overrides = {}) {
  const captured = {}
  new Function('localStorage', readFileSync(SEED_FIXTURE, 'utf8'))({
    setItem: (k, v) => (captured[k] = String(v)),
    getItem: () => null,
  })
  const envelope = JSON.parse(captured['class-track-storage'])
  Object.assign(envelope.state, overrides.state ?? {})
  if (overrides.state?.currentWeek !== undefined) {
    envelope.state.semesters = envelope.state.semesters.map((semester) => ({ ...semester, currentWeek: overrides.state.currentWeek }))
  }
  return JSON.stringify(envelope)
}

/** 每个场景共用的逐格断言。 */
function assertCells(data, label) {
  const cells = data.cells
  check(cells.length > 0, `${label} 取到课程格`, `cells=${cells.length}`)

  // AC-A1：同「容器内容盒宽 × 行跨度」的格子，**扣掉兜底档位之后**必须完全同字号。
  // 直接比 computed 字号是不对的：兜底缩放是内容驱动的（超长课名放不下时按最小必要缩幅缩一档），
  // 同一尺寸下「20 字课名」与「4 字课名」本来就可以不同。真正要钉住的是：
  // 差异**只能**由兜底档位解释——`字号 / 档位` 必须恒定，且档位必须来自声明的阶梯。
  const byGroup = new Map()
  const scaleOf = (cell) => (cell.scaleVar ? Number(cell.scaleVar) : 1)
  for (const cell of cells) {
    const list = byGroup.get(cell.groupKey) ?? []
    list.push(cell)
    byGroup.set(cell.groupKey, list)
  }
  // 判据用「尺寸 + 档位」分组后**精确相等**，而不是把 computed 字号除以档位再比：
  // 浏览器返回的 computed font-size 是四舍五入过的（两位小数），除法会把这个误差放大；
  // 而且当 clamp 的下限（8px）已经生效时，缩放在数值上是个空操作（8 × 0.75 仍被钳回 8），
  // 「字号 / 档位」根本不可逆（实测：240px 视口下会算出 10.67 与 8 两个「基础字号」）。
  const byGroupAndScale = new Map()
  for (const cell of cells) {
    const key = `${cell.groupKey}@${scaleOf(cell)}`
    const list = byGroupAndScale.get(key) ?? []
    list.push(cell)
    byGroupAndScale.set(key, list)
  }
  for (const [key, group] of byGroupAndScale) {
    const sizes = new Set(group.map((cell) => cell.nameFontSize))
    check(
      sizes.size === 1,
      `${label} AC-A1 同尺寸同档位必然同字号`,
      `组 ${key} 出现 ${sizes.size} 种字号：${[...sizes].join(' / ')}（${group.map((c) => c.name).join('、')}）`
    )
  }
  for (const cell of cells) {
    const scale = scaleOf(cell)
    check(
      scale === 1 || CELL_FALLBACK_SCALES.includes(scale),
      `${label} 兜底档位必须来自声明的阶梯`,
      `「${cell.name}」scale=${scale}`
    )
  }

  for (const cell of cells) {
    const tag = `${label} [${cell.name}]`

    // AC-A2：字号落在 [8, 15]
    check(cell.nameFontSize >= 8 && cell.nameFontSize <= 15, `${tag} AC-A2 字号区间`, `nameFontSize=${cell.nameFontSize}`)

    // 地基断言：浏览器算出的字号 == 公式预测值（同时验证 cq 单位按使用处容器解析）
    // 用 getBoundingClientRect 的小数值而不是 clientWidth/clientHeight（后者取整，会让预测偏 ±0.1px）。
    // 容器那层没有内边距也没有边框，所以它的 rect 尺寸就等于内容盒尺寸。
    const wrapperW = cell.wrapperRect.width
    const wrapperH = cell.wrapperRect.height
    const appliedScale = cell.scaleVar ? Number(cell.scaleVar) : 1
    const expectedName = predict(SCALE.name, wrapperW, wrapperH, appliedScale)
    const expectedRoom = predict(SCALE.room, wrapperW, wrapperH, appliedScale)
    check(
      Math.abs(cell.nameFontSize - expectedName) < 0.05,
      `${tag} 地基假设：课名字号 == 公式预测`,
      `容器 ${wrapperW}x${wrapperH} scale=${appliedScale} → 实际 ${cell.nameFontSize} / 预测 ${expectedName.toFixed(3)}`
    )

    // AC-A3：任何文字元素都不得水平溢出
    for (const text of cell.texts) {
      check(
        text.scrollWidth <= text.clientWidth + 1,
        `${tag} AC-A3 无水平溢出（${text.hook}）`,
        `「${text.text}」scrollWidth=${text.scrollWidth} > clientWidth=${text.clientWidth}`
      )
    }
    check(
      cell.buttonScrollWidth <= cell.buttonClientWidth + 1,
      `${tag} AC-A3 卡片本身无水平溢出`,
      `scrollWidth=${cell.buttonScrollWidth} > clientWidth=${cell.buttonClientWidth}`
    )

    // AC-A4：课名与教室永不丢弃
    const name = cell.texts.find((item) => item.hook === 'name')
    const room = cell.texts.find((item) => item.hook === 'room')
    check(!!name && name.display !== 'none' && name.text.length > 0, `${tag} AC-A4 课名不得丢弃`, JSON.stringify(name))
    check(!!room && room.display !== 'none' && room.text.length > 0, `${tag} AC-A4 教室不得丢弃`, JSON.stringify(room))

    // AC-A5：丢弃顺序守卫（可见性单调，不允许越级）
    const visible = (hook) => {
      const item = cell.texts.find((entry) => entry.hook === hook)
      return !!item && item.display !== 'none'
    }
    check(!visible('teacher') || (visible('name') && visible('room')), `${tag} AC-A5 教师可见 ⇒ 课名/教室可见`)
    check(!visible('note') || visible('teacher'), `${tag} AC-A5 备注可见 ⇒ 教师可见`)
    check(!visible('parity') || visible('teacher'), `${tag} AC-A5 单双周可见 ⇒ 教师可见`)

    // AC-A7：教室字号不得超过课名，且未触底时比值恒定
    const roomSize = cell.texts.find((item) => item.hook === 'room')?.fontSize
    check(roomSize <= cell.nameFontSize, `${tag} AC-A7 教室 ≤ 课名`, `room=${roomSize} name=${cell.nameFontSize}`)
    // 比值恒定只在「两侧的**基础长度**（`min(cqw·W, cqh·H)`，也就是钳位与兜底之前的值）
    // 都落在各自的 (min, max) 开区间内」时成立：任一侧撞上 8px 下限或 12 / 15px 上限，
    // 比例关系就被截断。这里用基础长度判定，而不是钳位后的最终字号。
    const nameBase = Math.min((SCALE.name.cqw * wrapperW) / 100, (SCALE.name.cqh * wrapperH) / 100)
    const roomBase = Math.min((SCALE.room.cqw * wrapperW) / 100, (SCALE.room.cqh * wrapperH) / 100)
    // 还要把兜底档位算进去：缩放后若被 8px 下限截断，两侧也会撞成同一个值（实测 A@360 的
    // 1 节矮格：课名 10.11×0.75=7.58 与教室 9.06×0.75=6.8 双双被钳到 8px，比值变成 1.0）。
    const scale = scaleOf(cell)
    const effectiveName = Math.min(Math.max(nameBase, SCALE.name.min), SCALE.name.max) * scale
    const effectiveRoom = Math.min(Math.max(roomBase, SCALE.room.min), SCALE.room.max) * scale
    const nameOpen = nameBase > SCALE.name.min && nameBase < SCALE.name.max && effectiveName > SCALE.name.min && effectiveName < SCALE.name.max
    const roomOpen = roomBase > SCALE.room.min && roomBase < SCALE.room.max && effectiveRoom > SCALE.room.min && effectiveRoom < SCALE.room.max
    if (nameOpen && roomOpen) {
      const ratio = roomSize / cell.nameFontSize
      const expectedRatio = SCALE.room.cqw / SCALE.name.cqw
      check(Math.abs(ratio - expectedRatio) < 0.01, `${tag} AC-A7 比值稳定`, `实际 ${ratio.toFixed(4)} vs 期望 ${expectedRatio.toFixed(4)}`)
    }

    // AC-A8：行高比值唯一（正常态与兜底态共用同一系数）
    const nameLineHeight = cell.texts.find((item) => item.hook === 'name')?.lineHeight
    const ratio = nameLineHeight / cell.nameFontSize
    check(Math.abs(ratio - LINE_HEIGHT.name) < 0.02, `${tag} AC-A8 行高比值唯一`, `lineHeight/fontSize=${ratio.toFixed(3)} vs ${LINE_HEIGHT.name}`)

    // AC-A8b：内容顶部对齐——内容块顶边必须落在按钮内边距的底边（±1px），
    // 而不是随内容高度浮动（垂直居中的话，短内容格子的 gap 会明显大于 paddingTop）。
    check(
      Math.abs(cell.contentTopGap - cell.buttonPaddingTop) <= 1,
      `${tag} AC-A8b 内容顶部对齐`,
      `contentTopGap=${cell.contentTopGap} 期望≈paddingTop=${cell.buttonPaddingTop}`
    )

    // AC-A6：1 节矮格 + 20 字长课名不得跌破 8px
    if (cell.gridRow && /\/\s*\d+\s*$/.test(cell.gridRow)) {
      const [from, to] = cell.gridRow.split('/').map((part) => Number(part.replace(/\D+/g, '')))
      if (to - from === 1 && cell.name.length >= 18) {
        check(cell.nameFontSize >= 8, `${tag} AC-A6 矮格 + 长课名下限`, `nameFontSize=${cell.nameFontSize}`)
      }
    }
  }

  return byGroup
}

function main() {
  const onlyIndex = process.argv.indexOf('--only')
  only = onlyIndex >= 0 ? (process.argv[onlyIndex + 1] ?? '') : 'abcdef'
  const want = (group) => only.includes(group)

  const outIndex = process.argv.indexOf('--out')
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : '/tmp/claude/verify.json'
  const report = { results: [], generatedAt: new Date().toISOString() }

  // ────────────────────────────── 场景 A：多视口（D 组关闭）
  if (want('a')) {
  section('场景 A：多视口 + D 组关闭（AC-A1..A8 / B1 / B3 / D2）')
  const baseSeed = seedStateText()
  openAt({ width: 360, height: 794 }, { seedText: baseSeed, resetDisplay: true })

  const baselineColumns = JSON.parse(readFileSync(join(HERE, 'baseline-360-before.json'), 'utf8')).grid.gridTemplateColumns

  const sizes = []
  for (const viewport of VIEWPORTS) {
    const count = openAt(viewport, { seedText: baseSeed, resetDisplay: true })
    if (!check(count > 0, `场景 A ${viewport.width}px 渲染出课程格`, `cells=${count}`)) continue

    const data = probe()
    report.results.push({ scenario: 'A', viewport, data })
    for (const cell of data.cells) allFontSizes.push(cell.nameFontSize)
    const label = `A@${viewport.width}`
    assertCells(data, label)

    // B1：1x 无横向滚动。规格里这条契约只作用于手机分支（<768px）——
    // 桌面端刻意保留 `md:min-w-[760px]`，窄窗口下横向滚动是预期行为。
    if (viewport.width < 768) {
      check(data.scroll.scrollWidth === data.scroll.clientWidth, `${label} AC-B1 1x 无横向滚动`, `${data.scroll.scrollWidth} vs ${data.scroll.clientWidth}`)
    }

    // B3：桌面端不得出现可见的单双周徽标
    if (viewport.width >= 768) {
      for (const cell of data.cells) {
        if (cell.parityDisplay !== null) {
          check(cell.parityDisplay === 'none', `${label} AC-B3 桌面端不显示单双周`, `「${cell.name}」parity display=${cell.parityDisplay}`)
        }
      }
    }

    // 空间自适应：容器类型确实生效
    check(data.grid.containerType.includes('inline-size'), `${label} 网格是查询容器`, data.grid.containerType)
    for (const cell of data.cells) {
      check(cell.containerType.includes('size'), `${label} 课程格是尺寸容器`, `${cell.name}: ${cell.containerType}`)
    }

    // 单调性只沿「内容短到永远不会触发兜底」的参照格子观察：这样序列反映的就是
    // 纯 CSS 公式随容器宽度的变化，不会被兜底档位或 8px 下限造成的平台期干扰。
    const reference = data.cells.find((cell) => cell.name === REFERENCE_CELL_NAME && !cell.scaleVar)
    if (reference) sizes.push({ width: viewport.width, fontSize: reference.nameFontSize })
  }

  // AC-A2：参照格子的字号必须随视口宽度单调不减，且始终落在 [8, 15]
  for (let index = 1; index < sizes.length; index += 1) {
    check(
      sizes[index].fontSize >= sizes[index - 1].fontSize - 0.02,
      'AC-A2 字号随容器宽度单调不减',
      `${sizes[index - 1].width}px → ${sizes[index - 1].fontSize} ；${sizes[index].width}px → ${sizes[index].fontSize}`
    )
    check(sizes[index].fontSize >= 8 && sizes[index].fontSize <= 15, 'AC-A2 字号落在 [8, 15]', `${sizes[index].fontSize}`)
  }
  notes.push(`  参照格子「${REFERENCE_CELL_NAME}」字号随视口：${sizes.map((entry) => `${entry.width}px→${entry.fontSize}`).join('  ')}`)
  notes.push(`  该夹具下各视口的字号谱：${[...new Set(allFontSizes)].sort((a, b) => a - b).join(' / ')} px`)

  // AC-D2：关闭态列模板与改动前基线逐字符一致（360px 视口）
  const base360 = report.results.find((entry) => entry.scenario === 'A' && entry.viewport.width === 360)
  if (base360) {
    check(
      base360.data.grid.gridTemplateColumns === baselineColumns,
      'AC-D2 关闭开关时列模板与基线逐字符一致',
      `现在 ${base360.data.grid.gridTemplateColumns} / 基线 ${baselineColumns}`
    )
  }

  // 门禁 G2：container-type 没有改变网格几何
  const baselineRows = JSON.parse(readFileSync(join(HERE, 'baseline-360-before.json'), 'utf8')).grid.gridTemplateRows
  if (base360) {
    check(base360.data.grid.gridTemplateRows === baselineRows, 'G2 网格行高未改变', `现在 ${base360.data.grid.gridTemplateRows} / 基线 ${baselineRows}`)
  }

  }

  // ────────────────────────────── 场景 B：缩放 1x vs 2x
  if (want('b')) {
  section('场景 B：缩放 1x → 2x（AC-B2：缩放仍能揭示更多信息）')
  const baseSeedB = seedStateText()
  openAt({ width: 360, height: 794 }, { seedText: baseSeedB, resetDisplay: true })
  const zoom1x = probe()
  report.results.push({ scenario: 'B1x', data: zoom1x })

  const zoomButtonReady = ab([
    'eval',
    "String(!!document.querySelector('[data-schedule-zoom-control] button[aria-label=\"放大课表\"]'))",
  ]).includes('true')
  if (!check(zoomButtonReady, 'AC-B2 手机端存在放大按钮', `viewport=${zoom1x.viewport.width} zoomControl=${zoom1x.zoomControl}`)) {
    report.results.push({ scenario: 'B2x', data: zoom1x })
    return finish(report, outPath)
  }
  ab(['eval', "document.querySelector('[data-schedule-zoom-control] button[aria-label=\"放大课表\"]').click()"])
  execFileSync('sleep', ['1'])
  ab(['eval', "document.querySelector('[data-schedule-zoom-control] button[aria-label=\"放大课表\"]').click()"])
  execFileSync('sleep', ['1'])
  ab(['eval', "document.querySelector('[data-schedule-zoom-control] button[aria-label=\"放大课表\"]').click()"])
  execFileSync('sleep', ['1'])
  const zoom2x = probe()
  report.results.push({ scenario: 'B2x', data: zoom2x })

  check(zoom2x.cells[0]?.zoomLevel === '2', 'AC-B2 已切到 2x', `zoomLevel=${zoom2x.cells[0]?.zoomLevel}`)
  const name1x = new Map(zoom1x.cells.map((cell) => [cell.name + cell.gridRow, cell.nameFontSize]))
  for (const cell of zoom2x.cells) {
    const before = name1x.get(cell.name + cell.gridRow)
    if (before === undefined) continue
    check(cell.nameFontSize >= before, 'AC-B2 2x 字号不小于 1x', `「${cell.name}」1x=${before} 2x=${cell.nameFontSize}`)
  }
  const teachersAt1x = zoom1x.cells.filter((cell) => cell.teacherDisplay !== 'none').length
  const teachersAt2x = zoom2x.cells.filter((cell) => cell.teacherDisplay !== 'none').length
  check(teachersAt2x >= teachersAt1x, 'AC-B2 2x 不会比 1x 少显示教师行', `1x=${teachersAt1x} 2x=${teachersAt2x}`)
  notes.push(`  教师行可见数：1x=${teachersAt1x} → 2x=${teachersAt2x}（共 ${zoom1x.cells.length} 格）`)

  }

  // ────────────────────────────── 场景 C：断点两侧
  if (want('c')) {
  section('场景 C：640 / 700 / 767 / 768（AC-C2：断点统一到 md:）')
  const baseSeedC = seedStateText()
  openAt({ width: 360, height: 794 }, { seedText: baseSeedC, resetDisplay: true })
  for (const viewport of BREAKPOINT_VIEWPORTS) {
    const count = openAt(viewport, { seedText: baseSeedC, resetDisplay: true })
    if (!check(count > 0, `场景 C ${viewport.width}px 渲染出课程格`, `cells=${count}`)) continue
    const data = probe()
    report.results.push({ scenario: 'C', viewport, data })
    const label = `C@${viewport.width}`
    check(data.dayHeads.length === 7, `${label} AC-C2 七天表头都在`, `dayHeads=${data.dayHeads.length}`)
    // 767 及以下按手机（渲染缩放浮层、节次列 2rem）；768 起按桌面
    const isMobile = viewport.width < 768
    check(data.zoomControl === isMobile, `${label} AC-C2 缩放浮层与 useIsMobile 一致`, `zoomControl=${data.zoomControl} 期望=${isMobile}`)
    const sectionWidth = data.grid.gridTemplateColumns.startsWith('32') ? 32 : 64
    check(sectionWidth === (isMobile ? 32 : 64), `${label} AC-C2 节次列宽与断点一致`, data.grid.gridTemplateColumns)
  }

  }

  // ────────────────────────────── 场景 D：稳定性
  if (want('d')) {
  section('场景 D：同一夹具连测两次（AC-A10）')
  const baseSeedD = seedStateText()
  openAt({ width: 360, height: 794 }, { seedText: baseSeedD, resetDisplay: true })
  const first = probe()
  execFileSync('sleep', ['2'])
  const second = probe()
  const firstMap = new Map(first.cells.map((cell) => [cell.name + cell.gridRow, cell.nameFontSize]))
  for (const cell of second.cells) {
    const before = firstMap.get(cell.name + cell.gridRow)
    if (before === undefined) continue
    check(before === cell.nameFontSize, 'AC-A10 两次测量字号一致', `「${cell.name}」${before} vs ${cell.nameFontSize}`)
  }
  const firstShed = first.cells.map((cell) => `${cell.name}:${cell.noteDisplay}/${cell.teacherDisplay}/${cell.parityDisplay}`).join('|')
  const secondShed = second.cells.map((cell) => `${cell.name}:${cell.noteDisplay}/${cell.teacherDisplay}/${cell.parityDisplay}`).join('|')
  check(firstShed === secondShed, 'AC-A10 两次测量丢行结论一致', `${firstShed} vs ${secondShed}`)

  }

  // ────────────────────────────── 场景 E：D 组开启
  if (want('e')) {
  section('场景 E：D 组开启（AC-D3 / D4）')
  openAt({ width: 360, height: 794 }, { seedText: seedStateText(), display: DISPLAY_COLLAPSED })
  const collapsed = probe()
  report.results.push({ scenario: 'E', data: collapsed })

  const headWidths = collapsed.dayHeads.map((head, index) => ({ index: index + 1, width: head.width, text: head.text }))
  const busy = new Set(collapsed.cells.map((cell) => Number(cell.gridColumn)))
  const emptyHeads = headWidths.filter((head) => !busy.has(head.index + 1))
  const busyHeads = headWidths.filter((head) => busy.has(head.index + 1))
  // 夹具：周六（6）有课、周日（7）无课
  check(emptyHeads.length > 0 && busyHeads.length > 0, 'AC-D3 夹具里同时存在有课列与无课列', JSON.stringify(headWidths))
  for (const head of emptyHeads) {
    const maxBusy = Math.max(...busyHeads.map((entry) => entry.width))
    check(head.width < maxBusy, 'AC-D3 无课列窄于有课列', `${head.text || head.index} = ${head.width} vs 最宽有课列 ${maxBusy}`)
    check(head.width >= COLLAPSED_MIN_TRACK_PX - 0.5, 'AC-D5 收窄列不低于最小列宽保护', `${head.width} < ${COLLAPSED_MIN_TRACK_PX}`)
  }
  check(collapsed.scroll.scrollWidth === collapsed.scroll.clientWidth, 'AC-D3 收窄后无横向滚动', `${collapsed.scroll.scrollWidth} vs ${collapsed.scroll.clientWidth}`)
  const columnsSum = collapsed.dayHeads.reduce((sum, head) => sum + head.width, 0)
  notes.push(`  列宽：有课 ${busyHeads.map((head) => head.width).join('/')}；无课 ${emptyHeads.map((head) => head.width).join('/')}（合计 ${columnsSum.toFixed(1)}）`)
  for (const head of collapsed.dayHeads) {
    check(head.scrollWidth <= head.clientWidth + 1, 'AC-D4 收窄列表头不裁字', `${head.text} scrollWidth=${head.scrollWidth} clientWidth=${head.clientWidth}`)
    check(head.children.length >= 2 && head.children.every((child) => child.text.length > 0), 'AC-D4 收窄列表头两段文案完整', JSON.stringify(head.children))
    for (const child of head.children) {
      check(child.scrollWidth <= child.clientWidth + 1, 'AC-D4 收窄列表头子元素不裁字', `${head.text}/${child.text}`)
    }
  }

  }

  // ────────────────────────────── 场景 F：全空周（AC-D5）
  if (want('f')) {
  section('场景 F：全周无课（AC-D5 全空周保护）')
  openAt({ width: 360, height: 794 }, { seedText: seedStateText({ state: { currentWeek: 9 } }), display: DISPLAY_COLLAPSED })
  const emptyWeek = probe()
  report.results.push({ scenario: 'F', data: emptyWeek })
  check(emptyWeek.dayHeads.length === 7, 'AC-D5 全空周仍有 7 列表头', `dayHeads=${emptyWeek.dayHeads.length}`)
  const allEqual = new Set(emptyWeek.dayHeads.map((head) => head.width)).size === 1
  check(allEqual, 'AC-D5 全空周不做任何收窄（列宽一致）', JSON.stringify(emptyWeek.dayHeads.map((head) => head.width)))
  notes.push(`  全空周列宽：${emptyWeek.dayHeads.map((head) => head.width).join('/')}`)

  }

  // 复位到默认状态，免得把夹具状态留给后续人工复核
  openAt({ width: 360, height: 794 }, { seedText: seedStateText(), resetDisplay: true })

  return finish(report, outPath)
}

/**
 * 收尾：**合并写入**报告文件。
 *
 * 单次 bash 调用跑不完 A+B–F（会话有超时），所以按 `--only` 分段跑；合并写入让两段的结果
 * 落到同一份报告里，不会互相覆盖（键 = 场景 + 视口宽）。
 */
function finish(report, outPath) {
  const key = (entry) => `${entry.scenario}|${entry.viewport?.width ?? ''}`
  const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : null
  const merged = new Map((existing?.results ?? []).map((entry) => [key(entry), entry]))
  for (const entry of report.results) merged.set(key(entry), entry)

  const runs = [...(existing?.runs ?? []), { only, assertions, failures: failures.length }]

  writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), runs, results: [...merged.values()] }, null, 2)
  )

  console.log(notes.join('\n'))
  console.log(`\n断言总数 ${assertions}；失败 ${failures.length}`)
  if (failures.length > 0) {
    console.log('\n失败明细：')
    for (const failure of failures.slice(0, 60)) console.log(`  ✗ ${failure}`)
    if (failures.length > 60) console.log(`  … 还有 ${failures.length - 60} 条`)
    process.exit(1)
  }
  console.log('✅ 全部通过')
  return 0
}

main()
