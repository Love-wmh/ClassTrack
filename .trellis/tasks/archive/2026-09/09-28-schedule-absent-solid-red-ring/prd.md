# 前台课表缺勤改为实色红框，未标记格子不再显出勤痕迹

## Goal

前台课表（`app/features/schedule/ScheduleCourseCell.tsx`）的**缺勤**表现从「整卡淡化」改为「**不变淡 + 实色红色描边**」；并把课表上的出勤表现收窄到**真正做过出勤判断**的课次——未标记 / 只写了备注的格子不再出现任何已上 / 未上痕迹。

目标状态：

- 一眼能看出哪几格是缺勤（红色实心描边），**不再**与「非本周课程」的淡化色混淆；
- 没做过出勤判断的课次在课表上是**中性**的，不会被误读成缺勤；
- 已上 / 非本周 / 开关关闭态的现有表现**零回归**。

---

## 背景（代码级现状）

`ScheduleCourseCell.tsx` 当前只有一条出勤视觉规则：

```tsx
const showAttendance = attendanceEnabled && showAttendanceStatus && !isOutOfWeek
// …
showAttendance && !isAttended && 'opacity-60 saturate-50'
```

`isAttended = !!mark?.isAttended`，因此 `undefined` 的 mark（**从未标记**）与「**只写了备注**」的 `mark`（`attendanceMarked === false`，`isAttended` 也是 `false`）都会命中这条规则 → 变淡 + 右下警示角标 + title 写「未上」。

两个问题：

1. **视觉上不可辨识**：`opacity-60 saturate-50` 与「非本周课程」的淡化色（`courseOutOfWeekColors`，亮度 +0.067 / 饱和 ×0.42）观感雷同，用户原话「跟单双周但是这周没有这节课的显示效果一致」——两种完全不同的语义（缺勤 vs 非本周）长得几乎一样，且变淡本身不美观。
2. **语义口径与产品既有约定不一致**：「写备注不等于缺勤」这条约定在别处已经固化——`app/store/utils.ts` 的 `isAttendanceMarked()` 与看板 `app/features/dashboard/utils.ts` 的 `isAbsentSession()` 都是 `isAttendanceMarked(mark) && !mark.isAttended`，且 `isAttendanceMarked` 的注释明确写着「新增读取出勤状态的代码必须复用它」。前台课表是唯一没走这个判据的读取点。

---

## 非目标

- **不做「未来课次」的时间推算**（不做「现在是周一所以周五那节课不算缺勤」）——见下方「待确认」第 1 条。
- 不改配色常量 `courseColors` / `courseOutOfWeekColors` / 非本周淡化公式。
- 不改出勤数据层：`ClassMark` 结构、备份 schema、`markClass` / `toggleAttended` 一类写入路径、迁移逻辑。
- 不改出勤开关的默认值、持久化 key 与两层开关（能力层 `attendanceEnabled` + 显示层 `showAttendanceStatus`）的语义。
- 不改看板统计口径与图表配色。
- 不改顶栏「全部已上 / 全部未上」按钮与确认弹窗。
- **不改 Android 桌面小工具的渲染**（本轮范围仅前台页面）。
- 不新增任何与格子尺寸无关的 px 尺度；不引入新配色档位。

---
## 已确认口径（2026-09-28 review 定稿）

1. **「还没有上的课」= 没有做过出勤判断的课次**（**口径 A，数据口径**）。判据只用 `isAttendanceMarked(mark)`，**不引入任何时间推算**：没有 mark、或只有备注（`attendanceMarked === false`）→ 课表上完全中性。
2. **未标记格子不显示右下角警示角标**。角标只在「明确标记过」时出现：已上 → 打勾；缺勤 → 警示（**保留**，已确认）。
3. **红色取 `#ef4444`**（与看板「缺勤」系列 `ABSENT_FILL` 同色）。备选 `#dc2626` 未采纳。

> **已评估但本轮不做的口径 B**（按真实时间过滤「还没到点的课次」）：需要引入 `firstWeekStartDate` 推算 + `deriveSectionTimes` 的节次时间 + 未来周 / 历史周的行为定义 + 学期日期缺失时的回退；且同一格会在一天内变色，截图验收不稳定。差别仅在「用户手动 / 批量标记过『未上』」时显现（例如周一点了顶栏「全部未上」，周五的课在 A 下也变红框、在 B 下不变）。若将来要做，另开任务。

---

## Requirements

### A 组：缺勤表现改为实色红框

- **A1 不再淡化。** 缺勤格不得再出现 `opacity-60` / `saturate-50`（或任何等价的整体变淡）。
- **A2 实色红色描边。** 缺勤格的卡片描边改为**不透明纯红**，宽度继续由现有的容器尺度变量 `--cc-ring` 决定（**不新增 px**）。
- **A3 描边类唯一真源。** 红色描边类必须与 `CELL_RING_CLASS` 并列定义在 `app/features/schedule/cellScale.ts`，组件只引用常量，不得在组件里内联颜色值或第二份宽度值。
- **A4 `focus-visible` 不回归。** 键盘聚焦时仍走 `[box-shadow:…,0_0_0_2px_var(--ring)]` 的外圈表现，红框不覆盖外圈、也不丢失内描边。

### B 组：出勤表现收窄到「做过出勤判断」的课次

- **B1 判据复用既有语义。** 课表的出勤表现必须与 `isAttendanceMarked(mark)`（`app/store/utils.ts`）保持同一口径：只有 `isAttendanceMarked(mark) === true` 的格子才出现任何出勤痕迹。
- **B2 未标记 / 只有备注 = 中性。** 不淡化、不出现任何角标、`title` 不出现「已上」/「未上」文案。
- **B3 已上不变。** `mark.isAttended === true` → 白色打勾角标，描边保持半透明白（不变红）。
- **B4 缺勤 = 红框 + 警示角标。** `isAttendanceMarked(mark) && !mark.isAttended` → 实色红描边 **且** 保留右下角 `CircleAlert`（角标处理已确认「保留」）。

### C 组：不回归的既有行为

- **C1 两层开关语义不变。** `attendanceEnabled` 或 `showAttendanceStatus` 任一为假 → 该格不出现任何出勤痕迹（红线、角标、title 文案全无）；**备注照常显示**。
- **C2 非本周优先。** `isOutOfWeek` 的格子保持非本周淡化色 + 「非本周」标签，**不叠加**任何出勤痕迹（不为它加红框）。
- **C3 未标记格子的备注照常显示**（备注与出勤解耦，不动）。
- **C4 尺度体系不破。** 不出现 `text-[Npx]`、不出现 `sm:` 前缀、组件不依赖 `useIsMobile`、`cqw/cqh` 仍只出现在 `cellScale.ts`——`scheduleSourceGuard.test.ts` 全部断言继续通过。

### D 组：测试与规格同步

- **D1** `app/features/schedule/ScheduleCourseCell.test.ts` 更新为「红框断言」，并按 B1 的判据补齐用例（缺勤 / 已上 / 未标记 / 只有备注 / 非本周）。
- **D2** 若 `cellScale.test.ts` 对描边类有形状断言，需同步覆盖新的红色描边类。
- **D3** `.trellis/spec/frontend/mobile-schedule-layout.md` 中「出勤痕迹」一行同步改写，并说明「红框 = 实色、与半透明白描边的区别」与「未标记 = 中性」两条约定（避免下次被当成 bug 改回去）。

---

## Acceptance Criteria

- [x] **AC-A1** 明确缺勤格（`attendanceMarked: true, isAttended: false`）渲染结果：**不含** `opacity-60` / `saturate-50`；**含**实色红色描边；**含** `CircleAlert` 角标；`title` 含「未上」。→ `ScheduleCourseCell.test.ts`「缺勤：不变淡…」；真机口径复核见 `research/verify-report.md`（`rgb(239,68,68)` + `circle-alert`，`opacity: 1`）。
- [x] **AC-A2** 缺勤格描边宽度仍是 `var(--cc-ring)`，红色以不透明颜色书写（如 `rgb(239 68 68)`），不出现 `opacity` / `/0.x` 形式的透明度修饰。→ `cellScale.test.ts`「卡片描边常量」。
- [x] **AC-A3** 红色描边类来自 `cellScale.ts` 导出的常量，`ScheduleCourseCell.tsx` 内不出现 `#ef4444` / `rgb(239` 一类字面量。→ `scheduleSourceGuard.test.ts`「缺勤描边的颜色只有 cellScale.ts 一处真源」。
- [x] **AC-B1** 未标记格（`mark === undefined`）渲染结果：不含 `opacity-60` / `saturate-50`、不含角标、`title` 不含「已上」「未上」。→ 单测 + 夹具里 9 个无标记格实测（`opacity: 1`、无角标、`title` 只有课名）。
- [x] **AC-B2** 只写备注的格（`attendanceMarked: false`，有 `note`）：同 AC-B1（中性），**且备注文本照常出现在 DOM 里**。→ 单测「只写了备注…」；真机夹具「计算机组成与结构」实测中性且备注「调课到周五」显示在卡上。
- [x] **AC-B3** 已上格：不含 `opacity-60` / `saturate-50`、含打勾角标、不含红色描边、`title` 含「已上」。→ 单测「已上：保留打勾角标…」。
- [x] **AC-B4** 缺勤格的角标仍是 `CircleAlert`（警示角标保留）。→ 单测断言 `lucide-circle-alert`。
- [x] **AC-C1** `attendanceEnabled: false` 时：缺勤 / 已上 / 未标记三种输入下都不出现淡化、角标、红框与「已上/未上」文案；只写备注的格子仍显示备注。→ 单测「关闭出勤统计时：…都不出现任何出勤痕迹」+「备注照旧显示」。
- [x] **AC-C2** `isOutOfWeek: true`（且 mark 为缺勤）时：含 `data-course-out-of-week`、含「非本周」、**不含**红框与角标、`title` 不含「未上」。→ 单测「非本周课走灰色淡化…」；真机夹具「形势与政策」实测。
- [x] **AC-C3** `pnpm test` 全绿。→ 36 文件 / 294 用例。
- [x] **AC-C4** `pnpm typecheck` 无错。
- [x] **AC-C5** `pnpm lint` 零 warning（`--max-warnings 0`）。
- [x] **AC-D1** `mobile-schedule-layout.md` 的「出勤痕迹」行已同步；「格子视觉」行仍准确（半透明白描边 = 常态、红框 = 缺勤）。→ 另新增「出勤表现（2026-09-28 起）」小节，含两条「别改回去」的约定。
- [x] **AC-E1** 视觉复核（本机 headless / 模拟器截图，360×794 CSS px）：缺勤格的红描边肉眼可辨，且与「非本周」淡化格**不混淆**；已上格无视觉变化。→ `research/after-360x794-absent-ring.png`、`after-1024x900-absent-ring.png`（桌面档加验）+ `verify-report.md` 的逐格计算样式表。

---

## 约束

- **必须复用** `isAttendanceMarked()`：不得在课表里再写一份 `mark?.attendanceMarked !== false`（会与看板口径漂移）。
- **必须保留**：备注与出勤解耦、非本周优先、两层开关、`data-course-*` 测试锚点语义、`--cc-ring` 作为描边宽度唯一真源。
- **必须同步**规格文档（D3）——这条规则是本项目对「淡化 = 缺勤还是非本周」的歧义的唯一解药。
- 改动面限定在：`app/features/schedule/{ScheduleCourseCell.tsx,cellScale.ts,ScheduleCourseCell.test.ts,cellScale.test.ts?}`、`.trellis/spec/frontend/mobile-schedule-layout.md`。

---

## Notes

- 相关代码：`app/features/schedule/ScheduleCourseCell.tsx`（`showAttendance` / `CELL_RING_CLASS` / 角标 / `title`）、`app/features/schedule/cellScale.ts`（`CELL_RING_CLASS`、`CELL_BADGE_CLASS`）、`app/store/utils.ts`（`isAttendanceMarked`）、`app/features/dashboard/utils.ts`（口径参照）。
- 相关规格：`.trellis/spec/frontend/mobile-schedule-layout.md`（「出勤痕迹」「格子视觉」两行）、`.trellis/spec/frontend/component-guidelines.md`。
- 上游任务：`09-24-schedule-responsive-sizing`（描边宽度 `--cc-ring` 与容器尺度体系由此而来，本次沿用不重构）。
