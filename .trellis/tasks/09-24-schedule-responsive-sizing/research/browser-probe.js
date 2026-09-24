/**
 * 课表尺度浏览器探针（在页面里 eval 的 IIFE 表达式，返回 JSON 字符串）。
 *
 * 只做「取数」，不做判断——断言逻辑放在 verify-responsive-sizing.mjs 里，
 * 这样阶段 0 的基线与阶段 5 的验收共用同一份取数口径。
 *
 * 用法：agent-browser eval "$(cat research/browser-probe.js)"
 */
;(() => {
  const px = (v) => (v == null ? null : Math.round(v * 100) / 100)
  const cs = (el) => (el ? getComputedStyle(el) : null)

  /** 课程格内所有「承载文字的元素」——用来断言没有任何一处水平溢出。 */
  const cellTexts = (root) => {
    const out = []
    const walk = (el) => {
      for (const child of el.children) {
        const ownText = [...child.childNodes]
          .filter((node) => node.nodeType === 3)
          .map((node) => node.textContent.trim())
          .join('')
        if (ownText) {
          const style = getComputedStyle(child)
          out.push({
            hook: child.getAttribute('data-course-name') !== null
              ? 'name'
              : child.getAttribute('data-course-room') !== null
                ? 'room'
                : child.getAttribute('data-course-teacher') !== null
                  ? 'teacher'
                  : child.getAttribute('data-course-note') !== null
                    ? 'note'
                    : child.getAttribute('data-course-parity') !== null
                      ? 'parity'
                      : 'other',
            text: ownText.slice(0, 30),
            display: style.display,
            fontSize: px(parseFloat(style.fontSize)),
            lineHeight: px(parseFloat(style.lineHeight)),
            width: px(child.getBoundingClientRect().width),
            scrollWidth: child.scrollWidth,
            clientWidth: child.clientWidth,
            scrollHeight: child.scrollHeight,
            clientHeight: child.clientHeight,
          })
        }
        walk(child)
      }
    }
    walk(root)
    return out
  }

  const grid = document.querySelector('[data-schedule-grid]')
  const scroll = document.querySelector('[data-schedule-scroll]')
  if (!grid) return JSON.stringify({ ready: false })

  const dayHeads = [...document.querySelectorAll('[data-day-head]')].map((el) => ({
    text: el.textContent.trim(),
    width: px(el.getBoundingClientRect().width),
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    fontSize: px(parseFloat(getComputedStyle(el).fontSize)),
    children: [...el.children].map((child) => ({
      text: child.textContent.trim(),
      fontSize: px(parseFloat(getComputedStyle(child).fontSize)),
      scrollWidth: child.scrollWidth,
      clientWidth: child.clientWidth,
    })),
  }))

  const sectionRows = [...document.querySelectorAll('[data-section-row]')].map((el) => ({
    section: el.getAttribute('data-section-row'),
    height: px(el.getBoundingClientRect().height),
    fontSize: px(parseFloat(getComputedStyle(el).fontSize)),
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))

  const cells = [...document.querySelectorAll('[data-course-cell]')].map((btn) => {
    // 查询容器是网格项那层（无内边距 / 无边框），所以它的 clientWidth/Height 就是内容盒尺寸，
    // 也就是 `cqw` / `cqh` 的分母。断言靠它复算字号。
    // 内容块是按钮的第一个子元素（出勤角标排在它后面）。顶部对齐要求它的顶边正好落在
    // 按钮内边距的底边，垂直居中则会随内容高度浮动。
    const content = btn.firstElementChild
    const contentTopGap = content ? content.getBoundingClientRect().top - btn.getBoundingClientRect().top : null
    const wrapper = btn.closest('[data-course-wrapper]')
    const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : null
    const name = btn.querySelector('[data-course-name]')
    const nameStyle = cs(name)
    const texts = cellTexts(btn)

    const hookText = (hook) => texts.find((item) => item.hook === hook) ?? null

    return {
      name: name ? name.textContent.trim().slice(0, 30) : null,
      gridColumn: wrapper ? wrapper.style.gridColumn : null,
      gridRow: wrapper ? wrapper.style.gridRow : null,
      /** 分组键：容器内容盒宽 × 行跨度——同键必须同字号（AC-A1）。 */
      groupKey: `${wrapper ? wrapper.clientWidth : 'x'}x${wrapper ? wrapper.style.gridRow : '?'}`,
      contentTopGap: px(contentTopGap),
      buttonPaddingTop: px(parseFloat(cs(btn).paddingTop)),
      wrapperClientWidth: wrapper ? wrapper.clientWidth : null,
      wrapperClientHeight: wrapper ? wrapper.clientHeight : null,
      wrapperRect: wrapperRect ? { width: px(wrapperRect.width), height: px(wrapperRect.height) } : null,
      containerType: wrapper ? cs(wrapper).containerType : null,
      gridContainerType: cs(grid).containerType,
      buttonScrollWidth: btn.scrollWidth,
      buttonClientWidth: btn.clientWidth,
      nameFontSize: nameStyle ? px(parseFloat(nameStyle.fontSize)) : null,
      nameLineHeight: nameStyle ? px(parseFloat(nameStyle.lineHeight)) : null,
      parityDisplay: hookText('parity')?.display ?? null,
      teacherDisplay: hookText('teacher')?.display ?? null,
      noteDisplay: hookText('note')?.display ?? null,
      roomDisplay: hookText('room')?.display ?? null,
      outOfWeek: btn.hasAttribute('data-course-out-of-week'),
      zoomTier: grid.getAttribute('data-zoom-tier'),
      zoomLevel: grid.getAttribute('data-zoom-level'),
      scaleVar: cs(btn).getPropertyValue('--cc-scale').trim(),
      texts,
    }
  })

  return JSON.stringify({
    ready: true,
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    grid: {
      gridTemplateColumns: getComputedStyle(grid).gridTemplateColumns,
      gridTemplateRows: getComputedStyle(grid).gridTemplateRows,
      minWidth: getComputedStyle(grid).minWidth,
      containerType: getComputedStyle(grid).containerType,
      rect: { width: px(grid.getBoundingClientRect().width), height: px(grid.getBoundingClientRect().height) },
    },
    scroll: scroll
      ? {
          scrollWidth: scroll.scrollWidth,
          clientWidth: scroll.clientWidth,
          scrollHeight: scroll.scrollHeight,
          clientHeight: scroll.clientHeight,
        }
      : null,
    dayHeads,
    sectionRows,
    zoomControl: !!document.querySelector('[data-schedule-zoom-control]'),
    cells,
  })
})()
