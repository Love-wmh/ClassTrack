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
| 行高 | `grid-rows-[2.25rem_repeat(12,minmax(3.875rem,1fr))]`：每节 ≥3.875rem（412×915 下每节 62px、二连节格子 121px），再往下会被内容最小高度顶住；**改上下内边距后必须复核超长课名格是否被迫缩字号** | 同左 |
| 页面内边距 | `px-2`（保证 360px 视口仍有 44px 列宽） | `sm:px-5` |
| 课名行数 | 不截断（任何端都无 line-clamp）；用 `break-words`（**不是** `break-all`）：超宽拉丁串（如 `（Python）`）按需词内断开，宁可词内断也不溢出被裁 | 同左 |
| 文字块对齐 | **文字块整体在卡片里居中、块内文字仍左对齐**：内层块由实测收窄到「最长行宽」，外层 `items-center` 居中（实测 46.6px 卡片 → 块 30px、左右各 8.3px）。**不要**用 `text-center` 逐行居中 | 同左 |
| 教室 | 恒显（**无 `@` 前缀**：课名纯白加粗、教室小一号白色 85%），不截断；`break-words` 让断点落在连字符后（`28-` / `A203`），`break-all` 会切断数字（`28-A20` / `3`） | 同左 |
| 教师 | 由格子**实测内容高度**决定：放得下就整行显示（1x 手机的二连节格子通常放得下），放不下整行隐藏 | 同左 |
| 备注 | 同「教师」，且优先级最低：空间不够时第一个被丢弃 | 同左 |
| 格子视觉 | **照参考图逐像素采样的 8 组平色** + 纯白字 + **半透明白描边**：`courseColors` = 薄荷 `#87e5d4`／青蓝 `#7bb7ef`／紫蓝 `#84aef7`／藕荷紫 `#bcaaf5`／玫瑰 `#ee7c9b`／浅粉 `#e7a0b3`／珊瑚 `#e98d78`／金橙 `#eab776`（参考图本身即平色、无渐变）；描边 `ring-2 ring-white/55 ring-inset` —— **必须半透明**，纯白内描边会被看成「卡片被缩小」；上下内边距 `py-1 md:py-2` | 同左 |
| 非本周课 | 由该课自身颜色**推导**的淡化色（`courseOutOfWeekColors`：色相不变、HSL 亮度 +0.067、饱和 ×0.42；回代参考图样本 `#eab776 → #d4c3ae` 精确成立），不用固定灰卡 / opacity | 同左 |
| 网格线 | 所有行/列连续细线：空格与**有课程的格子容器都贴 `border-r`/`border-b`**，课程卡以 `p-px` 内缩 1px 落在线格上；最右列/最末行不贴边线 | 同左 |
| 出勤痕迹 | 右下白色图标（已上打勾 / 未上警示）+ 未上 `opacity-60 saturate-50`。**两层开关都要满足**：个人中心「出勤统计」已开启（能力层）**且**「课表显示 → 在课表上显示出勤状态」没被关掉（显示层）；非本周课不叠加出勤痕迹（灰色态优先） | 同左 |
| 信息显隐优先级 | 课名 > 教室（这两行是硬要求，**永不丢弃**）> 单双周/「非本周」标签 > 教师 > 备注；丢弃顺序反向，且只整行隐藏、不裁半截 | 同左 |
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

- **缩放只改列宽，不改字号**。列变宽 → 同样文字换行更少 → 长课名占的行数下降 → 腾出的行高容纳教师/备注。任何等比缩放（CSS `zoom`、`transform: scale`）换行位置不变，等于纯放大镜，**不要**改成那种实现。
- 档位（`compact` / `standard` / `full`）仍是离散吸附：`snapZoomTier` 在 <1.35 → `compact`、<1.9 → `standard`、其余 `full`。但**档位不再驱动内容显隐**（2026-09-24 起）：显示到哪一级由下面的「空间自适应」实测决定，档位只作为 `data-zoom-tier` 这类观测锚点保留。
- 缩放值不持久化，进页面固定 1x：避免用户上次放大后误以为课表只有三天。

## 空间自适应（内容显隐怎么决定）

**不要**用高度阈值（`[@container(min-height:…)]:` 之类）决定教师/备注显隐：Tailwind v4 不支持高度条件任意变体，生成的 CSS 里根本没有 `@container` 规则，等于这些行永远不显示；而且同一个高度下，20 字课名要占 7 行、3 字课名只占 1 行，阈值本身也区分不出来。

`ScheduleCourseCell.tsx` 的实际做法是在 `useLayoutEffect` 里**实测一次**内容高度，按优先级逐级丢弃：

1. 先把可选的三行（单双周/「非本周」标签、教师、备注）都置为 `display: block`；
2. 若 `content.scrollHeight > content.clientHeight`，按 **备注 → 教师 → 单双周标签** 的顺序把整行设为隐藏，每丢一行重新判断，直到放得下；
3. 丢完仍放不下（典型场景：只有一节的矮格子遇上超长课名）则进入兜底：把课名与教室的字号连同行高一起收小（最多两档，手机 10→8px、桌面 14→12px），保证这两行完整。

实现约定：

- 直接写 `style.display` / `style.fontSize`，**不要** setState —— 测量与渲染不会互相触发，也不会每格多渲染一次。
- 每轮 apply 先清掉上一轮的内联覆盖，否则 `md:hidden` 一类断点规则会被残留的内联样式压住（单双周标签就是靠 `md:hidden` 在桌面端隐藏的，只在手机端参与丢弃序列）。
- 依赖 `ResizeObserver` 观察**外层格子按钮**（尺寸由网格与缩放决定，内容变化不会改动它）来在缩放 / 旋屏 / 窗口变化后重测；观察内容元素本身会因为自身尺寸变化互相触发。
- 实测口径：`content.scrollHeight <= content.clientHeight + 1`（1px 亚像素容差）。
- **首帧一次测量不够**：挂载那一刻网格行高还没被 `1fr` 分配定稿（量到的是内容自然高 → 误判「放得下」），中文字体也可能晚到改变换行——两者都不会触发按钮尺寸变化，`ResizeObserver` 不会补跑。因此 `apply()` 之后必须在 `requestAnimationFrame` 与 `document.fonts.ready` 各补测一次（否则长课名格溢出被裁）。
- 文字块居中：每轮实测「最长行宽」，把内层块 `style.width` 设为该宽度（`Math.ceil`），外层 `items-center` 负责居中；收窄后若 `fits()` 变 false（换行变多）则把宽度还原成整宽，**宁可偏左也不裁字**。

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
| `data-course-out-of-week` | 非本周课程块 | 判定「淡化显示非本周课程」是否生效、灰色态是否渲染 |
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
# 种子数据走 storage 通道并紧跟 reload：直接 eval 写 localStorage 会被已启动的 app 回写覆盖
SEED=.trellis/tasks/archive/2026-09/09-20-mobile-schedule-week-grid/research/seed-schedule-fixture.js
node -e 'const fs=require("fs");const s={};new Function("localStorage",fs.readFileSync(process.argv[1],"utf8"))({setItem:(k,v)=>s[k]=String(v),getItem:()=>null});fs.writeFileSync("/tmp/claude/seed.json",s["class-track-storage"])' $SEED
agent-browser storage local set class-track-storage "$(cat /tmp/claude/seed.json)"
agent-browser reload
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
- 用高度阈值（容器查询类）决定教师/备注显隐：Tailwind v4 不生成 `@container` 规则，表现为「教师与备注永不出现」（桌面端干净加载时最明显）。
- 把课名或教室放进可丢弃序列换空间：这两行是硬要求，只能丢别的行、或走兜底缩字号。
- 用 `agent-browser eval` 直接写 localStorage 灌种子数据：正在运行的应用会把它的内存状态回写覆盖，必须先 `storage local set` 再 `reload`。
- `agent-browser open` 的 `--init-script` 只在**启动浏览器那一次**生效：`set viewport` / 先 `open` 不带 flag 都会提前启动浏览器，之后再加 flag 一律被忽略。
- 课表配色迭代四连坑（2026-09-24 真机连续反馈）：① Tailwind `400→500` 高饱和渐变太艳；② 换参考图中间调后白字小行在浅底上糊、且相近色相（深绿/浅绿）分不清；③ pastel 浅底 + 同色相 700 深色课名被否（课名要纯白）；④ 文字阴影显脏被否。**定稿：平色中间调（无渐变）+ 纯白字 + 色相间隔 ≥30°**。
- 有课程的格子不贴网格线会让整表「线断断续续」：课程格容器必须与空格一样贴 `border-r`/`border-b`，课程卡靠 `p-px` 内缩进线格，而不是省略边线。
- 用 `text-center` 给课名逐行居中：长课名每行都居中会左右跳动、更难读。要的是**块居中 + 块内左对齐**（收窄内层块宽度，由外层居中）。
- 用纯白内描边（`ring-white` / `ring-white ring-inset`）做「参考图同款白边」：白底页面上看不出是描边，只会觉得卡片被缩小了 2px。必须用**半透明白**（`ring-white/55`），让描边压在卡片色上成一层浅色边。
- 自己推配色（HSL 调亮度 / 加灰罩 / 加遮罩层）：真机口径是「照参考图逐像素采样」。HSL 取色会出现黄亮紫暗；DOM 遮罩会把白字一起压灰。**正确做法：对参考图卡片做连通域采样取中位色，直接用采样 hex（平色、无渐变）**。
- 用 `break-all` 处理课名/教室：会把数字与拉丁词切断（`28-A20` / `3`、`Pyth` / `on`）。课名与教室都用 `break-words`。
- 加完上下内边距后不动脑子上线：内容高度预算是固定的，`py` 每加 2px 就可能让 24 字超长课名格掉进「缩字号」兜底——改完必须复测 `shrunk` 计数。
