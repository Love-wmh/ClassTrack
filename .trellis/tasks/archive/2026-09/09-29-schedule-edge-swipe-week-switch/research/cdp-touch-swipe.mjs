/**
 * 通过 CDP 派发真实触摸事件，验收手机端课表的「边缘阻尼切周」手势。
 *
 * 用法（dev server 必须先起来，且与浏览器操作在同一次 bash 调用内）：
 *
 *   XDG_RUNTIME_DIR=/tmp/ab-runtime agent-browser open http://localhost:5173/   # 灌种子 + reload
 *   WS=$(agent-browser get cdp-url)
 *   node .trellis/tasks/09-29-schedule-edge-swipe-week-switch/research/cdp-touch-swipe.mjs "$WS"
 *
 * 说明：
 * - 视口必须是手机尺寸（412×915），坐标按 **CSS px** 给（CDP 的触摸坐标就是 CSS px）。
 * - 每个场景结束都等动画收敛（`SETTLE_MS`）再读状态；拖动途中用 `probeAt` 读中间态。
 * - 只读 `data-*` 与 computed style，不依赖中文文案。
 */

const SETTLE_MS = 520
const STEP_MS = 16

const wsUrl = process.argv[2]
if (!wsUrl) {
  console.error('usage: node cdp-touch-swipe.mjs <cdp-websocket-url>')
  process.exit(2)
}

const socket = new WebSocket(wsUrl)
let nextId = 1
const pending = new Map()

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const { resolve, reject } = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) reject(new Error(JSON.stringify(message.error)))
  else resolve(message.result)
})

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId
    nextId += 1
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(result.exceptionDetails)}`)
  return result.result.value
}

const PROBE = `(() => {
  const el = document.querySelector('[data-schedule-scroll]')
  const grid = document.querySelector('[data-schedule-grid]')
  const badge = document.querySelector('[data-current-week]')
  return {
    week: badge ? Number(badge.dataset.currentWeek) : null,
    swipeState: el.dataset.weekSwipeState ?? null,
    inlineTransform: el.style.transform,
    computedTransform: getComputedStyle(el).transform,
    opacity: getComputedStyle(el).opacity,
    scrollLeft: el.scrollLeft,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollTop: el.scrollTop,
    zoomLevel: grid.dataset.zoomLevel,
  }
})()`

const probe = () => evaluate(PROBE)
const point = (x, y) => ({ x, y, radiusX: 1, radiusY: 1, force: 1, id: 1 })

/**
 * 派发一次单指拖动。
 *
 * @returns 拖动途中各 `probeAt` 位置的状态，以及松手并等动画收敛后的最终状态。
 */
async function drag({ fromX, toX, fromY, toY = fromY, steps = 12, probeAt = [] }) {
  const probes = []
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(fromX, fromY)] })
  await sleep(STEP_MS)

  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps
    const x = fromX + (toX - fromX) * ratio
    const y = fromY + (toY - fromY) * ratio
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(x, y)] })
    await sleep(STEP_MS)

    if (probeAt.includes(step)) probes.push({ step, ...(await probe()) })
  }

  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(SETTLE_MS)

  return { probes, after: await probe() }
}

const report = {}

report.s0Baseline = await probe()

/**
 * 场景集：`full`（默认）跑全部；`off` 只验「开关关闭时横滑不得产生任何位移、也不得切周」（AC-4）。
 * `off` 需要事先把 `class-track-schedule-display` 里的 `edgeSwipeWeekSwitch` 写成 false 并 reload。
 */
const mode = process.argv[3] ?? 'full'

if (mode === 'shot') {
  // 按住不放，截一张「阻尼跟手位移中」的图，再松手（截图路径由 argv[4] 给出）。
  const shotPath = process.argv[4] ?? '/tmp/claude/mid-drag.png'
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(120, 420)] })
  for (let step = 1; step <= 12; step += 1) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(120 + step * 12, 420)] })
    await sleep(STEP_MS)
  }
  report.midDrag = await probe()
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(SETTLE_MS)
  report.afterRelease = await probe()
  await new Promise((resolve) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`, resolve))
  socket.close()
  process.exit(0)
}

if (mode === 'drag1') {
  // 单次拖动（供外部工具夹住计数，例如 `agent-browser react renders start/stop`）。
  const [fromX, toX, steps] = process.argv.slice(4).map(Number)
  report.drag = await drag({ fromX, toX, fromY: 420, steps, probeAt: [steps] })
  await new Promise((resolve) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`, resolve))
  socket.close()
  process.exit(0)
}

if (mode !== 'full') {
  report.offSmallRightDrag = await drag({ fromX: 160, toX: 220, fromY: 420, steps: 8, probeAt: [8] })
  report.offBigRightDrag = await drag({ fromX: 110, toX: 310, fromY: 420, steps: 16, probeAt: [16] })
  report.offBigLeftDrag = await drag({ fromX: 310, toX: 110, fromY: 420, steps: 16, probeAt: [16] })
  await new Promise((resolve) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`, resolve))
  socket.close()
  process.exit(0)
}
// S1：1x（无横向滚动）小位移右滑 —— 越过 slop 但远不到阈值 → 有跟手位移、松手回弹、周次不变
report.s1SmallRightDrag = await drag({ fromX: 160, toX: 220, fromY: 420, steps: 8, probeAt: [8] })

// S2：1x 大位移右滑 200px → 过阈值，切到上一周
report.s2BigRightDrag = await drag({ fromX: 110, toX: 310, fromY: 420, steps: 16, probeAt: [6, 16] })

// S3：1x 大位移左滑 200px → 切回下一周
report.s3BigLeftDrag = await drag({ fromX: 310, toX: 110, fromY: 420, steps: 16, probeAt: [16] })

// S4：纵向拖动 → 全程不得出现位移
report.s4VerticalDrag = await drag({ fromX: 200, toX: 204, fromY: 300, toY: 480, steps: 12, probeAt: [12] })

// S5：连续两次横滑 → 缩放档位不得被误切成双击（AC-12）
const zoomBefore = (await probe()).zoomLevel
await drag({ fromX: 220, toX: 300, fromY: 420, steps: 6 })
await drag({ fromX: 220, toX: 300, fromY: 420, steps: 6 })
report.s5TwoQuickSwipesKeepZoom = { zoomBefore, zoomAfter: (await probe()).zoomLevel }

// S6：边界 —— 先退回第 1 周，再右滑：仍有阻尼位移但周次不变
for (let index = 0; index < 3; index += 1) {
  await drag({ fromX: 120, toX: 320, fromY: 420, steps: 12 })
}
report.s6aAtFirstWeek = await probe()
report.s6bBoundaryDrag = await drag({ fromX: 120, toX: 320, fromY: 420, steps: 12, probeAt: [12] })

// S7：2x（有横向滚动）—— 先设置到「离右边缘 120px」，再左滑 240px：
// 前 ~120px 只滚动（无位移），越过边缘后出现阻尼（F1 的核心断言）
await evaluate(`document.querySelector('[aria-label="放大课表"]').click()`)
await sleep(120)
await evaluate(`document.querySelector('[aria-label="放大课表"]').click()`)
await sleep(400)
await evaluate(`(() => {
  const el = document.querySelector('[data-schedule-scroll]')
  el.scrollLeft = el.scrollWidth - el.clientWidth - 120
  return el.scrollLeft
})()`)
await sleep(120)
report.s7a2xBeforeScrolledDrag = await probe()
report.s7bScrolledThenEdgeDrag = await drag({ fromX: 340, toX: 100, fromY: 420, steps: 16, probeAt: [8, 16] })

console.log(JSON.stringify(report, null, 2))
socket.close()
