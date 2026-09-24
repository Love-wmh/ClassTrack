# 技术设计：课表尺度响应式化

> 对应 PRD：`prd.md`（A 组 = 尺度响应式化，B 组 = 空间自适应加固，C 组 = 断点统一，D 组 = 空列收窄开关）
> 证据：`research/real-device-analysis.md`

---

## 1. 方案总览

**核心决策：把「字号」从 JS 的测量结论里彻底拿出来，交给 CSS 容器查询单位计算；JS 只保留「哪些弹性行该丢」与「极端情况下的相对缩放」。**

```
改动前：字号 = f(isMobile 视口布尔值, 首帧实测高度)   ← 时序相关、与格子尺寸无关
改动后：字号 = clamp(下限, f(容器 cqw, 容器 cqh), 上限)   ← 纯 CSS，确定性
        JS   = 只决定「丢哪几行」+ 极端情况乘一个相对系数
```

这条分界线同时解决了三个 PRD 要求：
- **A1/A2（唯一真源 + 同尺寸同字号）**：`cqw`/`cqh` 就是格子尺寸本身，同尺寸必然算出同一个字号；不再是「测量后决定」。
- **B3（测量稳定）**：字形尺寸不再受测量时机影响。JS 只剩「整行显示 / 整行隐藏」这种二值决策，1px 抖动不会翻转结论。
- **A7（兜底是相对比例）**：兜底从 `字号 -= 1px` 改成 `字号 *= 0.9`。

---

## 2. 查询容器结构

```
[data-schedule-grid]                      ← container-type: inline-size（表头/节次列用）
  └ 课程格 wrapper（grid item，p-px border-r border-b）
        container-type: size               ← 课程格的查询容器（字号用）
        └ <button>                          ← 课程卡：内边距 / 描边 / 圆角 / 角标
              └ content span                ← flex-col items-center，承载内层文字块
```

**为什么容器放在 wrapper 而不是 button**：

`cqw` / `cqh` 解析的是查询容器的**内容盒**。如果 button 自己既是容器、又用 `cqw` 写自己的 `padding`，就出现「padding 依赖内容盒、内容盒依赖 padding」的自引用。把容器提到 wrapper（尺寸完全由网格决定，与内容无关），button 的内边距用 `cqw` 就变成「下一层引用上一层」，无环。

**为什么 grid 也是容器**：表头行与节次列不在课程格内，其 `cqw` 会向上找最近的查询容器；若 grid 不设容器，`cqw` 会静默回退到**小视口尺寸**——那是一个很难发现的错误来源。在 grid 上设 `container-type: inline-size` 后，表头/节次列拿到的是网格宽度，语义明确。

**`container-type: size` 的安全性**（必须在实现时验证）：

- wrapper 是 grid item，轨道是 `minmax(3.875rem, 1fr)`——min 是显式长度而非 `auto`，**轨道尺寸不取内容贡献**，因此 `contain: size` 不改变布局。
- wrapper 已有 `overflow: hidden`，与 `contain: size layout style` 不冲突。
- 同一行其他单元格的尺寸同样只由轨道决定，不会被某个格子的内容撑高。

> 风险等级：低。若实现时发现轨道高度被影响（例如某处 `minmax(auto, …)`），退回方案是在 wrapper 内再加一层占位容器。**这一条必须用浏览器实测确认，不能只靠推理。**

---

## 3. 尺度公式（单一真源）

新建 `app/features/schedule/cellScale.ts`，把常量与 CSS 值集中在一处：

```ts
/** 课程格尺度常量。CSS 变量字符串与 JS 参考实现都由这里派生，禁止在组件里另写数值。 */
export const CELL_SCALE = {
  /** 横向内边距：随格子宽度走，手机上从 6px 降到 ~3.3px，把宽度还给文字。 */
  padX: { cqw: 8, min: 2, max: 6 },
  padY: { cqh: 6, min: 2, max: 8 },
  /** 课名：clamp(8px, min(24cqw, 30cqh), 15px)。cqh 项是「又宽又矮」格子的兜底上限。 */
  name: { cqw: 24, cqh: 30, min: 8, max: 15 },
  /** 教室/教师/备注/单双周：比课名小一档，比值 ≈ 0.89，与现状 10/9 对齐。 */
  room: { cqw: 21.5, cqh: 27, min: 8, max: 12 },
  /** 描边：手机上 ≈ 2px，与现状 ring-2 对齐。 */
  ring: { cqw: 4.8, min: 1, max: 2 },
  badge: { cqw: 26, min: 10, max: 16 },
  radius: { cqw: 11, min: 3, max: 8 },
  /** 网格宽度相关的表头/节次列字号（相对 grid 容器）。 */
  head: { cqw: 3.4, min: 9, max: 12 },
  headSub: { cqw: 2.6, min: 8, max: 10 },
  sectionNo: { cqw: 4, min: 11, max: 14 },
} as const

/** 唯一的行高（PRD A5）：正常态与兜底态共用，比值恒定。 */
export const CELL_LINE_HEIGHT = { name: 1.15, room: 1.2 } as const

/** 兜底的相对缩放阶梯（PRD A7）：不再按 px 硬减。 */
export const CELL_FALLBACK_SCALES = [0.9, 0.8] as const
```

`cellScale.ts` 同时导出：

```ts
/** 挂到 [data-schedule-grid] 上的静态 CSS 变量；custom property 会继承到课程格。 */
export const cellScaleStyle: CSSProperties
/** 参考实现：给定容器内容盒尺寸，算出各字号，供单测断言「CSS 应当等于这个值」。 */
export function resolveCellScale(containerWidth: number, containerHeight: number): { name: number; room: number; ... }
```

**为什么把 CSS 值用常量拼出来**：CSS 与 JS 共用同一批数字，`resolveCellScale()` 就是 CSS 的可执行规格。单元测试断言公式（单调、上下限、比值），浏览器验收断言「CSS 实际值 == resolveCellScale()」，两侧不会漂移。

> 注意：`cq` 单位在**自定义属性**里不会被提前解析——自定义属性是不解析的 token。继承到课程格上，由 `font-size: var(--cc-name)` 在使用处替换并按**该课程的容器**解析。所以变量可以只声明一次在 grid 上。这个行为必须由 AC-A1 在浏览器里钉住（它是整套设计的地基）。

**地基假设的退路**：如果实测发现浏览器在**声明处**（grid）就解析了 `cq` 单位，那么表头会算对、课程格会全部拿到按网格宽度算的字号（课程格字号会明显偏大）。退路是把同一份 `cellScaleStyle` 从 grid 挪到**每个课程格 wrapper** 上（同一个字符串，改一行应用位置），表头/节次列另留一份挂在 grid 上。这个退路的成本极低，所以不需要在规划阶段先做实验——AC-A1 会在阶段 5 第一次运行时立刻暴露该假设是否成立。

### 3.1 手机上（360 CSS px 视口）的预期取值

容器内容盒（wrapper 内容盒 = button 边框盒）：横向 44.6 − 1（border-r）− 2（p-px）≈ **41.6px**；纵向 1 节 ≈ 59px、2 节 ≈ 121px。

| 量 | 计算 | 结果 | 现状 | 变化 |
| --- | --- | --- | --- | --- |
| 横向内边距 | 8cqw | 3.3px | 6px | **文字宽从 29.6 → 34.9px（+18%）** |
| 课名 | min(24cqw, 30cqh) | **10.0px** | 10px | 平价 |
| 教室 | min(21.5cqw, 27cqh) | 8.9px | 9px | 平价 |
| 描边 | 4.8cqw | 2.0px | 2px | 平价 |
| 角标 | 26cqw | 10.8px | 12px | 略小（12px 占列宽 27%，过大） |

内边距省下的 5.4px 直接让每行多放 ~0.5 个字，是「不加字号也能少换行」的免费收益。

### 3.2 极值校验

| 场景 | 容器宽 | 课名 | 每行字数 |
| --- | --- | --- | --- |
| 240px 视口（系统显示大小最大） | 12.1 → clamp 到 8px | 8.0px | 1.5 字（物理极限，见已知限制） |
| 360px（真机截图） | 41.6 | 10.0px | 3.5 字 |
| 412px | 49.6 | 11.9px | 4.2 字 |
| 480px | 60.7 | 14.6px | 4.2 字 |
| 2x 缩放（360px 视口） | 89 | **15.0px（上限）** | 5.9 字 → **行数下降、教师行放得下** |
| 桌面 ≥768px（min-w 760） | 96 | 15.0px（上限） | 6.4 字 |
| 桌面 1410px（max-w 上限） | 189 | 15.0px（上限） | 12.6 字 |

**上限 15px 是缩放仍能揭示更多信息的关键**（PRD AC-B2）：1x→2x 时字号只涨 1.5 倍，而列宽涨 2 倍，多出来的宽度全部变成「每行更多字 → 更少行 → 腾出高度给教师/备注」。如果上限跟着无限涨，2x 就退化成纯放大镜——这正是规格里明确禁止的行为。

---

## 4. JS 职责：`ScheduleCourseCell` 重写要点

### 4.1 删除的东西

| 删除项 | 原因 |
| --- | --- |
| `baseName = isMobile ? 10 : 14`、`baseRoom = isMobile ? 9 : 12` | 硬编码 px 兜底（PRD A7） |
| `name.style.fontSize / lineHeight`、`room.style.fontSize / lineHeight` 内联写入 | 字号改由 CSS 计算（PRD A1/A5） |
| `useIsMobile()` 及其在丢弃序列里的 `parity` 门控 | 判据改为「元素实际可见」（PRD B2） |
| `text-[10px]/text-[9px]`、`md:text-sm/md:text-xs` 与 `md:` 分支 | 两套硬编码值（PRD A1/A9） |

### 4.2 保留的东西

- 优先级丢弃序列：**备注 → 教师 → 单双周**（PRD B1/B3 不变）。
- 「每轮先清掉上一轮的内联覆盖」这条纪律，只是覆盖对象从 `fontSize/lineHeight` 变成 `display` 与 `--cc-scale`。
- 三次测量补拍（`apply()` + `requestAnimationFrame` + `fonts.ready`）与 `ResizeObserver` 观察 wrapper：**保留**，此时它们只影响丢行决策，不再影响字号。
- 直接写 `style`、不 setState（PRD B4）。

### 4.3 丢弃序列的可见性判据

`parity` 元素带 `md:hidden`（桌面端本就不可见）。原实现对手机端无条件把 parity 纳入序列；改为**只对实际可见的弹性行做决策**：

```ts
const visible = (el: HTMLElement | null) =>
  !!el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none'
```

先把三行恢复成 `display: block`，再逐个按优先级隐藏；`parity` 在桌面端因为 `md:hidden` 天然 `display: none`，会被自动跳过，不再需要 `isMobile`。

### 4.4 兜底：相对缩放

```ts
// 溢出量（px）；容差 1px 吸收亚像素误差。
const overflow = () => content.scrollHeight - content.clientHeight

for (const scale of CELL_FALLBACK_SCALES) {
  if (overflow() <= 1) break
  // 所有行同步缩放，保持行间层级（PRD A7）
  button.style.setProperty('--cc-scale', String(scale))
}
```

CSS 侧：`font-size: clamp(8px, calc(24cqw * var(--cc-scale, 1)), 15px)`。
**下限写在 clamp 的第一位**，所以缩放不会突破 8px——缩到下限还不够时**停止**，接受 PRD 里已确认的「极端情况允许纵向裁剪」这一已知限制。

每格最多 2 次额外 reflow，与现状（2 档缩字号 + 1 次宽度收窄）同量级。

### 4.5 内层文字块宽度：加回宽度校验

现状 `block.style.width = Math.ceil(used)px` **没有上限**，而 `overflow-wrap: break-word` 不降低 min-content，`(Python)` 这类不可断 token 会把块撑出内边距盒（已确认为真实缺陷）。

```ts
// 收窄到「最长行实测宽度」，但绝不越过容器（PRD A6）
block.style.width = `min(${Math.ceil(used)}px, 100%)`
// 宽度或高度任一不满足就退回整宽——宁可偏左，也绝不溢出
if (overflow() > 1 || block.scrollWidth > block.clientWidth + 1) block.style.width = ''
```

`100%` 相对 `content` 的内边距盒解析，因此 `(Python)` 会被 `break-word` 在词内断开（符合规格「宁可词内断，也不溢出被裁」），而块本身不会再越界。

> 待实现时用浏览器确认：`overflow-hidden` 的实际裁剪边界（padding box vs border box）。若确认按 padding box 裁剪，那么现状那 3px 只表现为「字形贴边」；无论结论如何，`min(…, 100%)` 都是必须加的那一道校验。

---

## 5. 表格头 / 节次列 / 断点统一

`ScheduleTable.tsx` 里 6 处 px 字号换成 grid 容器的 `cqw` 派生值（§3 的 `head` / `headSub` / `sectionNo`），手机端取值与现状基本平价（11.7 / 8.9 / 13.8 vs 11 / 9 / 14），但从此随网格宽度走。

- 表头行仍是 `2.25rem`，字号上限 12px 保证 `周一` + `09.28` 两行塞得进 36px。
- `ScheduleHeader.tsx` / `SchedulePage.tsx`：`sm:` → `md:`（PRD C1/C2）。顶栏控件尺寸 `h-9` / `size-4` **不动**（非内容尺度）。
- 缩放浮层（`size-6` / `size-3.5` / `min-w-7`）**不动**：它是固定 UI 控件，不属于课表内容尺度。

---

## 6. D 组：收起整周无课的日期列

**状态**：`useScheduleDisplayStore` 新增 `collapseEmptyWeekdayColumns: boolean`，默认 `false`，同时补 `partialize` 与 `merge`（三处都要改，漏一处就会在旧数据下丢值——这是 `state-management.md` 明确记录的坑）。

**判定**：以 `visibleCourses` 为准（开启「淡化显示非本周课程」时，非本周课也占格，算「有课」）。

```ts
const busyDays = new Set(visibleCourses.map(({ course }) => course.dayOfWeek))
const hasBusy = busyDays.size > 0
const hasEmpty = busyDays.size < 7
const collapse = collapseEmptyWeekdayColumns && hasBusy && hasEmpty   // D4：全空周直接不折叠
```

**列模板**（`grid-template-columns` 必须动态，走内联样式）：

```
关闭（= 现状，逐字符一致）：  2rem repeat(7, minmax(0, 1fr))        （≥768px 用 4rem）
开启：                        2rem minmax(1.75rem, 0.45fr) …        （有课列 = minmax(0, 1fr)）
```

- `minmax(1.75rem, 0.45fr)` 的 `1.75rem` 是最小列宽保护（D4/AC-D5）：即使所有列都分不到 fr，收窄列也不会窄过 28px。
- 手机上 2 列空时：有课列 52.9px（+18.6%），空列 23.8px，`周六`(11.7px) + `10.03`(8.9px) 都能放进 28px 最小宽 → AC-D4 成立。
- `data-day-head` 仍是 7 个、文案不变（D6）✓。
- 列宽随当前周变化（D5 的既定代价）→ 写进设置项说明文案。

---

## 7. 测试与守卫

| 层 | 手段 | 覆盖 |
| --- | --- | --- |
| 公式 | `cellScale.test.ts`：`resolveCellScale()` 单调性、上下限、课名/教室比值稳定 | AC-A2 / AC-A7 的公式侧 |
| 源码守卫 | `scheduleSourceGuard.test.ts`：读 `app/features/schedule/**` 源文件，断言无 `text-[\d+px]`、无 `sm:` | AC-A9 / AC-C1 |
| SSR 断言 | 扩充 `ScheduleCourseCell.test.ts`：容器类存在、`data-course-room` 存在、无 px 字号类 | AC-A6 / E1 |
| store | 扩充 `scheduleDisplayStore.test.ts`：默认 `false`、切换、`partialize` 白名单 | AC-D1 / AC-D6 |
| 浏览器 | 任务目录下脚本化 `agent-browser` 夹具（多视口 × 多格型遍历断言） | AC-A1/A3/A4/A5/A8/A10、AC-B1/B2/B3、AC-C2、AC-D2..D5 |
| 真机 | 360×794 CSS px 截图复核 | AC-E4 |

浏览器验收沿用规格里已有的种子数据法：`storage local set` → `reload`（**不能**直接 eval 写 localStorage，会被运行中的应用回写覆盖）。

---

## 8. 兼容与回滚

- **纯前端渲染层改动**，不涉数据 schema、不涉持久化迁移（D 组新增字段只落在独立的 `class-track-schedule-display` key 上，且 `merge` 带默认值兜底）。
- **回滚点**：A/B/C 组与 D 组各自独立可回滚——D 组关掉开关即逐字符回到现状；A/B/C 组回滚只需还原 3 个组件文件 + 删除 `cellScale.ts`。
- **已知取舍**（需写入 `mobile-schedule-layout.md`）：
  1. 1 节矮格 + 超长课名在物理上无解，接受「字号不低于 8px + 允许纵向裁剪 + 绝不水平溢出」。
  2. D 组开启后翻周列宽会变。
  3. 桌面端课名字号封顶 15px（防止大屏字巨大，代价是超宽屏下列宽会有富余）。

---

## 9. 实现顺序

1. `cellScale.ts` + 单测（先把公式钉住，再动组件）。
2. `ScheduleCourseCell.tsx` 重写（删硬编码字号 → 容器单位 → 相对兜底 → 宽度校验）。
3. `ScheduleTable.tsx`（grid 容器 + 表头/节次列 cq 字号 + 拆掉 `sm:`）。
4. `ScheduleHeader.tsx` / `SchedulePage.tsx` 断点统一。
5. 浏览器多视口回归 A/B/C 组 AC。
6. D 组（store → 设置项 → 列模板），先验「关闭态逐字符一致」再验开启态。
7. 更新 `mobile-schedule-layout.md`，补齐已知限制与开关说明。

---

## 10. 实现期对设计的偏离（逐条记录原因）

设计在实现过程中被四处修正。这里逐条记下**偏离了什么、为什么、证据在哪**，避免下次有人按旧描述改回去。

### 10.1 `--cc-scale` 与 `clamp()` 必须写在使用处（地基假设只成立一半）

设计 §3 断言「`cq` 单位在自定义属性里不会被提前解析，所以变量可以只声明一次在 grid 上」。

实测结论：**只对 `cq` 单位成立，对 `var()` 不成立**。

- `cqw` / `cqh` 是长度单位，写进网格声明的 `--cc-name` 后，会在**使用处**（课程格里的元素）按该元素的容器解析 ✓ 与设计一致。
- 但 `var()` 引用是在**声明它的元素**上就完成替换的。把 `var(--cc-scale, 1)` 写进网格上的 `--cc-name`，网格上没有 `--cc-scale` → 替换成 `1` 并被固化进继承值，课程格上后设的 `--cc-scale` 再也进不来。
- 浏览器实测：`--cc-scale: 0.8` 已写在按钮上（探针读到 `0.8`），但 computed `font-size` 完全没缩。

**修正**：网格只声明**不含缩放、不含钳位**的基础长度（`--cc-name-raw` = `min(24cqw, 30cqh)`），`clamp(8px, calc(clamp(8px, var(--cc-name-raw), 15px) * var(--cc-scale,1)), 15px)` 整串写在元素自己的 `font-size` 上。

守卫：`cellScale.test.ts` 的「参与缩放的尺度变量只给『不含缩放、不含钳位』的基础长度」「缩放与钳位写在元素自己的 font-size 上」两个用例。

### 10.2 钳位顺序：先钳、再乘、最后再夹

设计 §4.4 写的是 `clamp(8px, calc(24cqw * var(--cc-scale,1)), 15px)` —— 即「先乘后钳上限」。

实测缺陷：当基础长度已经超过上限时（大视口下的宽格子，`30cqh` 可达 18.6px），缩放会被上限吃掉——`18.6 × 0.9 = 16.7` 仍被钳回 `15`，兜底**完全失效**。

**修正**：改成嵌套 clamp「先钳到可读区间、再乘档位、最后再夹一次」。`resolveCellScale()` 同步改成 `clamp(min, clamp(min, base, max) * scale, max)`，两侧一致（这也是为什么浏览器断言当初没抓到这个偏差——参考实现与 CSS 同步地"错"了）。

### 10.3 课程格的查询容器要多一层 div，不能挂在已有的 wrapper 上

设计 §2 把容器放在「课程格 wrapper（grid item，`p-px border-r border-b`）」上。

实测缺陷：`cq*` 解析的是查询容器的**内容盒**，而 wrapper 的 `border-r` / `border-b` 是**逐格不同**的（最后一列、最后一行不贴边线）。于是最后一列的容器内容盒比其它列宽 1px（约 2.5%），同尺寸格子的字号立刻不一致 —— 直接违反 AC-A1。

**修正**：wrapper 拆成两层——外层是**无内边距、无边框**的 div（挂 `container-type: size`，内容盒恰好等于网格给它的那块区域），内层保留 `p-px` + 边线。多一层 div 的代价可忽略，换来的是「容器盒 = 网格盒」这个结构性保证，而不是靠运气。

守卫：AC-A1 按「容器内容盒宽 × 行跨度 × 档位」分组断言精确相等 —— 若有人把容器挪回带装饰的那层，最后一列会立刻以另一种字号暴露。

### 10.4 兜底阶梯粒度 0.1 → 0.05

设计 §3 给的是 `[0.9, 0.8]`（两档、0.1 粒度）。改成 `[0.95, 0.9, 0.85, 0.8, 0.75]`（五档、0.05 粒度）。

原因：兜底取的是「**刚好放得下**的第一个档位」，档位越粗，缩幅越可能远超实际需要，而超出的缩幅会直接变成用户看到的「同屏字号落差」——正是本次要修的症状。浏览器实测：412 CSS px 视口下 20 字课名在 0.05 粒度上落在 **0.95**（缩 5%，几乎看不出），在 0.1 粒度上会一路掉到 **0.8**（缩 20%）。

代价：每格最多多 3 次 reflow，且只在需要缩的格子上、同一帧内完成（不会画出中间态）。

### 10.5 内容顶部对齐（用户验收意见）

原实现用 `[justify-content:safe_center]` 垂直居中，导致 1 行内容的格子字浮在卡片中间、7 行内容的格子字贴着顶部，同一屏里每格的起始高度都不一样。

**修正**：改为 `justify-start`（顶部对齐）。溢出时内容向下溢出并被 `overflow-hidden` 裁掉，顶部始终可见——正好与已确认的已知限制一致。

守卫：AC-A8b（`contentTopGap ≈ buttonPaddingTop`，±1px）。

### 10.6 单双周的可见性改为纯 CSS，不再由视口布尔值门控

设计 §4.3 设想用 `getComputedStyle(el).display !== 'none'` 来跳过桌面端的单双周徽标。实际做不到：该元素的 class 本来是 `hidden … md:hidden`（自然态恒为 `display: none`），手机端可见是靠 JS 强制写 `display: block`，而内联样式会连 `md:hidden` 一起压过 —— 于是「按 computed display 判定」永远判不出桌面端。

**修正**：把它的自然态改成 `block md:hidden`（手机端可见、桌面端 `display: none`），断点可见性完全交给 CSS；JS 只在空间不够时写 `display: none` 把它关掉。这样判据里既不需要 `isMobile`，也不需要探测 computed display。

### 10.7 Tailwind 只扫描字面类名

字号类最初用 `toFontClass('name')` 在运行时拼出来（数值与常量真正同源），实测 **Tailwind 不生成规则**，computed `font-size` 直接回落到浏览器默认 `16px`、行高 `1.5`。

**修正**：两串类名写成**字面量**，同时由 `cellScale.test.ts` 的形状断言（用常量拼出正则后 `toMatch`）保证「改常量不改类名」会失败。

### 10.8 缩放浮层读数 `text-[10px]` → `text-xs`

`app/features/schedule/**` 内最后一处 `text-[Npx]`。它与课表内容尺度无关（是固定尺寸控件），但为了让 AC-A9 的源码守卫能对**整个目录**生效（而不是靠排除清单），顺手改成 `text-xs`（12px），并与应用其它 `text-xs` 小字一致。
