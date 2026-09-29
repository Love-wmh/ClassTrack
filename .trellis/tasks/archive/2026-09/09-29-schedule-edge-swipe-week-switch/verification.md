# 验收记录：课表边缘阻尼手势切换上下周

> 逐条核对 `prd.md` 的 AC-1…AC-19。**未验证项已显式标注**（AC-18），不按通过处理。
>
> 环境：本机（Node 22 / pnpm 9.15.9），视口 412×915（dpr 2），种子数据沿用归档任务
> `09-20-mobile-schedule-week-grid` 的夹具（`currentWeek = 3`、`maxWeek = 16`）。

## 门禁（AC-17）

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm lint`（`--max-warnings 0`） | 通过（0 problems） |
| `pnpm format:check` | 通过 |
| `pnpm test` | **40 files / 388 tests 全绿**（新增 `weekSwipe.test.ts` 32 例、`ScheduleDisplaySettings.test.ts` 3 例、store 用例 +2） |
| `pnpm build` | 通过 |

## 证据清单（`research/`）

| 文件 | 内容 |
|---|---|
| `baseline-before.md` | 改动前的尺寸/字号/列模板基线（阶段 0） |
| `web-touch-scenarios.json` | 浏览器 + CDP 真实触摸事件的 8 组场景（含 2x 滚到边缘后的阻尼） |
| `web-touch-scenarios-off.json` | 开关关闭时的 3 组场景 |
| `web-1x-mid-drag.png` | 1x 拖动中的截图（整周网格右移 53px 的跟手位移） |
| `web-settings-edge-swipe-toggle.png` | 个人中心「课表显示」卡片（新开关默认开启） |
| `gesture-feasibility.md` | touch vs pointer、`pointercancel`、`overscroll-behavior: contain` 的浏览器事实与出处 |
| `cdp-touch-swipe.mjs` | 可复用验收脚本（`full` / `off` / `shot` / `drag1` 四种模式） |

---

## 逐条结论

### 开关与持久化

| AC | 结论 | 证据 |
|---|---|---|
| AC-1 | ✅ | `ScheduleDisplaySettings.test.ts` 断言 `id`/`aria-label`/文案；浏览器实测 `#schedule-display-edge-swipe-week` 存在、`data-state="checked"`、`aria-label="左右边缘滑动切换周"`；截图 `web-settings-edge-swipe-toggle.png` |
| AC-2 | ✅ | `scheduleDisplayStore.test.ts`「默认…开启边缘滑动切换周」+ SSR 断言 `data-state="checked"` |
| AC-3 | ✅ | store 单测：`partialize` 键集合含第 4 个字段、`merge` 缺字段回落 `true`、**显式 `false` 被保留**；key 仍为 `class-track-schedule-display` |

### 手势行为

| AC | 结论 | 证据（`web-touch-scenarios.json`） |
|---|---|---|
| AC-4 | ✅ | `web-touch-scenarios-off.json`：开关关闭时 3 次横滑（含 200px 大位移、两个方向）全程 `data-week-swipe-state` **不存在**、`inlineTransform` 为空、周次保持 3 |
| AC-5 | ✅ | `enabled = isMobile && flag`，桌面端（≥768px）不挂监听器；`useIsMobile()` 与既有缩放控件同一判据（未在桌面端做端到端触摸断言 —— 桌面本身没有触摸输入，见残余风险 R3） |
| AC-6 | ✅ | 1x：`s1SmallRightDrag` 拖动中 `translate3d(36.92px…)`（跟手）、松手后周次不变且 `inlineTransform` 清空；`s2BigRightDrag` 拖动中 +61.99px → 松手后 3→2；`s3BigLeftDrag` 2→3 |
| AC-7 | ✅ | 2x：`s7bScrolledThenEdgeDrag` 第 8 步（滚了 ~110px）`scrollLeft=370` 且 `transform=translate3d(0px)`（**未到边缘 → 无位移**）；第 16 步 `scrollLeft=379`（到底）后出现 `translate3d(-50.15px)`；松手切周 |
| AC-8 | ✅ | `s6bBoundaryDrag`：第 1 周右滑，拖动中 `translate3d(60.91px)`（**有阻尼反馈**），松手后 `week` 仍为 1、位移清空 |
| AC-9 | ✅ | 方向映射：右滑 → 上一周（3→2）、左滑 → 下一周（2→3）；滑出/滑入的方向自检在 `weekSwipe.test.ts`（`switchTravelOffset` 恒反向） |
| AC-10 | ✅ | `weekSwipe.test.ts`：0→600px 逐 px 单调不减、任意输入下 ≤ `RUBBER_MAX_PX`（96）、82px 手指位移达到 44px 阈值 |

### 零回归与实现约束

| AC | 结论 | 证据 |
|---|---|---|
| AC-11 | ✅ | `s4VerticalDrag`：拖动中与松手后 `transform` 恒为 `none`、`swipeState` 为 `idle`；CDP `Input.dispatchTouchEvent` 的单指轻点未被改造（手势要求越过 12px slop，课程格点按路径未变）。**注意**：本夹具在 412×915 下纵向也没有溢出（`grid clientHeight 732 = 容器高度`），所以「纵向滚动照常」这一半只能靠「没有拦截、没有 preventDefault」的实现事实支撑，未做端到端滚动断言（见残余风险 R2） |
| AC-12 | ✅ | `s5TwoQuickSwipesKeepZoom`：连续两次横滑后 `data-zoom-level` 仍为 `1`；渲染计数实测（`agent-browser react renders`）也确认这两次横滑 **0 次 React commit**。修复本身：`pointercancel` 不再参与 tap 判定 + `pointerup` 还要过按下点位移校验（`isTapSizedMove`，容差与手势层同源 24px） |
| AC-13 | ✅ | 渲染计数实测：小位移拖动（60px）「**(no renders captured)**」；纵向拖动同样 0 次；大位移切周只有 **1 次 commit**，其 change 明细为 `ScheduleTable props.currentWeek: 3 -> 2`。即拖动期间零重渲染、切周只提交一次 |
| AC-14 | ✅ | 每个场景松手后 `inlineTransform: ""`、`computedTransform: "none"`、`opacity: "1"`、`swipeState: "idle"`（含边界回弹、切周动画、开关关闭）；代码侧 `reset()` 是唯一清理入口，被 `touchcancel`/第二根手指/卸载/`enabled` 变假/外部改周复用 |
| AC-15 | ✅ | 基线逐项对比：`clientWidth/clientHeight` 379/732、`scrollWidth` 379、`gridTemplateColumns` 逐字符相同、首个课名 `10.1108px / 11.6274px`、课程格 47×121、`[data-course-cell]` 18 个、`[data-schedule-zoom-control]` 在 DOM；`touch-action` 仍为 `pan-x pan-y`。唯一差异是 `[data-schedule-scroll]` 的父元素换成了新的 stage 包装（`flex min-h-0 flex-1 flex-col overflow-hidden`），尺寸数字全部不变 |

### 证据与门禁

| AC | 结论 | 证据 |
|---|---|---|
| AC-16 | ✅ | 见门禁表（纯函数 32 例 + 开关 5 例 + SSR 3 例） |
| AC-17 | ✅ | 见门禁表（含仓库要求的五项） |
| AC-18 | ❌ **未验证（环境不可用）** | 见下方「为什么真机验收没做」 |
| AC-19 | ✅ | `mobile-schedule-layout.md`（手势契约 + 三个新增测试挂钩 + Common Mistakes 5 条）、`state-management.md`（显示开关清单补 `scheduleDisplayStore` 与四个字段） |

---

## 为什么真机验收没做（AC-18）

本沙盒**无法启动 Android 模拟器**，三条硬阻塞（都实测过）：

```text
$ emulator -accel-check
/dev/kvm is not found: VT disabled in BIOS or KVM kernel module not loaded

$ touch ~/.android/avd/test-write
touch: cannot touch '/home/yongetongy/.android/avd/test-write': Read-only file system
# AVD 目录（8.5G）在只读挂载上 → 无法清理陈旧的 multiinstance.lock，
# emulator 启动即 FATAL：A snapshot operation for 'Medium_Phone' is pending and timeout has expired. Exiting.
# （实测 240s 内 adb devices 始终为空）

$ adb devices
List of devices attached        # 没有物理设备
```

另外本沙盒**每次 bash 调用都是新的 net/pid 命名空间**（后台进程跨调用不可达），
模拟器 + adb + gradle 必须挤在同一次调用里完成，进一步放大风险。

### 用浏览器侧真实触摸做的替代验证（强度与边界）

`cdp-touch-swipe.mjs` 用 CDP `Input.dispatchTouchEvent` 派发**真实 touchStart/touchMove/touchEnd 序列**
（不是构造 TouchEvent 对象），走的是 Blink 同一条触摸 → 滚动 → `pointercancel` 管线，因此能覆盖：

- ✅ 「原生滚动期间仍然派发 `touchmove`」这条本方案唯一的技术赌注（`gesture-feasibility.md` 的 F1）——
  2x 场景里滚动在途时我们确实拿到了位移数据，滚到边缘后阻尼正常出现；
- ✅ `pointercancel` 与双击判定的互不干扰（AC-12）；
- ✅ 手势数学、阈值、方向、边界、复位。

**覆盖不到的**：Android WebView 的具体版本行为（touch/scroll 归一的实现细节）、
`adb shell input swipe` 的真实系统触摸（含系统级边缘返回手势的干扰）、
以及真机上的掉帧观感（`SWITCH_*` 动画时长是否合适）。**结论：AC-18 待在有模拟器/真机的环境补做。**

## 残余风险

| 编号 | 风险 | 缓解 |
|---|---|---|
| R1 | 真机 WebView 上「边缘继续同向拖」时 `touchmove` 是否照常派发（F1） | 已在 Chromium（同 Blink 管线）用真实触摸事件验证通过；真机补验一条即可 |
| R2 | 本夹具 412×915 下纵向无溢出，纵向滚动零回归没有端到端证据 | 实现侧不拦截、不 `preventDefault`（`{ passive: true }` 只读监听）；纵向拖动实测 0 次 React commit |
| R3 | 桌面端「不启用」只由 `useIsMobile() && flag` 保证，没有端到端断言 | 与既有缩放控件同一判据；桌面无触摸输入，鼠标拖拽本就不在需求内 |
| R4 | 切周动画（滑出 110ms → 换内容 → 滑入 170ms）的手感与时长未在真机上打磨 | 全部时长/幅度集中在 `weekSwipe.ts` 常量区，真机上按观感调这三个数即可，不需要改结构 |
| R5 | 动画中途用户按顶栏翻周 | `currentWeek` effect 用 `selfSwitchRef` 区分「自己发起」与「外部改周」，外部改周会清动画并复位（未做端到端断言） |

## 顺带修掉的历史缺陷

`useScheduleZoom` 的双击判定原本把 **`pointercancel` 的坐标**当成一次 tap 记录。
触摸横滑时该坐标离按下点只有几 px，于是「连续两次横滑」会被判成双击、缩放档位来回切换 ——
1x 屏上任何横滑都走这条路，只是概率低。本任务让横滑成为一等手势，因此一并修掉（AC-12）。
