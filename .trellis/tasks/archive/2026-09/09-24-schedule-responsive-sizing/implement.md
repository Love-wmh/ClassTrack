# 执行计划：课表尺度响应式化

> 设计见 `design.md`，需求见 `prd.md`。
> **开始前不许跳步**：本计划的顺序是刻意的——先把公式钉住（阶段 1），再动组件（阶段 2–4），最后在浏览器里回归（阶段 5），D 组放在最后（阶段 6）。

---

## 阶段 0：基线与夹具（无代码改动）

**目的**：为「关闭态逐字符一致」（AC-D2）与「A 组前后对比」留下可比的基线数字。

- [ ] 0.1 启动 dev server 并确认可访问：`pnpm dev`
- [ ] 0.2 用规格里的种子数据法灌入夹具（**必须** `storage local set` → `reload`，直接 eval 写 localStorage 会被运行中的应用回写覆盖）：
      `research/seed-schedule-fixture.js`（沿用归档任务 `09-20-mobile-schedule-week-grid` 的那份，必要时扩充）
- [ ] 0.3 夹具需覆盖以下格型，缺一不可：
      - 超长中文课名（20 字）+ 教室 + 教师（1-2 节、5-6 节）
      - 含不可断拉丁 token 的课名（`概率与统计 (Python)`）
      - 短课名 + 教室 + 教师（1 节格）
      - 单双周课（`data-course-parity` 存在）
      - 非本周课（`data-course-out-of-week`）
      - 整周无课的日期（周六/周日）→ 供 D 组验收
      - 全周无课的场景 → 供 AC-D5（可临时切换 currentWeek 构造）
- [ ] 0.4 录基线（写入 `research/baseline-before.md`）：360×794 视口下
      `[data-schedule-grid]` 的 computed `grid-template-columns`、每个 `[data-course-cell]` 的课名 computed `font-size` 与 `line-height`、`[data-course-name]`/教室元素的 `scrollWidth`/`clientWidth`

**门禁**：基线文件存在且包含上述字段，才允许进入阶段 1。

---

## 阶段 1：`cellScale.ts`（公式单一真源）

- [ ] 1.1 新建 `app/features/schedule/cellScale.ts`：`CELL_SCALE` / `CELL_LINE_HEIGHT` / `CELL_FALLBACK_SCALES`，按 `design.md` §3 的数值
- [ ] 1.2 导出 `cellScaleStyle: CSSProperties` —— 用常量拼出 `--cc-*` 字符串（`clamp()` + `min()` + `cqw`/`cqh`），供挂到 `[data-schedule-grid]` 上
- [ ] 1.3 导出 `resolveCellScale(containerWidth, containerHeight)` —— CSS 的可执行规格（参考实现）
- [ ] 1.4 导出容器类名常量（例如 `CELL_CONTAINER_CLASS`），避免在三个文件里各写一遍 `[container-type:size]`
- [ ] 1.5 新增 `cellScale.test.ts`：
      - 单调性：容器宽从 12 → 200px，`resolveCellScale().name` 单调不减
      - 上下限：任何输入下 `name ∈ [8, 15]`、`room ∈ [8, 12]`、`room < name`
      - 比值稳定：`room / name` 在 120–240px 视口区间内不变（AC-A7 的公式侧）
      - 每个 `--cc-*` 变量字符串都包含 `cqw`（防止有人手滑改成 px 硬编码）

**验证**：`pnpm test app/features/schedule/cellScale.test.ts` + `pnpm typecheck`

**门禁**：公式测试全绿。此阶段**不改任何组件**。

---

## 阶段 2：`ScheduleCourseCell.tsx` 重写

按 `design.md` §4 执行：

- [ ] 2.1 删除 `baseName`/`baseRoom`、`name.style.fontSize/lineHeight`、`room.style.fontSize/lineHeight` 的内联写入
- [ ] 2.2 删除 `useIsMobile()` 与 `parity` 的 `isMobile` 门控，改用 `visible()`（computed display）判据
- [ ] 2.3 字号类改为 `var(--cc-*)`（含 `leading` 用 `CELL_LINE_HEIGHT`），删掉所有 `text-[Npx]` 与 `md:text-*`
- [ ] 2.4 内边距 / 描边 / 圆角 / 角标改为 `--cc-*` 派生
- [ ] 2.5 兜底改为 `--cc-scale` 相对阶梯（`CELL_FALLBACK_SCALES`），每轮 `apply()` 前先清掉该变量
- [ ] 2.6 内层块宽度改为 `min(${Math.ceil(used)}px, 100%)`，并补上宽度校验（`design.md` §4.5）
- [ ] 2.7 给教室元素补 `data-course-room`（PRD E1）
- [ ] 2.8 扩充 `ScheduleCourseCell.test.ts`（SSR 断言）：
      - 存在 `data-course-room`
      - 容器类存在
      - HTML 中不含 `text-[` 后跟数字 + `px]` 的类名
      - 出勤淡化的两组类名断言保持不变（既有用例不得改行为）

**验证**：`pnpm test app/features/schedule/` + `pnpm typecheck` + `pnpm lint`

**门禁**：既有 `ScheduleCourseCell.test.ts` 用例全绿（出勤外观语义不得回归）。

---

## 阶段 3：`ScheduleTable.tsx`

- [ ] 3.1 grid 元素加 `container-type: inline-size`，并用 `style` 挂 `cellScaleStyle`
- [ ] 3.2 课程格 wrapper 加 `CELL_CONTAINER_CLASS`（`container-type: size`）
- [ ] 3.3 表头 / 月份 / 日期 / 节次号 / 节次时间 6 处 px 字号改为 `var(--cc-*)`
- [ ] 3.4 拆掉 `sm:`（若有）并复核 640–767px 区间的分支一致性
- [ ] 3.5 **不动**：缩放浮层尺寸、`data-*` 锚点、`min-w-[calc(100%*var(--schedule-zoom,1))]`、`ZOOM_MIN` 语义

**验证**：`pnpm test` + `pnpm typecheck` + `pnpm lint`

**门禁（关键）**：浏览器实测确认 `container-type: size` **没有改变网格轨道高度**（`design.md` §2 标注的风险点）。
对比阶段 0 基线里每个 `[data-course-cell]` 的高度与 `[data-schedule-grid]` 的 `grid-template-rows`——若发生变化，走 `design.md` §2 的退回方案（wrapper 内再加一层容器）后重测。

---

## 阶段 4：断点统一（`ScheduleHeader.tsx` / `SchedulePage.tsx`）

- [ ] 4.1 `ScheduleHeader.tsx`：`sm:flex` / `sm:gap-2` / `sm:px-3` / `sm:mr-1.5` / `sm:flex-row` / `sm:items-center` / `sm:justify-between` → `md:`
- [ ] 4.2 `SchedulePage.tsx`：`sm:px-5 sm:py-6` / `md:pb-6` → 统一到 `md:`
- [ ] 4.3 复核 `ScheduleHeader.test.ts`（顶栏列数的 SSR 断言）仍然通过

**验证**：`pnpm test` + `pnpm typecheck` + `pnpm lint`

**风险**：顶栏列数断言是按「出勤统计开启/关闭两套列数」钉住的，断点改名不应影响类名里的 `grid-cols-[...]` 值；若测试因类名变化失败，**只改测试里的断点前缀**，不动列数。

---

## 阶段 5：浏览器多视口回归（A / B / C 组）

- [ ] 5.1 写 `research/verify-responsive-sizing.mjs`：遍历视口 × 格型，断言 `prd.md` 的 AC。必须覆盖：
      - **AC-A1** 按「列宽 × 行跨度」分组后同组字号完全一致
      - **AC-A2** 视口 240/320/360/412/480/600/768/1024/1440 逐档，字号单调不减且在 `[8,15]`
      - **AC-A3** 每个文字元素 `scrollWidth <= clientWidth + 1`（**必须包含 `(Python)` 那个格子**）
      - **AC-A4** 每个格子的课名与教室 `display !== 'none'` 且文本非空
      - **AC-A5** 丢弃顺序守卫
      - **AC-A6** 1 节矮格 + 长课名字号 `>= 8`
      - **AC-A8** 课名 `line-height / font-size` 在正常态与兜底态一致
      - **AC-A10** 同一夹具连测两次结论一致
      - **AC-B1** 1x 无横向滚动；**AC-B2** 2x 字号 `>=` 1x 且教师行可现；**AC-B3** 桌面端无 `data-course-parity`
      - **AC-C2** 640/700/767/768 四档的 `data-day-head` 数量与缩放浮层渲染一致性
- [ ] 5.2 断言 CSS 实际值 == `resolveCellScale()` 预测值（钉住 `cq` 单位在使用处解析这条地基假设）
- [ ] 5.3 用 `agent-browser` 截图 360×794 与 240×600 两档，人工复核视觉（AC-E4 的本地版）

**环境提示**（规格已记录，照抄即可）：
```bash
export XDG_RUNTIME_DIR=/tmp/claude/ab-runtime   # /run/user/1000 是 ro 挂载，agent-browser 建不了 socket
mkdir -p "$XDG_RUNTIME_DIR" /tmp/claude          # TMPDIR=/tmp/claude 不存在时 pnpm 直接崩
pnpm dev &
```

**门禁**：A/B/C 组 AC 全绿。任一失败 → 回到阶段 1–3 修正公式/组件，**不许在预期值上做例外**。

---

## 阶段 6：D 组（收起整周无课的日期列）

顺序刻意做成「先证零回归、再加功能」：

- [ ] 6.1 `scheduleDisplayStore.ts`：新增 `collapseEmptyWeekdayColumns`（默认 `false`），**同时**补 `partialize` 与 `merge`（三处齐改，漏一处旧数据会丢值）
- [ ] 6.2 扩充 `scheduleDisplayStore.test.ts`：默认值、切换、`partialize` 白名单包含新字段
- [ ] 6.3 `ScheduleDisplaySettings.tsx`：新增开关，文案说明「收窄整周没有课程的日期列，把宽度让给有课的日期」+「翻周时列宽会随之变化」
- [ ] 6.4 **先只接状态、不接列模板**：跑阶段 5 的脚本，断言 **AC-D2 关闭态 `grid-template-columns` 与基线逐字符一致**
- [ ] 6.5 接列模板（`design.md` §6）：`hasBusy && hasEmpty` 守卫 + `minmax(1.75rem, 0.45fr)` 最小列宽保护
- [ ] 6.6 扩展脚本断言 AC-D3（无课列 < 有课列、7 列之和 == 容器宽、无横向滚动）、AC-D4（收窄列表头两段文案完整且不裁字）、AC-D5（全空周不折叠）、AC-D6（持久化）

**门禁**：AC-D2 必须在接列模板**之前**单独通过一次；否则「关闭态零回归」无法与「开启态新逻辑」区分开。

---

## 阶段 7：规格与收尾

- [ ] 7.1 更新 `.trellis/spec/frontend/mobile-schedule-layout.md`：
      - 替换「1x 只改列宽、不改字号」相关的旧描述中与本次冲突的部分（缩放仍只改列宽；但**字号现在由格子尺寸推导**）
      - 新增「课程格尺度体系」小节：容器结构、`--cc-*` 清单、上限 15px 的用意（保证缩放仍能揭示信息）
      - 新增 D 组开关的契约（默认关闭、最小列宽保护、翻周列宽变化）
      - 把 `text-[Npx]` / `sm:` 加入 Common Mistakes
      - 把三条已知取舍写入
- [ ] 7.2 全量回归：`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`
- [ ] 7.3 真机/模拟器截图复核（AC-E4），把前后对比图存进 `research/`

---

## 验证命令汇总

```bash
pnpm test                                   # vitest 全量
pnpm test app/features/schedule/            # 只跑课表相关
pnpm typecheck                              # react-router typegen && tsc
pnpm lint                                   # eslint --max-warnings 0
pnpm format:check                           # prettier
node research/verify-responsive-sizing.mjs  # 浏览器多视口 AC（需 dev server 在跑）
```

---

## 评审门与回滚点

| 门 | 位置 | 判据 |
| --- | --- | --- |
| G1 | 阶段 1 末 | 公式单测全绿；组件未改 |
| G2 | 阶段 3 末 | `container-type: size` 未改变网格几何（对基线） |
| G3 | 阶段 5 末 | A/B/C 组 AC 全绿 |
| G4 | 阶段 6.4 末 | 关闭态 `grid-template-columns` 逐字符一致 |
| G5 | 阶段 7 末 | 全量命令绿 + 规格已更新 |

| 回滚点 | 覆盖范围 |
| --- | --- |
| 删除 `cellScale.ts` + 还原 `ScheduleCourseCell/ScheduleTable` | A / B 组 |
| 还原 `ScheduleHeader/SchedulePage` | C 组 |
| 关掉开关 / 还原 store 字段与列模板 | D 组 |

**禁止动作**：为了让 AC 通过而放宽断言；把 `container-type: size` 换成 `inline-size` 来躲开高度问题（会让 `cqh` 静默失效）；在组件里重新引入任何与格子尺寸无关的绝对字号。
