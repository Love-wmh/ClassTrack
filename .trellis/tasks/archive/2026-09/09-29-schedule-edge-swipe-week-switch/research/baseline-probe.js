// 阶段 0 基线探针：采集手势改动前「尺寸分配 / 字号 / 缩放挂钩」的关键数字。
// 用法：agent-browser eval "$(cat <path>)"，必须以 JSON.stringify 结尾（agent-browser 只能可靠返回字符串）。
;(() => {
  const scroll = document.querySelector('[data-schedule-scroll]')
  const grid = document.querySelector('[data-schedule-grid]')
  const firstCell = document.querySelector('[data-course-cell]')
  const firstName = document.querySelector('[data-course-name]')
  const weekBadge = document.querySelector('[data-current-week]')
  const zoomControl = document.querySelector('[data-schedule-zoom-control]')
  const cs = (el, prop) => (el ? getComputedStyle(el)[prop] : null)

  return JSON.stringify({
    courseCells: document.querySelectorAll('[data-course-cell]').length,
    scroll: scroll
      ? {
          clientWidth: scroll.clientWidth,
          clientHeight: scroll.clientHeight,
          scrollWidth: scroll.scrollWidth,
          scrollLeft: scroll.scrollLeft,
          touchAction: cs(scroll, 'touchAction'),
          overflowX: cs(scroll, 'overflowX'),
          transform: cs(scroll, 'transform'),
          opacity: cs(scroll, 'opacity'),
          parentClass: scroll.parentElement ? scroll.parentElement.className : null,
          parentTag: scroll.parentElement ? scroll.parentElement.tagName : null,
        }
      : null,
    grid: grid
      ? {
          clientWidth: grid.clientWidth,
          scrollWidth: grid.scrollWidth,
          gridTemplateColumns: cs(grid, 'gridTemplateColumns'),
          zoomLevel: grid.dataset.zoomLevel,
          zoomTier: grid.dataset.zoomTier,
        }
      : null,
    firstCellFont: firstName ? { fontSize: cs(firstName, 'fontSize'), lineHeight: cs(firstName, 'lineHeight') } : null,
    firstCellRect: firstCell ? { w: firstCell.clientWidth, h: firstCell.clientHeight } : null,
    zoomControlInDom: zoomControl !== null,
    weekBadge: weekBadge ? weekBadge.textContent : null,
  })
})()
