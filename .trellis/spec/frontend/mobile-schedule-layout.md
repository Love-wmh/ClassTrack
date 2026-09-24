# Mobile Schedule Layout

> 手机端（<768px）课表的布局契约：整周自适应铺满、信息分级、节次时间推导与 1x~2x 缩放。

---

## Overview

课表是唯一需要在手机上“一次看全一周”的页面，但 7 列 × 12 节的网格在 400px 左右宽的屏幕上天然拥挤。本文件固定这套取舍：**宽度优先给整周可见，信息按缩放分级展开**，桌面端（≥768px）保持原有网格不动。

相关代码：`app/features/schedule/ScheduleTable.tsx`、`ScheduleCourseCell.tsx`、`SchedulePage.tsx`、`hooks/useScheduleZoom.ts`、`utils.ts`、`constants.ts`。

---

## Layout Contract

| 能力 | 手机端 (<768px) | 桌面端 (≥768px) |
| --- | --- | --- |
| 网格最小宽度 | `min-w-[calc(100%*var(--schedule-zoom,1))]`（1x 时恰好等于容器宽度） | 保持 `md:min-w-[760px]` |
| 网格列 | `grid-cols-[2rem_repeat(7,minmax(0,1fr))]` | `md:grid-cols-[4rem_repeat(7,minmax(0,1fr))]` |
| 行高 | `grid-rows-[2.25rem_repeat(12,minmax(2.75rem,1fr))]`（视口过矮时竖向滚动） | 同左 |
| 页面内边距 | `px-2`（保证 360px 视口仍有 44px 列宽） | `sm:px-5` |
| 课名行数 | 不截断，块内自然换行、超出块高被裁剪 | `md:line-clamp-2` |
| 教室 | 仅 ≥1.5x | 一直显示 |
| 教师 / 备注 | 仅 2x | 教师不显示、备注保持现状 |
| 节次列时间 | 显示（节号 + 最多两行时间） | 不显示（只有节号） |
| 节次列表头 | 月份（如 `9月`） | `节` |
| 缩放 | 1x / 1.5x / 2x，双指捏合 + −/+ 按钮 + 双击 | 不启用 |
| 顶栏控件尺寸 | 一律 `h-9`（36px），图标 `size-4`；上一周/下一周与「添加到桌面」为 `h-9 w-9` 图标按钮 | 同左，`sm:flex` 单行排布 |

顶栏（`ScheduleHeader.tsx`）曾经用 `h-10`（40px）+ `size-5` 图标，2026-09-20 按产品要求整体压到 `h-9` / `size-4`，为「添加到桌面」入口腾出同一行的位置：手机端左侧动作组是 `grid-cols-[2.25rem_2.25rem_1fr_1fr_2.25rem]`（两个翻周图标 + 全部已上/全部未上 + 添加到桌面），右侧是 `grid-cols-2`（第 N 周 / 返回本周）。**新入口必须留在左侧动作组内**：塞进右侧那两列网格会让它换行成第三行，顶栏反而变高（真机截图确认过）。可访问性标签（`aria-label="上一周"` 等）保持原样，是自动化定位这些控件的唯一稳定锚点。

**顶栏列数随「出勤统计」开关变化（2026-09-24 起）**：「全部已上 / 全部未上」与它们共用的确认弹窗只在个人中心打开出勤统计时渲染。手机端左侧动作组因此有两套列数：开启时 `grid-cols-[2.25rem_2.25rem_1fr_1fr_2.25rem]`（上一周 / 下一周 / 全部已上 / 全部未上 / 添加到桌面），关闭时 `grid-cols-[2.25rem_2.25rem_2.25rem]`（上一周 / 下一周 / 添加到桌面）—— 少掉两个按钮还留着 `1fr` 空洞会让顶栏看起来断裂。两条分支都由 `ScheduleHeader.test.ts` 的 SSR 断言钉住。

**响应式断点统一用 `md:`（768px）**，与 `useIsMobile()`（`max-width: 767px`）保持一致。历史代码里的 `sm:` 前缀（640px）会让 640–767px 的窄平板出现“网格按手机、单元格按桌面”的割裂，改动时一并统一到 `md:`。

---

## Zoom Tiers and Information Levels

```ts
export const ZOOM_TIERS = [1, 1.5, 2] as const
export function getDetailLevel(zoom: number): 'compact' | 'standard' | 'full'
```

- **缩放只改列宽，不改字号**。列变宽 → 同样文字换行更少 → 长课名占的行数下降 → 腾出的行高容纳教室/教师。任何等比缩放（CSS `zoom`、`transform: scale`）换行位置不变，等于纯放大镜，**不要**改成那种实现。
- 档位是离散的，松手后必须吸附到 `ZOOM_TIERS` 之一（`snapZoomTier`），信息分级才有确定触发点：<1.35 → `compact`，<1.9 → `standard`，其余 `full`。
- 缩放值不持久化，进页面固定 1x：避免用户上次放大后误以为课表只有三天。

---

## Gesture Implementation

`useScheduleZoom()` 的约定：

- 手势期间**不 setState**：直接写 `--schedule-zoom` CSS 变量（只触发样式重算），并按捏合中心补偿 `scrollLeft`；松手才 `setZoom(snapZoomTier(...))` 提交一次，避免每帧重渲染 7×12 网格。
- 只改宽度的实现依赖 `min-width: calc(100% * var(--schedule-zoom))`：`var` 为 1 时恰好不溢出，这是「1x 无横向滚动」的机理，下界必须精确等于 1（`ZOOM_MIN`）。
- 滚容器必须有 `[touch-action:pan-x_pan-y]`：排除 WebView 自带的 pinch-zoom，同时保留单指滚动。
- 双指手势外，触摸端的双击用两次 `pointerup` 的间隔与位移自行判定（部分 WebView 不派发 `dblclick`）；鼠标走 `onDoubleClick`。
- `setPointerCapture` 必须包 try/catch：合成的 pointer 事件（自动化断言）没有真实指针，捕获会抛异常，但不影响手势本身。
- **双击切换必须去抖**：Android WebView 实测会在第二次抬起后同时派发我们自己的 `pointerup` 判定与浏览器合成的 `dblclick`，两条都触发就会切换两次、相互抵消（表现为“双击没反应”）。`toggleZoom` 用 400ms 窗口内的第二次调用直接返回。
- 缩放控件用 `isMobile &&` 条件渲染而不是 `md:hidden`：桌面端要求“不渲染”（见 PRD D6），仅靠 CSS 隐藏会让 `document.querySelector('[data-schedule-zoom-control]')` 仍然命中。

**在模拟器上验证触控**（真机行为只有真机才验得出来）：

```bash
# 1) 打开 App 后取 WebView 的 devtools socket 并转发（App 重启后 socket 名会变）
SOCK=$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote[^ ]*' | head -1 | tr -d '\r')
adb forward tcp:9222 localabstract:$SOCK
# 2) 用 CDP 灌 localStorage（复用 research/seed-schedule-fixture.js）后 Page.reload
# 3) 用 CDP Input.dispatchTouchEvent 派发双指手势；用 adb shell input tap 验证真实点按
#    注意 adb input tap 用的是设备像素：CSS px × devicePixelRatio（Medium_Phone 上是 2.625）
```


---

## Section Time Derivation

解析数据只有块级时间（`KSSJ`/`JSSJ` 对应 `KSJC → JSJC`），没有单节作息表：

```ts
export function deriveSectionTimes(classes: Class[]): Record<number, SectionTime>
```

- 单节课程同时贡献该节的 `start` 与 `end`；跨节课程只在首节贡献 `start`、末节贡献 `end`。
- 同一节次多候选取众数，票数相同取字典序最小 —— 结果与课程数据顺序无关。
- **输入用整个学期的 `classes`**（在 `SchedulePage` 里 memo），而不是仅本周的课程，这样只在其他周出现的节次也有时间。
- 已知限制：2 节块的节中空档（如 `08:45`/`08:55`）无法还原，节次列只显示可推导的起止点，不显示时段文案不存在的节次留空行。

---

## Test Hooks

自动化验证依赖这些属性，**不要静默移除**（用属性定位，不要用中文文案或 `:nth-child`，文案会改写、列顺序会被响应式调整）：

| 属性 | 位置 | 用途 |
| --- | --- | --- |
| `data-schedule-scroll` | 课表滚动容器 | `scrollWidth === clientWidth` 判定无横向滚动；`containerProps` 挂在它上面 |
| `data-schedule-grid` | 内层网格 | 读 `min-width` 计算值、定位网格 |
| `data-zoom-level` / `data-zoom-tier` | 内层网格 | 当前档位与信息分级 |
| `data-day-head` | 日期表头单元格 | 读列宽、确认 7 列都在视口内 |
| `data-section-row` | 节次行单元格 | 读节号与时间文案 |
| `data-course-cell` | 课程块按钮 | 点击回归、读字号是否随缩放变化 |
| `data-course-name` | 课名元素 | `textContent` 完整且 `webkit-line-clamp: none` |
| `data-course-parity` | 单双周徽标 | 1x 可见、桌面端不渲染 |
| `data-schedule-zoom-control` | 缩放浮层 | 手机端在、桌面端不在 DOM |

---

## Verification Recipe

```bash
export XDG_RUNTIME_DIR=/tmp/claude/ab-runtime   # /run/user/1000 是 ro 挂载，agent-browser 建不了 socket
mkdir -p "$XDG_RUNTIME_DIR" /tmp/claude          # TMPDIR=/tmp/claude 不存在时 pnpm 直接崩
pnpm dev &                                       # 后台进程不能跨 bash 调用存活，必须与浏览器操作同一次调用
agent-browser open http://localhost:5173/
agent-browser set viewport 412 915 2
# 写入种子数据后必须重新 open（zustand persist 只在模块初始化时读取）
agent-browser eval --stdin < .trellis/tasks/09-20-mobile-schedule-week-grid/research/seed-schedule-fixture.js
agent-browser open http://localhost:5173/
# dev server 首次访问按需编译，必须轮询等 [data-course-cell] 出现再断言
agent-browser eval "String(document.querySelectorAll('[data-course-cell]').length)"
```

`agent-browser eval` 只可靠返回字符串：返回对象会显示成 `null`，断言脚本必须以 `JSON.stringify(...)` 结尾。

---

## Common Mistakes

- 把手机端的 `min-w-[760px]` 加回来（哪怕只在某个断点）：1x 立刻失去整周可见。
- 给手机端课名加 `line-clamp-*`：这是本次专门去掉的截断。
- 用 `sm:` 而不是 `md:` 写移动优先类：与 `useIsMobile()` 的 768px 边界割裂。
- 在 `zoom` 状态下每帧 `setState`，或在手势里用 React state 驱动 `--schedule-zoom`：WebView 掉帧。
- 把节次时间渲染进课程块：用户明确要求时间只在最左列。
- 用 `textContent.includes('课程名')` 定位课程块做断言：课程名会被改写，应改用 `data-course-*` 属性。
