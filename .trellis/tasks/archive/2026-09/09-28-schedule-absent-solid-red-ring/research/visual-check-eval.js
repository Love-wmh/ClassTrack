// AC-E1 视觉复核探针：读每个课程格的实际计算样式。
//
// 关注三件事：① 缺勤格是否不再变淡（opacity/filter）且描边变成实色红；
// ② 未标记 / 只写备注的格子是否完全中性（没有角标、没有红描边）；
// ③ 非本周格是否仍是淡化色 + 无出勤痕迹。由 `run-visual-check.sh` 用 `eval -b`（base64）喂给 agent-browser。
JSON.stringify(
  [...document.querySelectorAll('[data-course-cell]')].map((el) => {
    const cs = getComputedStyle(el)
    return {
      name: el.querySelector('[data-course-name]')?.textContent,
      title: el.getAttribute('title'),
      outOfWeek: el.hasAttribute('data-course-out-of-week'),
      bg: cs.backgroundColor,
      opacity: cs.opacity,
      filter: cs.filter,
      shadow: cs.boxShadow,
      icon: el.querySelector('svg')?.getAttribute('class') || '',
    }
  }),
  null,
  1
)
